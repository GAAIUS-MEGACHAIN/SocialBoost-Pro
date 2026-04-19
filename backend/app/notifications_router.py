from fastapi import APIRouter, Depends, HTTPException
from .auth import require_active
from .db import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user: dict = Depends(require_active), limit: int = 50):
    db = get_db()
    docs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"notifications": docs, "unread": unread}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(require_active)):
    db = get_db()
    res = await db.notifications.update_one(
        {"notif_id": notif_id, "user_id": user["user_id"]},
        {"$set": {"read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(require_active)):
    db = get_db()
    await db.notifications.update_many(
        {"user_id": user["user_id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}
