import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from .auth import require_admin, hash_password
from .db import get_db
from .models import (
    UserCreate, UserUpdate, BalanceAdjust,
    RoleCreate, RoleUpdate,
    SupplierCreate, SupplierUpdate,
    ServiceCreate, ServiceUpdate,
    now_utc,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    for k, v in list(doc.items()):
        if hasattr(v, "isoformat"):
            doc[k] = v.isoformat()
    return doc


# ---------- Stats ----------
@router.get("/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    db = get_db()
    users_count = await db.users.count_documents({})
    active_users = await db.users.count_documents({"status": "active"})
    suspended = await db.users.count_documents({"status": "suspended"})
    orders_count = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["Pending", "In Progress", "Processing"]}})
    completed_orders = await db.orders.count_documents({"status": "Completed"})
    services_count = await db.services.count_documents({})
    suppliers_count = await db.suppliers.count_documents({})

    # Revenue = sum of positive Stripe paid transactions
    pipeline = [
        {"$match": {"provider": "stripe", "status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    revenue = 0.0
    async for row in db.payment_transactions.aggregate(pipeline):
        revenue = float(row.get("total", 0.0) or 0.0)

    # Total spend (order charges)
    pipeline2 = [
        {"$group": {"_id": None, "total": {"$sum": "$charge"}}},
    ]
    spend = 0.0
    async for row in db.orders.aggregate(pipeline2):
        spend = float(row.get("total", 0.0) or 0.0)

    return {
        "users": {"total": users_count, "active": active_users, "suspended": suspended},
        "orders": {"total": orders_count, "pending": pending_orders, "completed": completed_orders},
        "services": services_count,
        "suppliers": suppliers_count,
        "revenue": round(revenue, 2),
        "spend": round(spend, 2),
    }


# ---------- Users ----------
@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return [_clean(d) for d in docs]


@router.post("/users")
async def create_user(data: UserCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "balance": float(data.balance),
        "avatar_url": None,
        "auth_provider": "local",
        "status": "active",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    return _clean(doc)


@router.patch("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.users.update_one({"user_id": user_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return _clean(doc)


@router.post("/users/{user_id}/adjust-balance")
async def adjust_balance(user_id: str, data: BalanceAdjust, admin: dict = Depends(require_admin)):
    db = get_db()
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"user_id": user_id}, {"$inc": {"balance": float(data.amount)}})
    await db.payment_transactions.insert_one({
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "provider": "admin",
        "session_id": None,
        "amount": float(data.amount),
        "currency": "usd",
        "status": "completed",
        "payment_status": "paid",
        "metadata": {"note": data.note or "Admin adjustment", "admin": admin.get("email")},
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return _clean(doc)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin.get("user_id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = get_db()
    res = await db.users.delete_one({"user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


# ---------- Roles ----------
@router.get("/roles")
async def list_roles(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.roles.find({}, {"_id": 0}).to_list(500)
    return [_clean(d) for d in docs]


@router.post("/roles")
async def create_role(data: RoleCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    if await db.roles.find_one({"name": data.name.lower()}):
        raise HTTPException(status_code=400, detail="Role name exists")
    role = {
        "role_id": f"role_{uuid.uuid4().hex[:10]}",
        "name": data.name.lower(),
        "permissions": data.permissions,
        "is_system": False,
        "created_at": now_utc().isoformat(),
    }
    await db.roles.insert_one(role)
    return _clean(role)


@router.patch("/roles/{role_id}")
async def update_role(role_id: str, data: RoleUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get("is_system") and data.name is not None and data.name != role["name"]:
        raise HTTPException(status_code=400, detail="Cannot rename system role")
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    if payload:
        await db.roles.update_one({"role_id": role_id}, {"$set": payload})
    doc = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    return _clean(doc)


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete system role")
    await db.roles.delete_one({"role_id": role_id})
    return {"deleted": True}


# ---------- Suppliers ----------
@router.get("/suppliers")
async def list_suppliers(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.suppliers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.post("/suppliers")
async def create_supplier(data: SupplierCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {
        "supplier_id": f"sup_{uuid.uuid4().hex[:12]}",
        "name": data.name,
        "api_url": data.api_url,
        "api_key": data.api_key,
        "status": "active",
        "is_mock": False,
        "notes": data.notes,
        "created_at": now_utc().isoformat(),
    }
    await db.suppliers.insert_one(doc)
    return _clean(doc)


@router.patch("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: SupplierUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    if payload:
        await db.suppliers.update_one({"supplier_id": supplier_id}, {"$set": payload})
    doc = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return _clean(doc)


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    if supplier_id == "sup_mock_default":
        raise HTTPException(status_code=400, detail="Cannot delete default mock supplier")
    res = await db.suppliers.delete_one({"supplier_id": supplier_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"deleted": True}


@router.post("/suppliers/{supplier_id}/import-services")
async def import_supplier_services(
    supplier_id: str,
    payload: dict = None,
    admin: dict = Depends(require_admin),
):
    """Call supplier's action=services and import each service into our catalog.
    Body (optional): { "markup": 2.0 }  — multiplier applied to supplier rate (default 2x).
    Existing imports (matched by supplier_id + supplier_service_id) are updated, not duplicated.
    """
    import httpx
    db = get_db()
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    markup = 2.0
    if payload and isinstance(payload.get("markup"), (int, float)) and payload["markup"] > 0:
        markup = float(payload["markup"])

    # For mock supplier, "import" by copying seeded services already present (idempotent); just return summary.
    if supplier.get("is_mock"):
        count = await db.services.count_documents({"supplier_id": supplier_id})
        return {"imported": 0, "updated": 0, "skipped": count, "note": "Mock supplier already seeded; nothing to import."}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                supplier["api_url"],
                data={"key": supplier["api_key"], "action": "services"},
            )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Supplier connection error: {str(e)[:200]}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supplier returned {r.status_code}: {r.text[:200]}")
    try:
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"Supplier returned non-JSON: {r.text[:200]}")

    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="Expected a JSON array of services from supplier")

    def _category_from(raw: str) -> tuple:
        """Guess platform+category from supplier category string like 'Instagram Followers'."""
        s = (raw or "").lower()
        platform = "other"
        for p in ("instagram", "tiktok", "facebook", "twitter", "x ", "youtube"):
            if p.strip() in s:
                platform = "twitter" if p.strip() in ("x", "twitter") else p.strip()
                break
        category = "Other"
        for c in ("followers", "likes", "views", "comments", "shares", "subscribers"):
            if c in s:
                category = c.title()
                break
        return platform, category

    imported = 0
    updated = 0
    for item in data:
        try:
            sup_sid = str(item.get("service"))
            name = str(item.get("name", "Unnamed"))
            supplier_rate = float(item.get("rate", 0))
            rate = round(supplier_rate * markup, 4)
            mn = int(float(item.get("min", 50)))
            mx = int(float(item.get("max", 10000)))
            stype = str(item.get("type", "Default"))
            cat_raw = str(item.get("category", ""))
            platform, category = _category_from(cat_raw or name)
            existing = await db.services.find_one(
                {"supplier_id": supplier_id, "supplier_service_id": sup_sid},
                {"_id": 0, "service_id": 1},
            )
            if existing:
                await db.services.update_one(
                    {"service_id": existing["service_id"]},
                    {"$set": {
                        "name": name, "rate": rate, "supplier_rate": supplier_rate,
                        "min": mn, "max": mx, "type": stype,
                        "platform": platform, "category": category,
                    }},
                )
                updated += 1
            else:
                import uuid as _uuid
                await db.services.insert_one({
                    "service_id": f"svc_{_uuid.uuid4().hex[:12]}",
                    "supplier_id": supplier_id,
                    "supplier_service_id": sup_sid,
                    "platform": platform,
                    "category": category,
                    "name": name,
                    "description": f"Imported from {supplier['name']}",
                    "type": stype,
                    "rate": rate,
                    "supplier_rate": supplier_rate,
                    "min": mn,
                    "max": mx,
                    "active": True,
                    "created_at": now_utc().isoformat(),
                })
                imported += 1
        except Exception:
            continue

    return {"imported": imported, "updated": updated, "markup": markup, "total": imported + updated}


# ---------- Services ----------
@router.get("/services")
async def admin_list_services(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.services.find({}, {"_id": 0}).sort("platform", 1).to_list(2000)
    return [_clean(d) for d in docs]


@router.post("/services")
async def admin_create_service(data: ServiceCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {
        "service_id": f"svc_{uuid.uuid4().hex[:12]}",
        **data.model_dump(),
        "created_at": now_utc().isoformat(),
    }
    await db.services.insert_one(doc)
    return _clean(doc)


@router.patch("/services/{service_id}")
async def admin_update_service(service_id: str, data: ServiceUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    if payload:
        await db.services.update_one({"service_id": service_id}, {"$set": payload})
    doc = await db.services.find_one({"service_id": service_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Service not found")
    return _clean(doc)


@router.delete("/services/{service_id}")
async def admin_delete_service(service_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    res = await db.services.delete_one({"service_id": service_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"deleted": True}


# ---------- Orders ----------
@router.get("/orders")
async def admin_list_orders(status: Optional[str] = None, limit: int = 500, admin: dict = Depends(require_admin)):
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    docs = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_clean(d) for d in docs]


@router.patch("/orders/{order_id}")
async def admin_update_order(order_id: str, payload: dict, admin: dict = Depends(require_admin)):
    db = get_db()
    allowed = {k: v for k, v in payload.items() if k in ("status", "remains", "start_count", "supplier_order_id")}
    if not allowed:
        raise HTTPException(status_code=400, detail="No valid fields")
    allowed["updated_at"] = now_utc().isoformat()
    res = await db.orders.update_one({"order_id": order_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    doc = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    return _clean(doc)


# ---------- Transactions ----------
@router.get("/transactions")
async def admin_transactions(limit: int = 500, admin: dict = Depends(require_admin)):
    db = get_db()
    docs = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_clean(d) for d in docs]
