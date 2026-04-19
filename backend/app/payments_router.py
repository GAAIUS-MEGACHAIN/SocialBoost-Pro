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
    checkout_status = None
    payment_status = None
    amount_total = int(float(tx.get("amount", 0)) * 100)
    currency = tx.get("currency", "usd")
    fetch_error = None
    try:
        checkout_status = await stripe.get_checkout_status(session_id)
        payment_status = checkout_status.payment_status
        amount_total = checkout_status.amount_total
        currency = checkout_status.currency
    except Exception as e:  # noqa: BLE001
        fetch_error = str(e)[:200]

    new_status = tx["status"]
    if checkout_status is not None:
        if checkout_status.status == "expired":
            new_status = "expired"
        elif payment_status == "paid":
            new_status = "paid"
        elif checkout_status.status == "complete":
            new_status = "paid" if payment_status == "paid" else "pending"
        else:
            new_status = "pending"

        # Idempotent credit: only credit if we transition into "paid"
        if new_status == "paid" and tx["status"] != "paid":
            await db.users.update_one(
                {"user_id": tx["user_id"]},
                {"$inc": {"balance": float(tx["amount"])}},
            )
            await db.notifications.insert_one({
                "notif_id": f"ntf_{uuid.uuid4().hex[:12]}",
                "user_id": tx["user_id"],
                "type": "payment",
                "title": "Payment received",
                "message": f"${float(tx['amount']):.2f} added to your wallet via Stripe.",
                "link": "/transactions",
                "read": False,
                "created_at": now_utc().isoformat(),
            })

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
        "amount_total": amount_total,
        "currency": currency,
        "error": fetch_error,
    }


@router.post("/paypal/checkout")
async def paypal_checkout(
    request: Request,
    data: StripeCheckoutRequest,
    user: dict = Depends(require_active),
):
    """Create a PayPal order and return the approval URL for redirect."""
    from . import paypal
    if not paypal.is_configured():
        raise HTTPException(
            status_code=503,
            detail="PayPal not yet configured. Add PAYPAL_CLIENT_ID and PAYPAL_SECRET to backend .env to enable.",
        )
    allowed = {5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0}
    amount = float(data.amount)
    if amount not in allowed:
        raise HTTPException(status_code=400, detail=f"Amount must be one of: {sorted(allowed)}")

    origin = data.origin_url.rstrip("/")
    return_url = f"{origin}/payment/success?provider=paypal"
    cancel_url = f"{origin}/add-funds?canceled=1"

    tx_id = f"tx_{uuid.uuid4().hex[:12]}"
    try:
        order = await paypal.create_order(
            amount=amount,
            currency="USD",
            return_url=return_url,
            cancel_url=cancel_url,
            metadata={"user_id": user["user_id"], "tx_id": tx_id},
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"PayPal error: {str(e)[:300]}")

    db = get_db()
    await db.payment_transactions.insert_one({
        "tx_id": tx_id,
        "user_id": user["user_id"],
        "provider": "paypal",
        "session_id": order["id"],
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": None,
        "metadata": {"purpose": "wallet_topup", "paypal_order_id": order["id"]},
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    return {"url": order["approve_url"], "session_id": order["id"], "provider": "paypal"}


@router.get("/paypal/status/{order_id}")
async def paypal_status(order_id: str, user: dict = Depends(get_current_user)):
    """Check PayPal order status. If APPROVED and not yet captured, capture and credit."""
    from . import paypal
    db = get_db()
    tx = await db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal"}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx["user_id"] != user["user_id"] and user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Not your transaction")

    if tx["status"] == "paid":
        return {
            "session_id": order_id,
            "status": "paid",
            "payment_status": "paid",
            "amount_total": int(float(tx["amount"]) * 100),
            "currency": tx.get("currency", "usd"),
            "already_processed": True,
        }

    try:
        order = await paypal.get_order(order_id)
    except Exception as e:  # noqa: BLE001
        return {
            "session_id": order_id,
            "status": tx["status"],
            "payment_status": None,
            "amount_total": int(float(tx["amount"]) * 100),
            "currency": tx.get("currency", "usd"),
            "error": str(e)[:200],
        }

    status_raw = (order.get("status") or "").upper()
    new_status = tx["status"]
    payment_status = None

    if status_raw == "APPROVED":
        # Capture now
        try:
            captured = await paypal.capture_order(order_id)
            cap_status = (captured.get("status") or "").upper()
            if cap_status == "COMPLETED":
                new_status = "paid"
                payment_status = "paid"
            else:
                new_status = cap_status.lower() or "pending"
        except Exception as e:  # noqa: BLE001
            return {
                "session_id": order_id,
                "status": tx["status"],
                "payment_status": None,
                "amount_total": int(float(tx["amount"]) * 100),
                "currency": tx.get("currency", "usd"),
                "error": f"capture failed: {str(e)[:200]}",
            }
    elif status_raw == "COMPLETED":
        new_status = "paid"
        payment_status = "paid"
    elif status_raw in ("VOIDED", "EXPIRED"):
        new_status = "expired"
    elif status_raw == "CREATED":
        new_status = "pending"
    else:
        new_status = status_raw.lower() or "pending"

    # Idempotent credit
    if new_status == "paid" and tx["status"] != "paid":
        await db.users.update_one({"user_id": tx["user_id"]}, {"$inc": {"balance": float(tx["amount"])}})
        # Record wallet credit notification
        await db.notifications.insert_one({
            "notif_id": f"ntf_{uuid.uuid4().hex[:12]}",
            "user_id": tx["user_id"],
            "type": "payment",
            "title": "Payment received",
            "message": f"${float(tx['amount']):.2f} added to your wallet via PayPal.",
            "link": "/transactions",
            "read": False,
            "created_at": now_utc().isoformat(),
        })

    await db.payment_transactions.update_one(
        {"session_id": order_id},
        {"$set": {
            "status": new_status,
            "payment_status": payment_status,
            "updated_at": now_utc().isoformat(),
        }},
    )

    return {
        "session_id": order_id,
        "status": new_status,
        "payment_status": payment_status,
        "amount_total": int(float(tx["amount"]) * 100),
        "currency": tx.get("currency", "usd"),
    }


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
