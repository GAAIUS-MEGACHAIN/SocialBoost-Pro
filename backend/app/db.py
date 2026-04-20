import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = None
_db = None


def get_client():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client


def get_db():
    global _db
    if _db is None:
        _db = get_client()[os.environ["DB_NAME"]]
    return _db


async def ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at")
    await db.services.create_index("service_id", unique=True)
    await db.orders.create_index("order_id", unique=True)
    await db.orders.create_index("user_id")
    await db.suppliers.create_index("supplier_id", unique=True)
    await db.roles.create_index("role_id", unique=True)
    await db.payment_transactions.create_index("session_id")
    await db.payment_transactions.create_index("user_id")
    await db.tickets.create_index("ticket_id", unique=True)
    await db.tickets.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.api_keys.create_index("key", unique=True)
    await db.api_keys.create_index("user_id")
    await db.refills.create_index("refill_id", unique=True)
    await db.refills.create_index("order_id")
    await db.announcements.create_index("announcement_id", unique=True)
    await db.user_prefs.create_index("user_id", unique=True)
    await db.api_logs.create_index([("user_id", 1), ("created_at", -1)])
    await db.user_accounts.create_index([("user_id", 1), ("platform", 1)])
