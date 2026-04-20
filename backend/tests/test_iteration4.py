"""Iteration 4 regression tests: catalog expansion, API keys, reseller v2 API,
favorites, refills, cancels, bulk CSV upload, announcements, profit, CSV export."""
import io
import os
import csv
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smm-panel-hub-10.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@socialboost.pro"
ADMIN_PASS = "Admin@12345"
DEMO_EMAIL = "demo@socialboost.pro"
DEMO_PASS = "Demo@12345"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert me.status_code == 200, f"me failed: {me.status_code} {me.text}"
    return s, me.json(), token


@pytest.fixture(scope="module")
def admin_ctx():
    s, me, token = _login(ADMIN_EMAIL, ADMIN_PASS)
    return {"s": s, "me": me, "token": token}


@pytest.fixture(scope="module")
def demo_ctx():
    s, me, token = _login(DEMO_EMAIL, DEMO_PASS)
    return {"s": s, "me": me, "token": token}


@pytest.fixture(scope="module")
def topup_demo(admin_ctx, demo_ctx):
    """Ensure demo user has enough balance ($50) for all tests."""
    admin_s = admin_ctx["s"]
    demo_me = demo_ctx["me"]
    uid = demo_me["user_id"]
    # top up to give headroom; amount is delta
    r = admin_s.post(f"{BASE_URL}/api/admin/users/{uid}/adjust-balance", json={"amount": 50.0, "reason": "iter4 tests"}, timeout=15)
    assert r.status_code in (200, 201), f"topup failed: {r.status_code} {r.text}"
    return True


# ---------- Catalog ----------

class TestCatalog:
    def test_catalog_has_many_platforms_and_services(self, demo_ctx):
        r = demo_ctx["s"].get(f"{BASE_URL}/api/services", timeout=30)
        assert r.status_code == 200
        services = r.json()
        assert isinstance(services, list)
        assert len(services) >= 140, f"expected >= 140 services, got {len(services)}"
        platforms = {s.get("platform") for s in services}
        expected = {"instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin",
                    "telegram", "spotify", "discord", "twitch"}
        missing = expected - platforms
        assert not missing, f"missing platforms: {missing}"
        assert len(platforms) >= 12, f"expected >= 12 platforms, got {len(platforms)}"


# ---------- API Keys ----------

class TestApiKeys:
    def test_create_list_revoke_delete_key(self, demo_ctx):
        s = demo_ctx["s"]
        r = s.post(f"{BASE_URL}/api/me/api-keys", json={"label": "TEST_iter4"}, timeout=15)
        assert r.status_code == 200, f"create key failed: {r.status_code} {r.text}"
        data = r.json()
        assert "key" in data and data["key"].startswith("sbp_") and len(data["key"]) > 20
        key_id = data["key_id"]
        full_key = data["key"]

        lst = s.get(f"{BASE_URL}/api/me/api-keys", timeout=15)
        assert lst.status_code == 200
        keys = lst.json()
        assert any(k["key_id"] == key_id for k in keys)
        item = next(k for k in keys if k["key_id"] == key_id)
        assert "key_masked" in item and "•" in item["key_masked"]

        # Revoke
        rv = s.post(f"{BASE_URL}/api/me/api-keys/{key_id}/revoke", timeout=15)
        assert rv.status_code == 200

        # Invalid key must 401 against v2
        r401 = requests.get(f"{BASE_URL}/api/v2/balance", headers={"X-Api-Key": "sbp_invalid_xx"}, timeout=15)
        assert r401.status_code == 401

        # Delete key
        dl = s.delete(f"{BASE_URL}/api/me/api-keys/{key_id}", timeout=15)
        assert dl.status_code == 200

        # Revoked/deleted key should no longer work
        r_dead = requests.get(f"{BASE_URL}/api/v2/balance", headers={"X-Api-Key": full_key}, timeout=15)
        assert r_dead.status_code == 401


# ---------- Reseller v2 API ----------

@pytest.fixture(scope="module")
def api_key(demo_ctx):
    s = demo_ctx["s"]
    r = s.post(f"{BASE_URL}/api/me/api-keys", json={"label": "TEST_v2_fixture"}, timeout=15)
    assert r.status_code == 200
    return {"key": r.json()["key"], "key_id": r.json()["key_id"], "s": s}


