from fastapi import APIRouter, Depends
from typing import Optional

from .db import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/services", tags=["services"])


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    v = doc.get("created_at")
    if v and hasattr(v, "isoformat"):
        doc["created_at"] = v.isoformat()
    return doc


@router.get("")
async def list_services(platform: Optional[str] = None, category: Optional[str] = None):
    db = get_db()
    q = {"active": True}
    if platform:
        q["platform"] = platform
    if category:
        q["category"] = category
    docs = await db.services.find(q, {"_id": 0, "supplier_rate": 0}).sort("rate", 1).to_list(500)
    return [_clean(d) for d in docs]


@router.get("/platforms")
async def list_platforms():
    db = get_db()
    pipeline = [
        {"$match": {"active": True}},
        {"$group": {"_id": {"platform": "$platform", "category": "$category"}, "count": {"$sum": 1}}},
    ]
    out = {}
    async for row in db.services.aggregate(pipeline):
        plat = row["_id"]["platform"]
        cat = row["_id"]["category"]
        out.setdefault(plat, {"platform": plat, "categories": [], "total": 0})
        out[plat]["categories"].append({"name": cat, "count": row["count"]})
        out[plat]["total"] += row["count"]
    return list(out.values())
