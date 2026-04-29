"""
Groq AI router — multi-key rotation, in-memory IP rate limiting, and three endpoints:
- POST /api/ai/chat        : multi-turn chat (public, rate-limited per IP)
- GET  /api/ai/insights    : authenticated personal analytics (orders, spend, platforms)
- GET  /api/ai/platform-stats : public marketing-grade platform insights for landing

The Groq REST API is OpenAI chat-completions compatible so we use httpx directly
(no extra dependency). Keys rotate round-robin; on 401/403/429/5xx we automatically
retry with the next key until exhausted.
"""

import os
import time
import asyncio
import itertools
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from .db import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def _load_keys() -> List[str]:
    keys = []
    for i in range(1, 9):  # support up to 8 keys
        v = os.environ.get(f"GROQ_API_KEY_{i}")
        if v:
            keys.append(v.strip())
    return keys


_KEYS = _load_keys()
_KEY_CYCLE = itertools.cycle(_KEYS) if _KEYS else None
_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def _next_key() -> Optional[str]:
    if not _KEY_CYCLE:
        return None
    return next(_KEY_CYCLE)


# ---- in-memory IP rate limiter (per-process, sliding window) ---------------
_RATE: Dict[str, List[float]] = {}
_RATE_LIMIT_PUBLIC = 20      # messages
_RATE_LIMIT_AUTH = 60
_RATE_WINDOW = 3600.0        # seconds


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anon"


def _check_rate(key: str, limit: int):
    now = time.time()
    bucket = [t for t in _RATE.get(key, []) if now - t < _RATE_WINDOW]
    if len(bucket) >= limit:
        retry_in = int(_RATE_WINDOW - (now - bucket[0]))
        raise HTTPException(status_code=429, detail=f"Rate limit reached. Try again in {retry_in}s.")
    bucket.append(now)
    _RATE[key] = bucket


# ---- Groq call with rotation ------------------------------------------------
async def _groq_chat(messages: List[Dict[str, str]], max_tokens: int = 600, temperature: float = 0.6) -> str:
    if not _KEYS:
        raise HTTPException(status_code=503, detail="AI not configured")

    last_err = "unknown"
    # try each key once
    for _ in range(len(_KEYS)):
        key = _next_key()
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": _MODEL,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    },
                )
            if r.status_code == 200:
                data = r.json()
                return data["choices"][0]["message"]["content"]
            # rotate on auth / rate / transient errors
            if r.status_code in (401, 403, 429) or r.status_code >= 500:
                last_err = f"{r.status_code} {r.text[:160]}"
                await asyncio.sleep(0.15)
                continue
            # other 4xx — propagate
            raise HTTPException(status_code=502, detail=f"Groq error: {r.status_code} {r.text[:200]}")
        except httpx.HTTPError as e:
            last_err = f"transport: {e}"
            await asyncio.sleep(0.15)
            continue
    raise HTTPException(status_code=502, detail=f"All AI keys exhausted ({last_err})")


# ---- Schemas ----------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    model: str


# ---- Helpers: derive user analytics context ---------------------------------
async def _user_summary(user: dict) -> Dict[str, Any]:
    db = get_db()
    user_id = user["user_id"]
    cursor = db.orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(500)
    orders = await cursor.to_list(length=500)

    by_status: Dict[str, int] = {}
    by_platform: Dict[str, Dict[str, float]] = {}
    total_spend = 0.0
    for o in orders:
        st = str(o.get("status", "Unknown"))
        by_status[st] = by_status.get(st, 0) + 1
        total_spend += float(o.get("charge", 0.0))
        plat = str(o.get("platform", "other")).lower()
        b = by_platform.setdefault(plat, {"orders": 0, "spend": 0.0})
        b["orders"] += 1
        b["spend"] += float(o.get("charge", 0.0))

    # sort top platforms by spend
    top_platforms = sorted(
        ({"platform": k, **v} for k, v in by_platform.items()),
        key=lambda x: x["spend"], reverse=True,
    )[:5]

    # last 30 days
    thirty = datetime.now(timezone.utc) - timedelta(days=30)
    recent = 0
    recent_spend = 0.0
    for o in orders:
        ca = o.get("created_at")
        try:
            dt = datetime.fromisoformat(ca) if isinstance(ca, str) else ca
            if dt and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt and dt >= thirty:
                recent += 1
                recent_spend += float(o.get("charge", 0.0))
        except Exception:
            pass

    return {
        "total_orders": len(orders),
        "total_spend": round(total_spend, 2),
        "by_status": by_status,
        "top_platforms": top_platforms,
        "last_30d_orders": recent,
        "last_30d_spend": round(recent_spend, 2),
        "balance": float(user.get("balance", 0.0)),
    }


