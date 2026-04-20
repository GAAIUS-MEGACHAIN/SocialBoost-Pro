"""Extra user + admin features: refills, cancels, favorites, bulk upload,
announcements, profit dashboard.
"""
import uuid
import csv
import io
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List

from .auth import require_active, require_admin
from .db import get_db
from .models import now_utc


router = APIRouter(prefix="/api", tags=["extras"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin-extras"])


def _clean(d: dict) -> dict:
    d.pop("_id", None)
    return d


# ---------- Refills ----------

class RefillRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/orders/{order_id}/refill")
async def request_refill(order_id: str, data: RefillRequest, user: dict = Depends(require_active)):
    db = get_db()
    order = await db.orders.find_one({"order_id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    service = await db.services.find_one({"service_id": order["service_id"]}, {"_id": 0})
    if not service or not service.get("refill_supported", False):
        raise HTTPException(status_code=400, detail="Refills not supported for this service")
    if order["status"] not in ("Completed", "Partial"):
        raise HTTPException(status_code=400, detail="Refill only available after completion")
    # One pending refill per order
    existing = await db.refills.find_one({"order_id": order_id, "status": {"$in": ["pending", "processing"]}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A refill is already pending for this order")
    refill = {
        "refill_id": f"ref_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "user_id": user["user_id"],
        "status": "pending",
        "reason": data.reason,
        "created_at": now_utc().isoformat(),
    }
    await db.refills.insert_one(refill)
    refill.pop("_id", None)
    return _clean(refill)


@router.get("/refills")
async def list_my_refills(user: dict = Depends(require_active)):
    db = get_db()
    docs = await db.refills.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user: dict = Depends(require_active)):
    db = get_db()
    order = await db.orders.find_one({"order_id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] not in ("Pending", "In Progress"):
        raise HTTPException(status_code=400, detail="Order cannot be canceled at this stage")
    service = await db.services.find_one({"service_id": order["service_id"]}, {"_id": 0})
    if service and not service.get("cancel_supported", True):
        raise HTTPException(status_code=400, detail="Cancel not supported for this service")
    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "Canceled", "updated_at": now_utc().isoformat()}},
    )
    # Refund charge to user
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"balance": float(order["charge"])}})
    await db.payment_transactions.insert_one({
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "provider": "refund",
        "session_id": None,
        "amount": float(order["charge"]),
        "currency": "usd",
        "status": "completed",
        "payment_status": "paid",
        "metadata": {"order_id": order_id, "reason": "user_cancel"},
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    return {"ok": True, "refunded": float(order["charge"])}


# ---------- Favorites ----------

@router.get("/favorites")
async def list_favorites(user: dict = Depends(require_active)):
    db = get_db()
    doc = await db.user_prefs.find_one({"user_id": user["user_id"]}, {"_id": 0})
    ids = (doc or {}).get("favorite_services", [])
    if not ids:
        return []
    svcs = await db.services.find({"service_id": {"$in": ids}, "active": True}, {"_id": 0, "supplier_rate": 0}).to_list(200)
    return svcs


class FavoriteReq(BaseModel):
    service_id: str


@router.post("/favorites")
async def add_favorite(data: FavoriteReq, user: dict = Depends(require_active)):
    db = get_db()
    await db.user_prefs.update_one(
        {"user_id": user["user_id"]},
        {"$addToSet": {"favorite_services": data.service_id}, "$setOnInsert": {"created_at": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/favorites/{service_id}")
async def remove_favorite(service_id: str, user: dict = Depends(require_active)):
    db = get_db()
    await db.user_prefs.update_one({"user_id": user["user_id"]}, {"$pull": {"favorite_services": service_id}})
    return {"ok": True}


# ---------- Bulk CSV order upload ----------

@router.post("/orders/bulk")
async def bulk_orders(file: UploadFile = File(...), user: dict = Depends(require_active)):
    """Expected CSV columns: service_id,link,quantity (header row required)."""
    db = get_db()
    raw = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(raw))
    fields = [f.strip().lower() for f in (reader.fieldnames or [])]
    if "service_id" not in fields or "link" not in fields or "quantity" not in fields:
        raise HTTPException(status_code=400, detail="CSV must have columns: service_id, link, quantity")
    results = []
    total_charge = 0.0
    # Pre-validate all rows
    parsed = []
    for row in reader:
        rd = {k.strip().lower(): (v or "").strip() for k, v in row.items()}
        sid = rd.get("service_id")
        link = rd.get("link")
        try:
            qty = int(rd.get("quantity") or 0)
        except Exception:
            qty = 0
        if not sid or not link or qty <= 0:
            results.append({"service_id": sid, "status": "error", "error": "Invalid row"})
            continue
        svc = await db.services.find_one({"service_id": sid, "active": True}, {"_id": 0})
        if not svc:
            results.append({"service_id": sid, "status": "error", "error": "Service not found"})
            continue
        if qty < svc["min"] or qty > svc["max"]:
            results.append({"service_id": sid, "status": "error", "error": f"Quantity out of range ({svc['min']}-{svc['max']})"})
            continue
        charge = round(float(svc["rate"]) * qty / 1000.0, 4)
        total_charge += charge
        parsed.append((svc, link, qty, charge))

    balance = float(user.get("balance", 0.0))
    if total_charge > balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance: need ${total_charge:.2f}, have ${balance:.2f}")

    # Deduct total once and place orders
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"balance": -total_charge}})
    placed = 0
    for svc, link, qty, charge in parsed:
        order_id = f"ord_{uuid.uuid4().hex[:12]}"
        await db.orders.insert_one({
            "order_id": order_id,
            "user_id": user["user_id"],
            "service_id": svc["service_id"],
            "service_name": svc["name"],
            "platform": svc["platform"],
            "link": link,
            "quantity": qty,
            "charge": charge,
            "status": "Pending",
            "start_count": 0,
            "remains": qty,
            "supplier_id": svc.get("supplier_id"),
            "supplier_order_id": None,
            "source": "bulk_csv",
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        })
        results.append({"service_id": svc["service_id"], "order_id": order_id, "status": "ok", "charge": charge})
        placed += 1
    return {"placed": placed, "total_charge": round(total_charge, 2), "results": results}


# ---------- Announcements ----------

class AnnouncementCreate(BaseModel):
    title: str
    body: str
    severity: str = "info"  # info|warn|success|alert


@router.get("/announcements")
async def public_announcements():
    db = get_db()
    docs = await db.announcements.find({"published": True}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return docs


@admin_router.get("/announcements")
async def admin_list_announcements(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@admin_router.post("/announcements")
async def admin_create_announcement(data: AnnouncementCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {
        "announcement_id": f"ann_{uuid.uuid4().hex[:10]}",
        "title": data.title,
        "body": data.body,
        "severity": data.severity,
        "published": True,
        "created_by": admin.get("email"),
        "created_at": now_utc().isoformat(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    # Broadcast notification to all users
    users = await db.users.find({"status": "active"}, {"_id": 0, "user_id": 1}).to_list(5000)
    for u in users:
        await db.notifications.insert_one({
            "notif_id": f"ntf_{uuid.uuid4().hex[:12]}",
            "user_id": u["user_id"],
            "type": "announcement",
            "title": data.title,
            "message": data.body[:200],
            "link": "",
            "read": False,
            "created_at": now_utc().isoformat(),
        })
    return doc


@admin_router.delete("/announcements/{announcement_id}")
async def admin_delete_announcement(announcement_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    res = await db.announcements.delete_one({"announcement_id": announcement_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"ok": True}


# ---------- Profit dashboard ----------

@admin_router.get("/profit")
async def admin_profit(admin: dict = Depends(require_admin)):
    db = get_db()
    pipeline = [
        {"$lookup": {
            "from": "services",
            "localField": "service_id",
            "foreignField": "service_id",
            "as": "svc",
        }},
        {"$unwind": {"path": "$svc", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "order_id": 1,
            "platform": 1,
            "service_name": 1,
            "quantity": 1,
            "charge": 1,
            "rate": "$svc.rate",
            "supplier_rate": "$svc.supplier_rate",
            "cost": {"$multiply": [
                {"$ifNull": ["$svc.supplier_rate", 0]},
                {"$divide": [{"$ifNull": ["$quantity", 0]}, 1000]},
            ]},
            "status": 1,
            "created_at": 1,
        }},
        {"$addFields": {"profit": {"$subtract": [{"$ifNull": ["$charge", 0]}, "$cost"]}}},
    ]
    rows = await db.orders.aggregate(pipeline).to_list(5000)

    totals = {
        "revenue": 0.0,
        "cost": 0.0,
        "profit": 0.0,
        "orders": len(rows),
    }
    by_platform: dict = {}
    by_service: dict = {}
    for r in rows:
        rev = float(r.get("charge") or 0)
        cost = float(r.get("cost") or 0)
        prof = float(r.get("profit") or 0)
        totals["revenue"] += rev
        totals["cost"] += cost
        totals["profit"] += prof
        p = r.get("platform", "unknown")
        by_platform.setdefault(p, {"platform": p, "revenue": 0.0, "cost": 0.0, "profit": 0.0, "orders": 0})
        by_platform[p]["revenue"] += rev
        by_platform[p]["cost"] += cost
        by_platform[p]["profit"] += prof
        by_platform[p]["orders"] += 1
        s = r.get("service_name", "unknown")
        by_service.setdefault(s, {"service_name": s, "revenue": 0.0, "cost": 0.0, "profit": 0.0, "orders": 0})
        by_service[s]["revenue"] += rev
        by_service[s]["cost"] += cost
        by_service[s]["profit"] += prof
        by_service[s]["orders"] += 1

    for k in ("revenue", "cost", "profit"):
        totals[k] = round(totals[k], 2)
    for d in list(by_platform.values()) + list(by_service.values()):
        for k in ("revenue", "cost", "profit"):
            d[k] = round(d[k], 2)

    top_services = sorted(by_service.values(), key=lambda x: x["profit"], reverse=True)[:15]
    return {
        "totals": totals,
        "by_platform": list(by_platform.values()),
        "top_services": top_services,
    }


# ---------- CSV export (user orders) ----------

from fastapi.responses import Response  # noqa: E402


@router.get("/orders/export")
async def export_orders_csv(user: dict = Depends(require_active)):
    db = get_db()
    docs = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["order_id", "platform", "service_name", "link", "quantity", "charge", "status", "remains", "created_at"])
    for d in docs:
        w.writerow([
            d.get("order_id", ""), d.get("platform", ""), d.get("service_name", ""),
            d.get("link", ""), d.get("quantity", 0), d.get("charge", 0),
            d.get("status", ""), d.get("remains", 0), d.get("created_at", ""),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


# ---------- Refill admin endpoints ----------

@admin_router.get("/refills")
async def admin_list_refills(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.refills.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@admin_router.patch("/refills/{refill_id}")
async def admin_update_refill(refill_id: str, payload: dict, admin: dict = Depends(require_admin)):
    db = get_db()
    status = payload.get("status")
    if status not in ("pending", "processing", "completed", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.refills.update_one({"refill_id": refill_id}, {"$set": {"status": status, "updated_at": now_utc().isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Refill not found")
    doc = await db.refills.find_one({"refill_id": refill_id}, {"_id": 0})
    # Notify user
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:12]}",
        "user_id": doc["user_id"],
        "type": "order",
        "title": f"Refill {status}",
        "message": f"Your refill for order {doc['order_id'][-8:].upper()} is {status}.",
        "link": "/refills",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    return _clean(doc)
