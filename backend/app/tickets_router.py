import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List

from .auth import require_active, require_admin, get_current_user
from .db import get_db
from .models import now_utc

router = APIRouter(prefix="/api/tickets", tags=["tickets"])
admin_router = APIRouter(prefix="/api/admin/tickets", tags=["admin-tickets"])


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    category: str = "General"  # General | Orders | Payments | Account | Other
    message: str = Field(min_length=1, max_length=4000)


class TicketReply(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class TicketUpdate(BaseModel):
    status: Optional[str] = None  # open | pending | answered | closed
    priority: Optional[str] = None  # low | normal | high


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def _notify(user_id: str, ttype: str, title: str, message: str, link: str = ""):
    db = get_db()
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": ttype,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": now_utc().isoformat(),
    })


# ---------- User endpoints ----------
@router.post("")
async def create_ticket(data: TicketCreate, user: dict = Depends(require_active)):
    db = get_db()
    now = now_utc().isoformat()
    ticket = {
        "ticket_id": f"tkt_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_email": user["email"],
        "user_name": user["name"],
        "subject": data.subject,
        "category": data.category,
        "status": "open",
        "priority": "normal",
        "messages": [{
            "message_id": f"msg_{uuid.uuid4().hex[:10]}",
            "sender_id": user["user_id"],
            "sender_name": user["name"],
            "sender_role": user["role"],
            "message": data.message,
            "created_at": now,
        }],
        "created_at": now,
        "updated_at": now,
    }
    await db.tickets.insert_one(ticket)
    # Notify all admins
    admins = await db.users.find({"role": {"$in": ["admin", "manager"]}}, {"_id": 0, "user_id": 1}).to_list(100)
    for a in admins:
        await _notify(a["user_id"], "ticket", "New support ticket", f"{user['name']}: {data.subject}", f"/admin/tickets/{ticket['ticket_id']}")
    return _clean(ticket)


@router.get("")
async def list_my_tickets(user: dict = Depends(require_active)):
    db = get_db()
    docs = await db.tickets.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return docs


@router.get("/{ticket_id}")
async def get_ticket(ticket_id: str, user: dict = Depends(require_active)):
    db = get_db()
    t = await db.tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t["user_id"] != user["user_id"] and user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Not your ticket")
    return t


@router.post("/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, data: TicketReply, user: dict = Depends(require_active)):
    db = get_db()
    t = await db.tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    is_admin = user.get("role") in ("admin", "manager")
    if t["user_id"] != user["user_id"] and not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    now = now_utc().isoformat()
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "sender_id": user["user_id"],
        "sender_name": user["name"],
        "sender_role": user["role"],
        "message": data.message,
        "created_at": now,
    }
    new_status = "answered" if is_admin else "pending"
    await db.tickets.update_one(
        {"ticket_id": ticket_id},
        {"$push": {"messages": msg}, "$set": {"status": new_status, "updated_at": now}},
    )
    # Notification: if admin replied, notify user; if user replied, notify admins
    if is_admin:
        await _notify(t["user_id"], "ticket", "Support replied",
                      f"Your ticket \"{t['subject']}\" has a new reply.", f"/support/{ticket_id}")
    else:
        admins = await db.users.find({"role": {"$in": ["admin", "manager"]}}, {"_id": 0, "user_id": 1}).to_list(100)
        for a in admins:
            await _notify(a["user_id"], "ticket", "Ticket updated",
                          f"{user['name']} replied to \"{t['subject']}\"", f"/admin/tickets/{ticket_id}")
    out = await db.tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    return out


# ---------- Admin endpoints ----------
@admin_router.get("")
async def admin_list_tickets(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    docs = await db.tickets.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return docs


@admin_router.patch("/{ticket_id}")
async def admin_update_ticket(ticket_id: str, data: TicketUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    payload["updated_at"] = now_utc().isoformat()
    res = await db.tickets.update_one({"ticket_id": ticket_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    doc = await db.tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    # Notify user if status changed
    if data.status:
        await _notify(doc["user_id"], "ticket", f"Ticket {data.status}",
                      f"Your ticket \"{doc['subject']}\" was marked {data.status}.", f"/support/{ticket_id}")
    return doc
