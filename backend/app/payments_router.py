import os
import uuid
from fastapi import APIRouter, HTTPException, Request, Depends
from typing import Optional

from .auth import require_active, get_current_user
from .db import get_db
from .models import StripeCheckoutRequest, now_utc

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _get_stripe(request: Request) -> StripeCheckout:
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)


@router.post("/stripe/checkout")
async def stripe_checkout(
    data: StripeCheckoutRequest,
    request: Request,
    user: dict = Depends(require_active),
):
    # Server-side validation: whitelist amounts to avoid arbitrary injection
    allowed = {5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0}
    amount = float(data.amount)
    if amount not in allowed:
        raise HTTPException(status_code=400, detail=f"Amount must be one of: {sorted(allowed)}")

    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/add-funds?canceled=1"

    stripe = _get_stripe(request)
    req = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "email": user["email"],
            "purpose": "wallet_topup",
        },
    )
    session = await stripe.create_checkout_session(req)

    db = get_db()
    await db.payment_transactions.insert_one({
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "provider": "stripe",
        "session_id": session.session_id,
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": None,
        "metadata": {"purpose": "wallet_topup"},
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@router.get("/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    db = get_db()
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx["user_id"] != user["user_id"] and user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Not your transaction")

    # If already credited, don't re-credit.
    if tx["status"] == "paid":
        return {
            "session_id": session_id,
            "status": tx["status"],
            "payment_status": tx.get("payment_status"),
            "amount_total": int(tx["amount"] * 100),
            "currency": tx.get("currency", "usd"),
            "already_processed": True,
        }

    stripe = _get_stripe(request)
    checkout_status = await stripe.get_checkout_status(session_id)

    new_status = tx["status"]
    payment_status = checkout_status.payment_status
    if checkout_status.status == "expired":
        new_status = "expired"
    elif payment_status == "paid":
        new_status = "paid"
    elif checkout_status.status == "complete":
        new_status = "paid" if payment_status == "paid" else "pending"
    else:
        new_status = "pending"

    # Idempotent credit: only credit if we transition into "paid" and it wasn't paid before
    if new_status == "paid" and tx["status"] != "paid":
        await db.users.update_one(
            {"user_id": tx["user_id"]},
            {"$inc": {"balance": float(tx["amount"])}},
        )

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": new_status,
            "payment_status": payment_status,
            "updated_at": now_utc().isoformat(),
        }},
    )

    return {
        "session_id": session_id,
        "status": new_status,
        "payment_status": payment_status,
        "amount_total": checkout_status.amount_total,
        "currency": checkout_status.currency,
    }


@router.post("/paypal/checkout")
async def paypal_checkout(user: dict = Depends(require_active)):
    """PayPal placeholder - awaiting credentials from user."""
    client_id = os.environ.get("PAYPAL_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="PayPal not yet configured. Add PAYPAL_CLIENT_ID and PAYPAL_SECRET to backend .env to enable.",
        )
    raise HTTPException(status_code=501, detail="PayPal integration coming soon.")


# Separate webhook router (no auth)
webhook_router = APIRouter(prefix="/api/webhook", tags=["webhooks"])


@webhook_router.post("/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    stripe = _get_stripe(request)
    try:
        event = await stripe.handle_webhook(body, sig)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {str(e)[:200]}")

    db = get_db()
    session_id = event.session_id
    if not session_id:
        return {"received": True}
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        return {"received": True}
    if event.payment_status == "paid" and tx["status"] != "paid":
        await db.users.update_one(
            {"user_id": tx["user_id"]},
            {"$inc": {"balance": float(tx["amount"])}},
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "paid",
                "payment_status": "paid",
                "updated_at": now_utc().isoformat(),
            }},
        )
    return {"received": True}


# Wallet transactions
wallet_router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@wallet_router.get("/transactions")
async def my_transactions(user: dict = Depends(require_active), limit: int = 100):
    db = get_db()
    docs = await db.payment_transactions.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return docs


@wallet_router.get("/balance")
async def my_balance(user: dict = Depends(require_active)):
    return {"balance": float(user.get("balance", 0.0))}
