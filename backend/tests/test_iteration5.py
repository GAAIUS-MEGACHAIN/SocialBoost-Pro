"""Iteration 5 tests — platform views, my-accounts CRUD, per-platform analytics."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smm-panel-hub-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@socialboost.pro"
DEMO_PASSWORD = "Demo@12345"
ADMIN_EMAIL = "admin@socialboost.pro"
ADMIN_PASSWORD = "Admin@12345"


@pytest.fixture(scope="module")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


# ---------- Services platform filter ----------
class TestServicesPlatformFilter:
    def test_instagram(self):
        r = requests.get(f"{API}/services", params={"platform": "instagram"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert all(s.get("platform") == "instagram" for s in data)

    def test_youtube(self):
        r = requests.get(f"{API}/services", params={"platform": "youtube"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(s.get("platform") == "youtube" for s in data)

    def test_tiktok(self):
        r = requests.get(f"{API}/services", params={"platform": "tiktok"}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_unknown_platform_empty(self):
        r = requests.get(f"{API}/services", params={"platform": "nope_xx"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# ---------- Per-platform analytics ----------
class TestPlatformAnalytics:
    def test_instagram_shape(self, demo_session):
        r = demo_session.get(f"{API}/analytics/platform/instagram", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("platform", "services_total", "orders", "spend", "completed", "active", "top_services"):
            assert k in data, f"missing key {k}: {data}"
        assert data["platform"] == "instagram"
        assert isinstance(data["services_total"], int) and data["services_total"] > 0
        assert isinstance(data["orders"], int)
        assert isinstance(data["spend"], (int, float))
        assert isinstance(data["top_services"], list)

    def test_youtube_shape(self, demo_session):
        r = demo_session.get(f"{API}/analytics/platform/youtube", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["platform"] == "youtube"
        assert isinstance(data["services_total"], int)

    def test_unauth_401(self):
        r = requests.get(f"{API}/analytics/platform/instagram", timeout=10)
        assert r.status_code == 401

    def test_demo_has_orders_after_creating(self, demo_session):
        # Top up if needed, then place a known instagram order so analytics has data
        bal = demo_session.get(f"{API}/wallet/balance", timeout=10).json()["balance"]
        services = requests.get(f"{API}/services", params={"platform": "instagram"}, timeout=10).json()
        svc = sorted(services, key=lambda s: float(s.get("rate", 1)) * int(s.get("min", 100)) / 1000.0)[0]
        cost = float(svc["rate"]) * int(svc["min"]) / 1000.0
        if bal < cost + 1:
            # Simulate top-up via stripe checkout is heavy; admin adjust instead
            admin = requests.Session()
            admin.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
            me = demo_session.get(f"{API}/auth/me", timeout=10).json()
            admin.post(f"{API}/admin/users/{me['user_id']}/adjust-balance", json={"amount": 50.0, "note": "test top up"}, timeout=10)

        link = "https://instagram.com/test_iter5_demo"
        r = demo_session.post(f"{API}/orders", json={"service_id": svc["service_id"], "link": link, "quantity": int(svc["min"])}, timeout=20)
        assert r.status_code == 200, r.text

        a = demo_session.get(f"{API}/analytics/platform/instagram", timeout=10).json()
        assert a["orders"] >= 1
        assert a["spend"] > 0


# ---------- My accounts CRUD ----------
class TestMyAccounts:
    def test_full_crud(self, demo_session):
        # Clean slate (if there are leftovers)
        existing = demo_session.get(f"{API}/me/accounts", timeout=10).json()
        for a in existing:
            demo_session.delete(f"{API}/me/accounts/{a['account_id']}", timeout=10)

        # Initial empty
        r = demo_session.get(f"{API}/me/accounts", timeout=10)
        assert r.status_code == 200
        assert r.json() == []

        # Create account with handle that matches earlier order link
        payload = {
            "platform": "instagram",
            "handle": "@test_iter5_demo",
            "link": "https://instagram.com/test_iter5_demo",
            "label": "main",
        }
        r = demo_session.post(f"{API}/me/accounts", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        acc = r.json()
        assert acc["platform"] == "instagram"
        assert acc["handle"] == "@test_iter5_demo"
        assert "account_id" in acc and acc["account_id"].startswith("acc_")

        # Read with stats
        r2 = demo_session.get(f"{API}/me/accounts", timeout=10)
        assert r2.status_code == 200
        accounts = r2.json()
        assert len(accounts) == 1
        a = accounts[0]
        assert "stats" in a
        assert "orders" in a["stats"]
        assert "spend" in a["stats"]
        # Should correlate with orders that match link/handle
        assert a["stats"]["orders"] >= 1, f"expected >=1 matched order, got {a['stats']}"

        # Delete
        r3 = demo_session.delete(f"{API}/me/accounts/{acc['account_id']}", timeout=10)
        assert r3.status_code == 200

        r4 = demo_session.get(f"{API}/me/accounts", timeout=10)
        assert r4.json() == []

    def test_delete_nonexistent_404(self, demo_session):
        r = demo_session.delete(f"{API}/me/accounts/acc_doesnotexist", timeout=10)
        assert r.status_code == 404

    def test_unauth_401(self):
        r = requests.get(f"{API}/me/accounts", timeout=10)
        assert r.status_code == 401