class TestResellerV2:
    def test_v2_balance(self, api_key):
        r = requests.get(f"{BASE_URL}/api/v2/balance", headers={"X-Api-Key": api_key["key"]}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "balance" in data and "currency" in data
        assert data["currency"] == "USD"
        assert isinstance(data["balance"], (int, float))

    def test_v2_services_shape(self, api_key):
        r = requests.get(f"{BASE_URL}/api/v2/services", headers={"X-Api-Key": api_key["key"]}, timeout=30)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        s0 = arr[0]
        for k in ("service", "name", "category", "type", "rate", "min", "max", "refill", "cancel"):
            assert k in s0, f"missing field {k}"

    def test_v2_order_and_status(self, api_key, topup_demo):
        # Pick a cheap IG followers service
        svcs_r = requests.get(f"{BASE_URL}/api/v2/services", headers={"X-Api-Key": api_key["key"]}, timeout=30)
        services = svcs_r.json()
        svc = min(services, key=lambda x: float(x["rate"]))
        qty = max(int(svc["min"]), 50)
        r = requests.post(
            f"{BASE_URL}/api/v2/order",
            headers={"X-Api-Key": api_key["key"]},
            json={"service": svc["service"], "link": "https://instagram.com/testuser_iter4", "quantity": qty},
            timeout=20,
        )
        assert r.status_code == 200, f"v2 order failed: {r.status_code} {r.text}"
        order_id = r.json()["order"]
        assert isinstance(order_id, str) and order_id.startswith("ord_")

        st = requests.post(
            f"{BASE_URL}/api/v2/status",
            headers={"X-Api-Key": api_key["key"]},
            json={"order": order_id},
            timeout=15,
        )
        assert st.status_code == 200
        sd = st.json()
        for k in ("status", "remains", "start_count", "charge"):
            assert k in sd, f"missing status key {k}"

    def test_v2_compat_endpoint(self, api_key):
        r = requests.post(
            f"{BASE_URL}/api/v2",
            headers={"X-Api-Key": api_key["key"]},
            json={"action": "balance"},
            timeout=15,
        )
        assert r.status_code == 200 and "balance" in r.json()
        r2 = requests.post(
            f"{BASE_URL}/api/v2",
            headers={"X-Api-Key": api_key["key"]},
            json={"action": "services"},
            timeout=30,
        )
        assert r2.status_code == 200 and isinstance(r2.json(), list)

    def test_v2_invalid_key(self):
        r = requests.get(f"{BASE_URL}/api/v2/balance", headers={"X-Api-Key": "sbp_definitely_bad"}, timeout=15)
        assert r.status_code == 401


# ---------- Favorites ----------

class TestFavorites:
    def test_favorites_add_list_dedupe_remove(self, demo_ctx):
        s = demo_ctx["s"]
        svcs = s.get(f"{BASE_URL}/api/services", timeout=30).json()
        sid = svcs[0]["service_id"]
        a = s.post(f"{BASE_URL}/api/favorites", json={"service_id": sid}, timeout=15)
        assert a.status_code == 200
        # Adding again should not duplicate
        a2 = s.post(f"{BASE_URL}/api/favorites", json={"service_id": sid}, timeout=15)
        assert a2.status_code == 200
        lst = s.get(f"{BASE_URL}/api/favorites", timeout=15).json()
        count = sum(1 for it in lst if it["service_id"] == sid)
        assert count == 1
        r = s.delete(f"{BASE_URL}/api/favorites/{sid}", timeout=15)
        assert r.status_code == 200
        lst2 = s.get(f"{BASE_URL}/api/favorites", timeout=15).json()
        assert not any(it["service_id"] == sid for it in lst2)


# ---------- Cancel / Refill ----------

class TestCancelAndRefill:
    def test_cancel_pending_order_refunds(self, demo_ctx, topup_demo):
        s = demo_ctx["s"]
        svcs = s.get(f"{BASE_URL}/api/services", timeout=30).json()
        svc = min(svcs, key=lambda x: float(x["rate"]))
        qty = max(svc["min"], 50)
        bal_before = s.get(f"{BASE_URL}/api/wallet/balance", timeout=15).json()["balance"]
        r = s.post(f"{BASE_URL}/api/orders", json={"service_id": svc["service_id"], "link": "https://instagram.com/TEST_cancel_iter4", "quantity": qty}, timeout=20)
        assert r.status_code in (200, 201), f"order create failed: {r.status_code} {r.text}"
        od = r.json()
        order_id = od.get("order_id") or od.get("order", {}).get("order_id")
        assert order_id
        charge = od.get("charge") or od.get("order", {}).get("charge")
        bal_mid = s.get(f"{BASE_URL}/api/wallet/balance", timeout=15).json()["balance"]
        assert round(bal_before - bal_mid, 4) == round(float(charge), 4)
        c = s.post(f"{BASE_URL}/api/orders/{order_id}/cancel", timeout=15)
        assert c.status_code == 200, f"cancel failed: {c.status_code} {c.text}"
        data = c.json()
        assert data["ok"] is True and round(float(data["refunded"]), 4) == round(float(charge), 4)
        bal_after = s.get(f"{BASE_URL}/api/wallet/balance", timeout=15).json()["balance"]
        assert round(bal_after, 4) == round(bal_before, 4)

    def test_refill_flow(self, admin_ctx, demo_ctx, topup_demo):
        s = demo_ctx["s"]
        admin_s = admin_ctx["s"]
        # Pick a refill-supported service
        svcs = s.get(f"{BASE_URL}/api/services", timeout=30).json()
        refillable = [x for x in svcs if x.get("refill_supported")]
        assert refillable, "no refillable services"
        svc = min(refillable, key=lambda x: float(x["rate"]))
        qty = max(svc["min"], 50)
        r = s.post(f"{BASE_URL}/api/orders", json={"service_id": svc["service_id"], "link": "https://instagram.com/TEST_refill_iter4", "quantity": qty}, timeout=20)
        assert r.status_code in (200, 201)
        od = r.json()
        order_id = od.get("order_id") or od.get("order", {}).get("order_id")
        # Force complete via admin
        pu = admin_s.patch(f"{BASE_URL}/api/admin/orders/{order_id}", json={"status": "Completed"}, timeout=15)
        assert pu.status_code == 200, f"admin mark completed failed: {pu.status_code} {pu.text}"
        rf = s.post(f"{BASE_URL}/api/orders/{order_id}/refill", json={"reason": "TEST"}, timeout=15)
        assert rf.status_code == 200, f"refill failed: {rf.status_code} {rf.text}"
        refill_id = rf.json()["refill_id"]
        lst = s.get(f"{BASE_URL}/api/refills", timeout=15).json()
        assert any(x["refill_id"] == refill_id for x in lst)
        adm_lst = admin_s.get(f"{BASE_URL}/api/admin/refills", timeout=15)
        assert adm_lst.status_code == 200
        pa = admin_s.patch(f"{BASE_URL}/api/admin/refills/{refill_id}", json={"status": "completed"}, timeout=15)
        assert pa.status_code == 200 and pa.json()["status"] == "completed"


# ---------- Bulk CSV Upload ----------

class TestBulkUpload:
    def test_bulk_csv_upload(self, demo_ctx, topup_demo):
        s = demo_ctx["s"]
        svcs = s.get(f"{BASE_URL}/api/services", timeout=30).json()
        svc = min(svcs, key=lambda x: float(x["rate"]))
        qty = max(svc["min"], 50)
        csv_text = "service_id,link,quantity\n"
        csv_text += f"{svc['service_id']},https://instagram.com/TEST_bulk1,{qty}\n"
        csv_text += f"{svc['service_id']},https://instagram.com/TEST_bulk2,{qty}\n"
        csv_text += "svc_invalid,https://instagram.com/x,100\n"
        bal_before = s.get(f"{BASE_URL}/api/wallet/balance", timeout=15).json()["balance"]
        files = {"file": ("bulk.csv", csv_text, "text/csv")}
        r = s.post(f"{BASE_URL}/api/orders/bulk", files=files, timeout=30)
        assert r.status_code == 200, f"bulk failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["placed"] == 2
        assert data["total_charge"] > 0
        errors = [x for x in data["results"] if x.get("status") == "error"]
        assert any(x.get("service_id") == "svc_invalid" for x in errors)
        bal_after = s.get(f"{BASE_URL}/api/wallet/balance", timeout=15).json()["balance"]
        assert round(bal_before - bal_after, 2) == round(data["total_charge"], 2)

    def test_bulk_insufficient_balance(self, demo_ctx):
        s = demo_ctx["s"]
        svcs = s.get(f"{BASE_URL}/api/services", timeout=30).json()
        # Pick expensive service
        svc = max(svcs, key=lambda x: float(x["rate"]))
        qty = svc["max"]
        # Repeat enough rows to guarantee cost >>> $200 regardless of residual demo balance
        unit_cost = float(svc["rate"]) * qty / 1000.0
        rows_needed = max(20, int(500 / max(unit_cost, 0.01)) + 5)
        csv_text = "service_id,link,quantity\n"
        for i in range(rows_needed):
            csv_text += f"{svc['service_id']},https://instagram.com/TEST_big_{i},{qty}\n"
        files = {"file": ("big.csv", csv_text, "text/csv")}
        r = s.post(f"{BASE_URL}/api/orders/bulk", files=files, timeout=60)
        assert r.status_code == 400, f"expected 400 for insufficient balance, got {r.status_code}"
        assert "insufficient" in r.text.lower() or "balance" in r.text.lower()


# ---------- CSV Export ----------

class TestCsvExport:
    def test_export_orders_csv(self, demo_ctx):
        s = demo_ctx["s"]
        r = s.get(f"{BASE_URL}/api/orders/export", timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "").lower()
        first_line = r.text.splitlines()[0]
        assert "order_id" in first_line and "charge" in first_line


# ---------- Announcements ----------

class TestAnnouncements:
    def test_create_list_delete_announcement(self, admin_ctx, demo_ctx):
        admin_s = admin_ctx["s"]
        demo_s = demo_ctx["s"]
        title = f"TEST_ann_{uuid.uuid4().hex[:6]}"
        r = admin_s.post(f"{BASE_URL}/api/admin/announcements", json={"title": title, "body": "hello iteration 4", "severity": "info"}, timeout=15)
        assert r.status_code == 200, f"create announcement failed: {r.status_code} {r.text}"
        ann_id = r.json()["announcement_id"]
        pub = demo_s.get(f"{BASE_URL}/api/announcements", timeout=15)
        assert pub.status_code == 200
        assert any(a["announcement_id"] == ann_id for a in pub.json())
        # Verify notification was broadcast to demo user
        notes = demo_s.get(f"{BASE_URL}/api/notifications", timeout=15)
        assert notes.status_code == 200
        body = notes.json()
        note_list = body.get("notifications", body) if isinstance(body, dict) else body
        titles = [n.get("title") for n in note_list]
        assert title in titles, f"announcement not broadcast to user notifications. got titles: {titles[:5]}"
        d = admin_s.delete(f"{BASE_URL}/api/admin/announcements/{ann_id}", timeout=15)
        assert d.status_code == 200


# ---------- Profit Dashboard ----------

class TestProfitDashboard:
    def test_admin_profit(self, admin_ctx):
        r = admin_ctx["s"].get(f"{BASE_URL}/api/admin/profit", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "totals" in data and "by_platform" in data and "top_services" in data
        for k in ("revenue", "cost", "profit", "orders"):
            assert k in data["totals"]
        assert isinstance(data["by_platform"], list)
        assert isinstance(data["top_services"], list)


# ---------- Regression: existing endpoints ----------

class TestRegression:
    def test_admin_login_and_stats(self, admin_ctx):
        r = admin_ctx["s"].get(f"{BASE_URL}/api/admin/stats", timeout=15)
        assert r.status_code == 200

    def test_stripe_checkout_create(self, demo_ctx):
        r = demo_ctx["s"].post(
            f"{BASE_URL}/api/payments/stripe/checkout",
            json={"amount": 10, "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200
        assert "url" in r.json() or "checkout_url" in r.json()

    def test_emergent_session_endpoint_exists(self):
        # Should return 400/401 for missing/bad session id, not 404
        r = requests.post(f"{BASE_URL}/api/auth/emergent/session", json={"session_id": "invalid"}, timeout=15)
        assert r.status_code != 404
