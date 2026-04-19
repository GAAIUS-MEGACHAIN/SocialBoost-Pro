from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.db import get_db, ensure_indexes
from app.auth import router as auth_router, seed_admin
from app.orders_router import router as orders_router
from app.services_router import router as services_router
from app.payments_router import router as payments_router, webhook_router, wallet_router
from app.admin_router import router as admin_router
from app.tickets_router import router as tickets_router, admin_router as tickets_admin_router
from app.notifications_router import router as notifications_router
from app.suppliers import seed_default_supplier_and_services, seed_default_roles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("socialboost")

app = FastAPI(title="SocialBoost Pro API", version="1.0.0")


@app.get("/api/")
async def root():
    return {"name": "SocialBoost Pro API", "ok": True}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(services_router)
app.include_router(orders_router)
app.include_router(payments_router)
app.include_router(webhook_router)
app.include_router(wallet_router)
app.include_router(admin_router)
app.include_router(tickets_router)
app.include_router(tickets_admin_router)
app.include_router(notifications_router)

origins_raw = os.environ.get("CORS_ORIGINS", "*")
origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
    except Exception as e:
        logger.warning(f"Index setup: {e}")
    try:
        await seed_admin()
    except Exception as e:
        logger.warning(f"Admin seed: {e}")
    try:
        await seed_default_roles()
    except Exception as e:
        logger.warning(f"Roles seed: {e}")
    try:
        await seed_default_supplier_and_services()
    except Exception as e:
        logger.warning(f"Services seed: {e}")
    logger.info("SocialBoost Pro API ready")


@app.on_event("shutdown")
async def on_shutdown():
    pass
