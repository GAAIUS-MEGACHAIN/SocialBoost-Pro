import os
import bcrypt
import jwt
import httpx
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Response, APIRouter, Depends
from typing import Optional

from .db import get_db
from .models import (
    RegisterRequest,
    LoginRequest,
    UserPublic,
    now_utc,
)

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: Optional[str] = None):
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 3600,
        path="/",
    )
    if refresh:
        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=30 * 24 * 3600,
            path="/",
        )


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")


async def _find_user_from_jwt(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        db = get_db()
        return await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    except Exception:
        return None


async def _find_user_from_session_token(token: str) -> Optional[dict]:
    db = get_db()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires = session.get("expires_at")
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    return user


async def get_current_user(request: Request) -> dict:
    # Try JWT access cookie first
    token = request.cookies.get("access_token")
    if token:
        user = await _find_user_from_jwt(token)
        if user:
            return user
    # Try Emergent session cookie
    sess_token = request.cookies.get("session_token")
    if sess_token:
        user = await _find_user_from_session_token(sess_token)
        if user:
            return user
    # Try Authorization header (Bearer = either JWT access or session_token)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        tok = auth_header[7:]
        user = await _find_user_from_jwt(tok)
        if user:
            return user
        user = await _find_user_from_session_token(tok)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_role(user: dict, roles: list):
    if user.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_active(user: dict = Depends(get_current_user)) -> dict:
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


# ---------- Router ----------
router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_to_public(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "user"),
        "balance": float(u.get("balance", 0.0)),
        "avatar_url": u.get("avatar_url"),
        "auth_provider": u.get("auth_provider", "local"),
        "status": u.get("status", "active"),
        "created_at": u.get("created_at") if isinstance(u.get("created_at"), str) else u.get("created_at").isoformat() if u.get("created_at") else None,
    }


@router.post("/register")
async def register(data: RegisterRequest, response: Response):
    db = get_db()
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": "user",
        "balance": 0.0,
        "avatar_url": None,
        "auth_provider": "local",
        "status": "active",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return user_to_public(doc)


@router.post("/login")
async def login(data: LoginRequest, response: Response):
    db = get_db()
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access = create_access_token(user["user_id"], email)
    refresh = create_refresh_token(user["user_id"])
    set_auth_cookies(response, access, refresh)
    return user_to_public(user)


@router.post("/logout")
async def logout(response: Response, request: Request):
    # Also clear backend session if present
    db = get_db()
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


@router.post("/emergent/session")
async def emergent_session(request: Request, response: Response):
    """Exchange Emergent session_id for a user session. Called after Google OAuth redirect."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    base = os.environ.get("EMERGENT_AUTH_BASE", "https://demobackend.emergentagent.com")
    url = f"{base}/auth/v1/env/oauth/session-data"

    async with httpx.AsyncClient(timeout=15) as http_client:
        r = await http_client.get(url, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Invalid session data")

    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "password_hash": None,
            "role": "user",
            "balance": 0.0,
            "avatar_url": picture,
            "auth_provider": "emergent_google",
            "status": "active",
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    else:
        # Update avatar if changed
        if picture and user.get("avatar_url") != picture:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"avatar_url": picture}})
            user["avatar_url"] = picture

    # Store session
    expires_at = (now_utc() + timedelta(days=7)).isoformat()
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "user_id": user["user_id"],
                "session_token": session_token,
                "expires_at": expires_at,
                "created_at": now_utc().isoformat(),
            }
        },
        upsert=True,
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 3600,
        path="/",
    )
    return user_to_public(user)


async def seed_admin():
    db = get_db()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@socialboost.pro").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "balance": 0.0,
            "avatar_url": None,
            "auth_provider": "local",
            "status": "active",
            "created_at": now_utc().isoformat(),
        })
    elif existing.get("password_hash") and not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
        )

    # Also seed a demo user
    demo_email = "demo@socialboost.pro"
    demo_password = "Demo@12345"
    demo = await db.users.find_one({"email": demo_email})
    if not demo:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": demo_email,
            "name": "Demo User",
            "password_hash": hash_password(demo_password),
            "role": "user",
            "balance": 50.0,
            "avatar_url": None,
            "auth_provider": "local",
            "status": "active",
            "created_at": now_utc().isoformat(),
        })
