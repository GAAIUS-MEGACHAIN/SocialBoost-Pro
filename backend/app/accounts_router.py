"""My accounts (tracked social handles) + per-platform analytics endpoints."""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from .auth import require_active
from .db import get_db
from .models import now_utc


router = APIRouter(prefix="/api", tags=["accounts-analytics"])


class AccountCreate(BaseModel):
    platform: str
    handle: str = Field(min_length=1, max_length=100)
    link: Optional[str] = None
    label: Optional[str] = None


@router.get("/me/accounts")
async def list_accounts(user: dict = Depends(require_active)):
    db = get_db()
    accounts = await db.user_accounts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Augment each with per-account stats (orders matching link OR handle)
    for a in accounts:
        q_link = a.get("link") or ""
        q_handle = a.get("handle") or ""
        # Match if link contains handle OR link equals handle OR link equals stored link
        pipeline = [
            {"$match": {
                "user_id": user["user_id"],
                "platform": a["platform"],
                "$or": [
                    {"link": q_link} if q_link else {"_nope": True},
                    {"link": {"$regex": q_handle.replace("@", ""), "$options": "i"}} if q_handle else {"_nope": True},
                ],
            }},
            {"$group": {"_id": None, "orders": {"$sum": 1}, "spend": {"$sum": "$charge"}}},
        ]
        stats = {"orders": 0, "spend": 0.0}
        async for row in db.orders.aggregate(pipeline):
            stats = {"orders": int(row.get("orders", 0)), "spend": round(float(row.get("spend", 0) or 0), 2)}
        a["stats"] = stats
    return accounts


@router.post("/me/accounts")
async def add_account(data: AccountCreate, user: dict = Depends(require_active)):
    db = get_db()
    handle = data.handle.strip()
    platform = data.platform.lower()
    # Prevent duplicate (same user + platform + handle, case-insensitive)
    existing = await db.user_accounts.find_one({
        "user_id": user["user_id"],
        "platform": platform,
        "handle": {"$regex": f"^{handle}$", "$options": "i"},
    }, {"_id": 0, "account_id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="This handle is already tracked")
    doc = {
        "account_id": f"acc_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "platform": platform,
        "handle": handle,
        "link": (data.link or "").strip() or None,
        "label": (data.label or "").strip() or None,
        "created_at": now_utc().isoformat(),
    }
    await db.user_accounts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/me/accounts/{account_id}")
async def delete_account(account_id: str, user: dict = Depends(require_active)):
    db = get_db()
    res = await db.user_accounts.delete_one({"account_id": account_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


# ---------- Per-platform analytics (for the authenticated user) ----------

@router.get("/analytics/platform/{platform}")
async def platform_analytics(platform: str, user: dict = Depends(require_active)):
    db = get_db()
    platform = platform.lower()
    services_total = await db.services.count_documents({"platform": platform, "active": True})
    pipeline = [
        {"$match": {"user_id": user["user_id"], "platform": platform}},
        {"$group": {
            "_id": None,
            "orders": {"$sum": 1},
            "spend": {"$sum": "$charge"},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "Completed"]}, 1, 0]}},
            "active": {"$sum": {"$cond": [{"$in": ["$status", ["Pending", "In Progress", "Processing"]]}, 1, 0]}},
        }},
    ]
    base = {"orders": 0, "spend": 0.0, "completed": 0, "active": 0}
    async for row in db.orders.aggregate(pipeline):
        base = {
            "orders": int(row.get("orders", 0)),
            "spend": round(float(row.get("spend", 0) or 0), 2),
            "completed": int(row.get("completed", 0)),
            "active": int(row.get("active", 0)),
        }
    # Top services by spend
    top_pipeline = [
        {"$match": {"user_id": user["user_id"], "platform": platform}},
        {"$group": {"_id": "$service_name", "count": {"$sum": 1}, "spend": {"$sum": "$charge"}}},
        {"$sort": {"spend": -1}},
        {"$limit": 10},
    ]
    top = []
    async for row in db.orders.aggregate(top_pipeline):
        top.append({"name": row["_id"], "count": int(row.get("count", 0)), "spend": round(float(row.get("spend", 0) or 0), 2)})
    return {
        "platform": platform,
        "services_total": services_total,
        **base,
        "top_services": top,
    }
