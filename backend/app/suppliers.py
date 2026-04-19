"""Generic SMM supplier integration layer.
Standard SMM panel API format: POST with form-encoded key/action/...
Actions: services, add, status, balance, refill.
"""
import httpx
import random
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from .db import get_db
from .models import now_utc


async def mock_add_order(link: str, quantity: int, service_supplier_id: str) -> Dict[str, Any]:
    return {"order": f"mock_{uuid.uuid4().hex[:10]}"}


async def mock_check_status(supplier_order_id: str, order_doc: dict) -> Dict[str, Any]:
    """Progress mock orders based on how long they've been active."""
    created = order_doc.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    elapsed = (now - created).total_seconds() if created else 0

    qty = int(order_doc.get("quantity", 0))
    if elapsed < 30:
        status = "Pending"
        remains = qty
    elif elapsed < 90:
        status = "In progress"
        remains = int(qty * 0.6)
    elif elapsed < 180:
        status = "Processing"
        remains = int(qty * 0.2)
    else:
        status = "Completed"
        remains = 0

    start_count = order_doc.get("start_count") or random.randint(100, 10000)
    return {
        "status": status,
        "remains": remains,
        "start_count": start_count,
        "charge": order_doc.get("charge", 0),
    }


async def supplier_api_call(supplier: dict, payload: dict) -> Dict[str, Any]:
    """Call a real external SMM supplier API using standard format."""
    data = {"key": supplier["api_key"], **payload}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(supplier["api_url"], data=data)
    if r.status_code != 200:
        raise Exception(f"Supplier API error {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except Exception:
        raise Exception(f"Invalid JSON from supplier: {r.text[:200]}")


async def add_order_to_supplier(supplier: dict, service_supplier_id: str, link: str, quantity: int) -> Dict[str, Any]:
    if supplier.get("is_mock"):
        return await mock_add_order(link, quantity, service_supplier_id)
    return await supplier_api_call(supplier, {
        "action": "add",
        "service": service_supplier_id,
        "link": link,
        "quantity": quantity,
    })


async def check_order_status(supplier: dict, supplier_order_id: str, order_doc: dict) -> Dict[str, Any]:
    if supplier.get("is_mock"):
        return await mock_check_status(supplier_order_id, order_doc)
    resp = await supplier_api_call(supplier, {
        "action": "status",
        "order": supplier_order_id,
    })
    return resp


def normalize_status(raw: str) -> str:
    if not raw:
        return "Pending"
    s = raw.strip().lower()
    mapping = {
        "pending": "Pending",
        "in progress": "In Progress",
        "processing": "Processing",
        "completed": "Completed",
        "complete": "Completed",
        "partial": "Partial",
        "canceled": "Canceled",
        "cancelled": "Canceled",
        "refunded": "Canceled",
    }
    return mapping.get(s, raw.title())


async def seed_default_supplier_and_services():
    db = get_db()
    # Seed Mock supplier
    mock = await db.suppliers.find_one({"supplier_id": "sup_mock_default"})
    if not mock:
        await db.suppliers.insert_one({
            "supplier_id": "sup_mock_default",
            "name": "Internal Mock Supplier",
            "api_url": "internal://mock",
            "api_key": "mock-key",
            "status": "active",
            "is_mock": True,
            "notes": "Auto-seeded mock supplier for dev and demo. Replace in Admin → Suppliers.",
            "created_at": now_utc().isoformat(),
        })

    # Seed sample services if none exist
    if await db.services.count_documents({}) == 0:
        samples = [
            # Instagram
            {"platform": "instagram", "category": "Followers", "name": "Instagram Followers — High Quality", "rate": 1.20, "supplier_rate": 0.65, "min": 50, "max": 100000, "type": "Default"},
            {"platform": "instagram", "category": "Followers", "name": "Instagram Followers — Premium (No Drop)", "rate": 2.50, "supplier_rate": 1.20, "min": 100, "max": 50000, "type": "Premium"},
            {"platform": "instagram", "category": "Likes", "name": "Instagram Likes — Instant", "rate": 0.45, "supplier_rate": 0.18, "min": 50, "max": 200000, "type": "Default"},
            {"platform": "instagram", "category": "Views", "name": "Instagram Reels Views", "rate": 0.15, "supplier_rate": 0.06, "min": 100, "max": 1000000, "type": "Default"},
            {"platform": "instagram", "category": "Comments", "name": "Instagram Custom Comments", "rate": 3.80, "supplier_rate": 1.60, "min": 10, "max": 1000, "type": "Custom Comments"},
            # TikTok
            {"platform": "tiktok", "category": "Followers", "name": "TikTok Followers — Real", "rate": 1.80, "supplier_rate": 0.90, "min": 100, "max": 50000, "type": "Default"},
            {"platform": "tiktok", "category": "Likes", "name": "TikTok Likes — Fast", "rate": 0.35, "supplier_rate": 0.14, "min": 100, "max": 200000, "type": "Default"},
            {"platform": "tiktok", "category": "Views", "name": "TikTok Video Views", "rate": 0.08, "supplier_rate": 0.03, "min": 500, "max": 5000000, "type": "Default"},
            # Facebook
            {"platform": "facebook", "category": "Likes", "name": "Facebook Page Likes", "rate": 2.20, "supplier_rate": 1.10, "min": 100, "max": 50000, "type": "Default"},
            {"platform": "facebook", "category": "Followers", "name": "Facebook Profile Followers", "rate": 1.90, "supplier_rate": 0.95, "min": 100, "max": 20000, "type": "Default"},
            {"platform": "facebook", "category": "Views", "name": "Facebook Video Views", "rate": 0.12, "supplier_rate": 0.05, "min": 500, "max": 1000000, "type": "Default"},
            # Twitter
            {"platform": "twitter", "category": "Followers", "name": "X (Twitter) Followers", "rate": 3.50, "supplier_rate": 1.80, "min": 50, "max": 10000, "type": "Default"},
            {"platform": "twitter", "category": "Likes", "name": "X (Twitter) Likes", "rate": 0.80, "supplier_rate": 0.35, "min": 20, "max": 50000, "type": "Default"},
            {"platform": "twitter", "category": "Views", "name": "X (Twitter) Views", "rate": 0.10, "supplier_rate": 0.04, "min": 500, "max": 1000000, "type": "Default"},
            # YouTube bonus
            {"platform": "youtube", "category": "Views", "name": "YouTube Views — HR", "rate": 1.40, "supplier_rate": 0.70, "min": 500, "max": 500000, "type": "Default"},
            {"platform": "youtube", "category": "Likes", "name": "YouTube Likes", "rate": 1.20, "supplier_rate": 0.55, "min": 50, "max": 50000, "type": "Default"},
        ]
        docs = []
        for i, s in enumerate(samples):
            docs.append({
                "service_id": f"svc_{uuid.uuid4().hex[:12]}",
                "supplier_id": "sup_mock_default",
                "supplier_service_id": f"mock-{i+1}",
                "platform": s["platform"],
                "category": s["category"],
                "name": s["name"],
                "description": f"{s['name']} — fast delivery, quality traffic, no password required.",
                "type": s.get("type", "Default"),
                "rate": s["rate"],
                "supplier_rate": s["supplier_rate"],
                "min": s["min"],
                "max": s["max"],
                "active": True,
                "created_at": now_utc().isoformat(),
            })
        await db.services.insert_many(docs)


async def seed_default_roles():
    db = get_db()
    if await db.roles.count_documents({}) == 0:
        roles = [
            {"role_id": "role_admin", "name": "admin", "permissions": ["*"], "is_system": True},
            {"role_id": "role_manager", "name": "manager", "permissions": ["users.read", "orders.read", "orders.update", "services.read"], "is_system": True},
            {"role_id": "role_user", "name": "user", "permissions": ["orders.own", "wallet.own"], "is_system": True},
        ]
        for r in roles:
            r["created_at"] = now_utc().isoformat()
        await db.roles.insert_many(roles)