async def _platform_summary() -> Dict[str, Any]:
    db = get_db()
    total_orders = await db.orders.count_documents({})
    completed = await db.orders.count_documents({"status": "Completed"})
    services = await db.services.count_documents({"active": {"$ne": False}})
    users = await db.users.count_documents({"status": {"$ne": "suspended"}})
    # platforms covered
    plats = await db.services.distinct("platform")
    return {
        "total_orders": int(total_orders),
        "orders_completed": int(completed),
        "services_count": int(services),
        "users_count": int(users),
        "platforms": [p for p in plats if p],
    }


# ---- Endpoints --------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are 'Boost', the friendly AI concierge inside SocialBoost Pro — a social media marketing "
    "(SMM) panel. You help users discover services across Instagram, TikTok, YouTube, Facebook, "
    "X/Twitter, LinkedIn, Telegram, Spotify and more; answer questions about pricing, order status, "
    "best practices, and how to grow their accounts. Be concise, warm, action-oriented. When users "
    "ask about specific orders or balances and you have analytics context, use it. Never invent "
    "credentials, URLs or supplier names. Keep replies under 180 words unless asked otherwise."
)


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request):
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages required")

    # determine auth + rate limit
    user = None
    try:
        user = await get_current_user(request)
    except HTTPException:
        user = None

    rl_key = f"u:{user['user_id']}" if user else f"ip:{_client_ip(request)}"
    _check_rate(rl_key, _RATE_LIMIT_AUTH if user else _RATE_LIMIT_PUBLIC)

    # build messages: system + optional analytics context + user history
    msgs: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if user:
        try:
            summary = await _user_summary(user)
            msgs.append({
                "role": "system",
                "content": (
                    f"Logged-in user context (JSON, do not repeat verbatim, only reference when relevant): "
                    f"{summary}. User name: {user.get('name','User')}."
                ),
            })
        except Exception:
            pass

    for m in payload.messages[-12:]:  # cap history
        msgs.append({"role": m.role, "content": m.content[:2000]})

    reply = await _groq_chat(msgs, max_tokens=500, temperature=0.65)
    sid = payload.session_id or f"sess_{int(time.time()*1000)}"
    return ChatResponse(reply=reply.strip(), session_id=sid, model=_MODEL)


@router.get("/insights")
async def insights(user: dict = Depends(get_current_user)):
    """AI-generated personal analytics for the logged-in user."""
    summary = await _user_summary(user)
    prompt = (
        "You are an analytics coach for a social-media-marketing panel. Given this user's stats "
        f"as JSON: {summary}\n\n"
        "Return STRICTLY a compact JSON object with keys: "
        '"headline" (one short punchy sentence, max 80 chars), '
        '"highlights" (array of EXACTLY 3 strings, each <= 90 chars, factual, no emoji), '
        '"recommendation" (one actionable sentence <= 120 chars). '
        "No markdown, no preface. Pure JSON only."
    )
    raw = await _groq_chat(
        [{"role": "system", "content": "Return only valid JSON. No markdown."},
         {"role": "user", "content": prompt}],
        max_tokens=350, temperature=0.4,
    )
    parsed = _safe_json(raw)
    if not parsed:
        parsed = {
            "headline": "Your activity snapshot",
            "highlights": [
                f"{summary['total_orders']} total orders placed",
                f"${summary['total_spend']:.2f} lifetime spend",
                f"{summary['last_30d_orders']} orders in the last 30 days",
            ],
            "recommendation": "Try a drip-feed package on your top platform for steadier growth.",
        }
    return {"summary": summary, "ai": parsed, "model": _MODEL}


@router.get("/platform-stats")
async def platform_stats():
    """Public AI-generated marketing summary for the landing page."""
    summary = await _platform_summary()
    prompt = (
        "Given these aggregate platform stats for SocialBoost Pro (an SMM panel) as JSON: "
        f"{summary}\n\n"
        'Return STRICTLY a JSON object with keys: "tagline" (max 70 chars), '
        '"bullets" (array of EXACTLY 3 short marketing bullets, each <= 75 chars). '
        "No markdown, JSON only."
    )
    raw = await _groq_chat(
        [{"role": "system", "content": "Return only valid JSON. No markdown."},
         {"role": "user", "content": prompt}],
        max_tokens=250, temperature=0.5,
    )
    parsed = _safe_json(raw) or {
        "tagline": "Trusted growth across every major platform",
        "bullets": [
            f"{summary['services_count']}+ services across {len(summary['platforms'])} platforms",
            f"{summary['orders_completed']} orders completed and counting",
            "Real-time tracking, refills and reseller API",
        ],
    }
    return {"stats": summary, "ai": parsed, "model": _MODEL}


def _safe_json(s: str) -> Optional[dict]:
    import json, re
    if not s:
        return None
    s = s.strip()
    # strip markdown fences if present
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    # find first {...} block
    m = re.search(r"\{[\s\S]*\}", s)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None
