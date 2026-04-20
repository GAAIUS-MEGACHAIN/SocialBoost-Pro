"""Reseller public API (v2). Uses `X-Api-Key` header (or `key` query/body param)
compatible with standard SMM panel API convention. Also exposes actions via a
single POST /api/v2 endpoint for wide reseller-bot compatibility.
"""
import uuid
import secrets
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List

from .db import get_db
from .models import now_utc


router = APIRouter(prefix="/api/v2", tags=["reseller-api"])
keys_router = APIRouter(prefix="/api/me/api-keys", tags=["api-keys"])


async def _resolve_api_key(request: Request, key_param: Optional[str] = None) -> dict:
    db = get_db()
    key = request.headers.get("X-Api-Key") or key_param
    if not key:
        # Also try form body
        try:
            form = await request.form()
            key = form.get("key")
        except Exception:
            pass
    if not key:
        try:
            body = await request.json()
            if isinstance(body, dict):
                key = body.get("key")
        except Exception:
            pass
    if not key:
        raise HTTPException(status_code=401, detail="API key required (X-Api-Key header)")
    k = await db.api_keys.find_one({"key": key, "active": True}, {"_id": 0})
    if not k:
        raise HTTPException(status_code=401, detail="Invalid API key")
    user = await db.users.find_one({"user_id": k["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account inactive")
    # Update usage
    await db.api_keys.update_one(
        {"key": key},
        {"$inc": {"calls": 1}, "$set": {"last_used_at": now_utc().isoformat()}},
    )
    return user


async def _log_api(user_id: str, action: str, payload: dict, status: int):
    db = get_db()
    await db.api_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "action": action,
        "payload": payload,
        "status": status,
        "created_at": now_utc().isoformat(),
    })


# ---------- Standard v2 endpoints ----------

@router.get("/balance")
async def api_balance(request: Request):
    user = await _resolve_api_key(request)
    return {"balance": float(user.get("balance", 0.0)), "currency": "USD"}


@router.get("/services")
async def api_services(request: Request):
    await _resolve_api_key(request)
    db = get_db()
    docs = await db.services.find({"active": True}, {"_id": 0, "supplier_rate": 0}).to_list(5000)
    # Return SMM-standard shape
    return [
        {
            "service": d["service_id"],
            "name": d["name"],
            "category": f"{d['platform'].title()} - {d['category']}",
            "type": d.get("type", "Default"),
            "rate": str(d["rate"]),
            "min": str(d["min"]),
            "max": str(d["max"]),
            "refill": d.get("refill_supported", False),
            "cancel": d.get("cancel_supported", False),
        } for d in docs
    ]


class OrderAddRequest(BaseModel):
    service: str
    link: str
    quantity: int
    key: Optional[str] = None


@router.post("/order")
async def api_add_order(request: Request, payload: dict):
    user = await _resolve_api_key(request)
    db = get_db()
    service_id = payload.get("service")
    link = payload.get("link") or ""
    qty = int(payload.get("quantity") or 0)
    if not service_id or not link or qty <= 0:
        raise HTTPException(status_code=400, detail="service, link, quantity required")
    service = await db.services.find_one({"service_id": service_id, "active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    if qty < service["min"] or qty > service["max"]:
        raise HTTPException(status_code=400, detail=f"Quantity must be {service['min']}-{service['max']}")
    charge = round(float(service["rate"]) * qty / 1000.0, 4)
    if float(user.get("balance", 0)) < charge:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    res = await db.users.update_one({"user_id": user["user_id"], "balance": {"$gte": charge}}, {"$inc": {"balance": -charge}})
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    doc = {
        "order_id": order_id,
        "user_id": user["user_id"],
        "service_id": service["service_id"],
        "service_name": service["name"],
        "platform": service["platform"],
        "link": link,
        "quantity": qty,
        "charge": charge,
        "status": "Pending",
        "start_count": 0,
        "remains": qty,
        "supplier_id": service.get("supplier_id"),
        "supplier_order_id": None,
        "source": "api_v2",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(doc)
    await _log_api(user["user_id"], "add", {"service": service_id, "quantity": qty}, 200)
    return {"order": order_id}


@router.post("/status")
async def api_status(request: Request, payload: dict):
    user = await _resolve_api_key(request)
    db = get_db()
    order_ids = payload.get("orders") or payload.get("order")
    if isinstance(order_ids, str):
        ids = [o.strip() for o in order_ids.split(",") if o.strip()]
    elif isinstance(order_ids, list):
        ids = order_ids
    else:
        raise HTTPException(status_code=400, detail="order(s) required")
    out = {}
    for oid in ids:
        doc = await db.orders.find_one({"order_id": oid, "user_id": user["user_id"]}, {"_id": 0})
        if not doc:
            out[oid] = {"error": "Order not found"}
        else:
            out[oid] = {
                "status": doc["status"],
                "remains": doc.get("remains", 0),
                "start_count": doc.get("start_count", 0),
                "charge": doc.get("charge", 0),
            }
    if len(ids) == 1:
        return out[ids[0]]
    return out


@router.post("")
async def api_v2_dispatch(request: Request, payload: dict):
    """SMM-panel-compatible single endpoint: action=services|add|status|balance."""
    action = (payload.get("action") or "").lower()
    if action == "balance":
        return await api_balance(request)
    if action == "services":
        return await api_services(request)
    if action == "add":
        return await api_add_order(request, payload)
    if action == "status":
        return await api_status(request, payload)
    raise HTTPException(status_code=400, detail="Unknown action")


# ---------- User-facing API key management ----------

from .auth import require_active  # noqa: E402


@keys_router.get("")
async def list_my_keys(user: dict = Depends(require_active)):
    db = get_db()
    docs = await db.api_keys.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for d in docs:
        # Mask the key in list view
        k = d.get("key", "")
        d["key_masked"] = (k[:6] + "•" * (len(k) - 10) + k[-4:]) if len(k) > 10 else k
    return docs


@keys_router.post("")
async def create_my_key(user: dict = Depends(require_active), payload: dict = None):
    db = get_db()
    existing = await db.api_keys.count_documents({"user_id": user["user_id"], "active": True})
    if existing >= 5:
        raise HTTPException(status_code=400, detail="Maximum of 5 active API keys")
    label = (payload or {}).get("label") or f"Key {existing + 1}"
    key = f"sbp_{secrets.token_urlsafe(32)}"
    doc = {
        "key_id": f"apk_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "key": key,
        "label": label,
        "active": True,
        "calls": 0,
        "last_used_at": None,
        "created_at": now_utc().isoformat(),
    }
    await db.api_keys.insert_one(doc)
    doc.pop("_id", None)
    return doc  # returned ONCE with full key


@keys_router.post("/{key_id}/revoke")
async def revoke_my_key(key_id: str, user: dict = Depends(require_active)):
    db = get_db()
    res = await db.api_keys.update_one(
        {"key_id": key_id, "user_id": user["user_id"]},
        {"$set": {"active": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"ok": True}


@keys_router.delete("/{key_id}")
async def delete_my_key(key_id: str, user: dict = Depends(require_active)):
    db = get_db()
    res = await db.api_keys.delete_one({"key_id": key_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"ok": True}
