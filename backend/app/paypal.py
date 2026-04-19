"""PayPal REST API integration (sandbox + live).
Uses raw httpx to avoid stale SDKs. Orders v2 flow:
  1. OAuth2 client_credentials -> access_token
  2. POST /v2/checkout/orders  -> create order (intent=CAPTURE), return approve URL
  3. POST /v2/checkout/orders/{id}/capture -> capture after user approval
"""
import os
import base64
import httpx
from typing import Dict, Any, Optional


def paypal_base() -> str:
    mode = os.environ.get("PAYPAL_MODE", "sandbox").lower()
    if mode == "live":
        return "https://api-m.paypal.com"
    return "https://api-m.sandbox.paypal.com"


def _credentials() -> Optional[str]:
    cid = os.environ.get("PAYPAL_CLIENT_ID", "").strip()
    secret = os.environ.get("PAYPAL_SECRET", "").strip()
    if not cid or not secret:
        return None
    raw = f"{cid}:{secret}".encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


async def get_access_token() -> str:
    creds = _credentials()
    if not creds:
        raise RuntimeError("PayPal credentials not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{paypal_base()}/v1/oauth2/token",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data="grant_type=client_credentials",
        )
    if r.status_code != 200:
        raise RuntimeError(f"PayPal auth failed {r.status_code}: {r.text[:200]}")
    return r.json().get("access_token", "")


async def create_order(amount: float, currency: str, return_url: str, cancel_url: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    token = await get_access_token()
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": metadata.get("user_id", "default"),
            "amount": {"currency_code": currency.upper(), "value": f"{amount:.2f}"},
            "custom_id": metadata.get("tx_id", ""),
            "description": "SocialBoost Pro wallet top-up",
        }],
        "application_context": {
            "brand_name": "SocialBoost Pro",
            "user_action": "PAY_NOW",
            "shipping_preference": "NO_SHIPPING",
            "return_url": return_url,
            "cancel_url": cancel_url,
        },
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{paypal_base()}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
        )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"PayPal create order failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    approve = next((ln["href"] for ln in data.get("links", []) if ln.get("rel") == "approve"), None)
    return {"id": data.get("id"), "approve_url": approve, "raw": data}


async def capture_order(order_id: str) -> Dict[str, Any]:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{paypal_base()}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"PayPal capture failed {r.status_code}: {r.text[:300]}")
    return r.json()


async def get_order(order_id: str) -> Dict[str, Any]:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{paypal_base()}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise RuntimeError(f"PayPal get order failed {r.status_code}: {r.text[:300]}")
    return r.json()


def is_configured() -> bool:
    return _credentials() is not None
