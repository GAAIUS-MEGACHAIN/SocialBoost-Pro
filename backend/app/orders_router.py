import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from .auth import require_active
from .db import get_db
from .models import OrderCreate, now_utc
from .suppliers import add_order_to_supplier, check_order_status, normalize_status

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    for k in ("created_at", "updated_at"):
        v = doc.get(k)
        if v and hasattr(v, "isoformat"):
            doc[k] = v.isoformat()
    return doc


@router.get("")
async def list_orders(user: dict = Depends(require_active), status: Optional[str] = None, limit: int = 200):
    db = get_db()
    q = {"user_id": user["user_id"]}
    if status:
        q["status"] = status
    docs = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_clean(d) for d in docs]


@router.get("/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_active)):
    db = get_db()
    doc = await db.orders.find_one({"order_id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    return _clean(doc)


@router.post("")
async def create_order(data: OrderCreate, user: dict = Depends(require_active)):
    db = get_db()
    service = await db.services.find_one({"service_id": data.service_id, "active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found or inactive")

    qty = int(data.quantity)
    if qty < service["min"] or qty > service["max"]:
        raise HTTPException(status_code=400, detail=f"Quantity must be between {service['min']} and {service['max']}")

    if not data.link or not data.link.strip():
        raise HTTPException(status_code=400, detail="Link is required")

    charge = round(service["rate"] * qty / 1000.0, 4)
    balance = float(user.get("balance", 0.0))
    if balance < charge:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Need ${charge:.2f}, have ${balance:.2f}")

    # Deduct balance atomically
    result = await db.users.update_one(
        {"user_id": user["user_id"], "balance": {"$gte": charge}},
        {"$inc": {"balance": -charge}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    # Dispatch to supplier
    supplier = None
    supplier_order_id = None
    if service.get("supplier_id"):
        supplier = await db.suppliers.find_one({"supplier_id": service["supplier_id"]}, {"_id": 0})
    try:
        if supplier:
            resp = await add_order_to_supplier(
                supplier,
                service.get("supplier_service_id", ""),
                data.link,
                qty,
            )
            supplier_order_id = str(resp.get("order")) if resp.get("order") else None
    except Exception as e:
        # Refund balance on supplier failure
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"balance": charge}})
        raise HTTPException(status_code=502, detail=f"Supplier error: {str(e)[:200]}")

    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    doc = {
        "order_id": order_id,
        "user_id": user["user_id"],
        "service_id": service["service_id"],
        "service_name": service["name"],
        "platform": service["platform"],
        "link": data.link.strip(),
        "quantity": qty,
        "charge": charge,
        "status": "Pending",
        "start_count": 0,
        "remains": qty,
        "supplier_id": service.get("supplier_id"),
        "supplier_order_id": supplier_order_id,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(doc)

    # Record transaction
    await db.payment_transactions.insert_one({
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "provider": "wallet",
        "session_id": None,
        "amount": -charge,
        "currency": "usd",
        "status": "completed",
        "payment_status": "paid",
        "metadata": {"order_id": order_id, "service_name": service["name"]},
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })

    return _clean(doc)


@router.post("/{order_id}/sync")
async def sync_order(order_id: str, user: dict = Depends(require_active)):
    db = get_db()
    doc = await db.orders.find_one({"order_id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["status"] in ("Completed", "Canceled"):
        return _clean(doc)
    supplier = None
    if doc.get("supplier_id"):
        supplier = await db.suppliers.find_one({"supplier_id": doc["supplier_id"]}, {"_id": 0})
    if not supplier or not doc.get("supplier_order_id"):
        return _clean(doc)
    try:
        resp = await check_order_status(supplier, doc["supplier_order_id"], doc)
        new_status = normalize_status(resp.get("status", doc["status"]))
        remains = int(resp.get("remains", doc.get("remains", 0)) or 0)
        start_count = int(resp.get("start_count", doc.get("start_count", 0)) or 0)
        await db.orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": new_status,
                "remains": remains,
                "start_count": start_count,
                "updated_at": now_utc().isoformat(),
            }},
        )
        doc["status"] = new_status
        doc["remains"] = remains
        doc["start_count"] = start_count
    except Exception:
        pass
    return _clean(doc)


@router.post("/sync-all")
async def sync_all_orders(user: dict = Depends(require_active)):
    db = get_db()
    active = await db.orders.find(
        {"user_id": user["user_id"], "status": {"$nin": ["Completed", "Canceled"]}},
        {"_id": 0},
    ).to_list(500)
    updated = 0
    for doc in active:
        if not doc.get("supplier_id") or not doc.get("supplier_order_id"):
            continue
        supplier = await db.suppliers.find_one({"supplier_id": doc["supplier_id"]}, {"_id": 0})
        if not supplier:
            continue
        try:
            resp = await check_order_status(supplier, doc["supplier_order_id"], doc)
            new_status = normalize_status(resp.get("status", doc["status"]))
            remains = int(resp.get("remains", doc.get("remains", 0)) or 0)
            start_count = int(resp.get("start_count", doc.get("start_count", 0)) or 0)
            await db.orders.update_one(
                {"order_id": doc["order_id"]},
                {"$set": {
                    "status": new_status,
                    "remains": remains,
                    "start_count": start_count,
                    "updated_at": now_utc().isoformat(),
                }},
            )
            updated += 1
        except Exception:
            continue
    return {"synced": updated}
