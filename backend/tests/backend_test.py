"""SocialBoost Pro - Backend API regression tests.

Covers:
- Auth (register / login / me / logout) via httpOnly cookies
- Services (public list, filter)
- Orders (create, list, sync)
- Wallet (balance, transactions)
- Payments (stripe checkout + status, paypal placeholder)
- Admin CRUD (stats, users, roles, suppliers, services, orders, transactions)
- Role enforcement (regular user -> 403 on admin routes)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smm-panel-hub-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@socialboost.pro"
ADMIN_PASSWORD = "Admin@12345"
DEMO_EMAIL = "demo@socialboost.pro"
DEMO_PASSWORD = "Demo@12345"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies, "access_token cookie not set for admin"
    return s


@pytest.fixture(scope="session")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s


# ---------------- Health ----------------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin_sets_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] in ("admin", "manager")

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_demo_user_has_balance(self, demo_session):
        r = demo_session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == DEMO_EMAIL
        assert data["balance"] >= 0  # may have been spent in prior tests

    def test_register_and_logout(self):
        s = requests.Session()
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Tester"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email
        assert data["role"] == "user"
        assert "access_token" in s.cookies

        me = s.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 200

        lo = s.post(f"{API}/auth/logout", timeout=10)
        assert lo.status_code == 200

        # After logout, cookies cleared -> /me fails with 401 in fresh session
        fresh = requests.Session()
        r2 = fresh.get(f"{API}/auth/me", timeout=10)
        assert r2.status_code == 401

    def test_register_duplicate_email(self):
        r = requests.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": "Passw0rd!", "name": "dup"}, timeout=10)
        assert r.status_code == 400

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ---------------- Services ----------------
class TestServices:
    def test_list_services(self):
        r = requests.get(f"{API}/services", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 16, f"expected >=16 seeded services, got {len(data)}"
        platforms = {s.get("platform") for s in data}
        # should have the 5 platforms
        expected_platforms = {"facebook", "instagram", "twitter", "tiktok", "youtube"}
        assert expected_platforms.issubset(platforms), f"missing platforms. got={platforms}"

    def test_filter_platform(self):
        r = requests.get(f"{API}/services", params={"platform": "instagram"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(s.get("platform") == "instagram" for s in data)


# ---------------- Orders ----------------
class TestOrders:
    def test_create_order_deducts_balance(self, demo_session):
        services = requests.get(f"{API}/services", timeout=10).json()
        assert services
        # Services use keys: rate, min, max
        services_sorted = sorted(services, key=lambda s: float(s.get("rate", 0)) * int(s.get("min", 1)) / 1000.0)
        svc = services_sorted[0]
        qty = int(svc.get("min", 500))

        bal_before = demo_session.get(f"{API}/wallet/balance", timeout=10).json()["balance"]
        r = demo_session.post(
            f"{API}/orders",
            json={"service_id": svc["service_id"], "link": "https://instagram.com/example", "quantity": qty},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["status"] in ("Pending", "In Progress", "Processing")
        assert order["user_id"]
        assert order["link"] == "https://instagram.com/example"

        bal_after = demo_session.get(f"{API}/wallet/balance", timeout=10).json()["balance"]
        assert bal_after < bal_before, f"balance did not decrease: {bal_before} -> {bal_after}"

        pytest._last_order_id = order["order_id"]

    def test_list_orders_returns_only_user(self, demo_session):
        r = demo_session.get(f"{API}/orders", timeout=15)
        assert r.status_code == 200
        orders = r.json()
        assert isinstance(orders, list)
        assert len(orders) >= 1
        me = demo_session.get(f"{API}/auth/me", timeout=10).json()
        assert all(o["user_id"] == me["user_id"] for o in orders)

    def test_sync_order(self, demo_session):
        oid = getattr(pytest, "_last_order_id", None)
        if not oid:
            pytest.skip("no order id from previous test")
        r = demo_session.post(f"{API}/orders/{oid}/sync", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "status" in data

    def test_create_order_insufficient_balance(self):
        # Register a fresh user with $0 balance
        s = requests.Session()
        email = f"poor_{uuid.uuid4().hex[:8]}@example.com"
        reg = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Poor"}, timeout=15)
        assert reg.status_code == 200
        services = requests.get(f"{API}/services", timeout=10).json()
        svc = services[0]
        r = s.post(
            f"{API}/orders",
            json={"service_id": svc["service_id"], "link": "https://instagram.com/example", "quantity": int(svc["min"])},
            timeout=20,
        )
        assert r.status_code in (400, 402), f"expected 400 for insufficient balance, got {r.status_code}: {r.text}"


# ---------------- Wallet ----------------
class TestWallet:
    def test_balance(self, demo_session):
        r = demo_session.get(f"{API}/wallet/balance", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("balance"), (int, float))

    def test_transactions(self, demo_session):
        r = demo_session.get(f"{API}/wallet/transactions", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Payments ----------------
class TestPayments:
    def test_stripe_checkout_valid(self, demo_session):
        r = demo_session.post(
            f"{API}/payments/stripe/checkout",
            json={"amount": 25, "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and "session_id" in data
        pytest._stripe_session_id = data["session_id"]

    def test_stripe_checkout_invalid_amount(self, demo_session):
        r = demo_session.post(
            f"{API}/payments/stripe/checkout",
            json={"amount": 3, "origin_url": BASE_URL},
            timeout=15,
        )
        assert r.status_code == 400

    def test_stripe_status(self, demo_session):
        sid = getattr(pytest, "_stripe_session_id", None)
        if not sid:
            pytest.skip("no stripe session id")
        r = demo_session.get(f"{API}/payments/stripe/status/{sid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "status" in data or "payment_status" in data

    def test_paypal_live_checkout(self, demo_session):
        # PayPal is now live (sandbox) — expect 200 with approval URL
        r = demo_session.post(
            f"{API}/payments/paypal/checkout",
            json={"amount": 25, "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("provider") == "paypal"
        assert "url" in data and data["url"].startswith("https://www.sandbox.paypal.com")
        assert "session_id" in data


# ---------------- Admin authorization ----------------
class TestAdminAuthz:
    def test_demo_cant_access_admin(self, demo_session):
        r = demo_session.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 403

    def test_unauth_admin_401(self):
        r = requests.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 401


# ---------------- Admin endpoints ----------------
class TestAdminRoutes:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Check at least one count-ish field present
        assert isinstance(data, dict)
        assert len(data.keys()) > 0

    def test_users_crud(self, admin_session):
        # CREATE
        email = f"adm_{uuid.uuid4().hex[:8]}@example.com"
        r = admin_session.post(
            f"{API}/admin/users",
            json={"email": email, "password": "Passw0rd!", "name": "AdminMade", "role": "user", "balance": 0},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        created = r.json()
        uid = created["user_id"]
        assert created["email"] == email

        # PATCH: suspend
        r2 = admin_session.patch(f"{API}/admin/users/{uid}", json={"status": "suspended"}, timeout=10)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "suspended"

        # Adjust balance
        r3 = admin_session.post(f"{API}/admin/users/{uid}/adjust-balance", json={"amount": 10.0, "note": "test"}, timeout=10)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("balance", 0) >= 10.0

        # DELETE
        r4 = admin_session.delete(f"{API}/admin/users/{uid}", timeout=10)
        assert r4.status_code in (200, 204)

    def test_roles_crud(self, admin_session):
        r = admin_session.get(f"{API}/admin/roles", timeout=10)
        assert r.status_code == 200, r.text
        roles = r.json()
        assert isinstance(roles, list)
        # cannot delete system
        system_role = next((x for x in roles if x.get("is_system")), None)
        if system_role:
            rid = system_role.get("role_id") or system_role.get("id")
            rd = admin_session.delete(f"{API}/admin/roles/{rid}", timeout=10)
            assert rd.status_code in (400, 403), f"system role delete should be blocked, got {rd.status_code}"

        # Create custom
        name = f"custom_{uuid.uuid4().hex[:6]}"
        rc = admin_session.post(f"{API}/admin/roles", json={"name": name, "permissions": ["orders:read"]}, timeout=10)
        assert rc.status_code in (200, 201), rc.text
        role = rc.json()
        rid = role.get("role_id") or role.get("id")

        rdel = admin_session.delete(f"{API}/admin/roles/{rid}", timeout=10)
        assert rdel.status_code in (200, 204)

    def test_suppliers_crud(self, admin_session):
        r = admin_session.get(f"{API}/admin/suppliers", timeout=10)
        assert r.status_code == 200
        suppliers = r.json()
        # Cannot delete sup_mock_default
        mock = next((s for s in suppliers if (s.get("supplier_id") or s.get("id")) == "sup_mock_default"), None)
        if mock:
            rd = admin_session.delete(f"{API}/admin/suppliers/sup_mock_default", timeout=10)
            assert rd.status_code in (400, 403), rd.text

        # Create a dummy supplier
        rc = admin_session.post(
            f"{API}/admin/suppliers",
            json={"name": f"sup_{uuid.uuid4().hex[:6]}", "api_url": "https://example.com", "api_key": "k"},
            timeout=10,
        )
        assert rc.status_code in (200, 201), rc.text
        sid = rc.json().get("supplier_id") or rc.json().get("id")
        if sid:
            admin_session.delete(f"{API}/admin/suppliers/{sid}", timeout=10)

    def test_services_crud(self, admin_session):
        r = admin_session.get(f"{API}/admin/services", timeout=10)
        assert r.status_code == 200
        # create
        payload = {
            "platform": "instagram",
            "name": f"TEST_svc_{uuid.uuid4().hex[:6]}",
            "category": "followers",
            "rate": 1.0,
            "min": 100,
            "max": 10000,
            "supplier_id": "sup_mock_default",
            "description": "test",
        }
        rc = admin_session.post(f"{API}/admin/services", json=payload, timeout=10)
        assert rc.status_code in (200, 201), rc.text
        svc = rc.json()
        sid = svc.get("service_id") or svc.get("id")
        # update
        ru = admin_session.patch(f"{API}/admin/services/{sid}", json={"rate": 2.0}, timeout=10)
        assert ru.status_code == 200, ru.text
        # delete
        rd = admin_session.delete(f"{API}/admin/services/{sid}", timeout=10)
        assert rd.status_code in (200, 204)

    def test_admin_orders_and_transactions(self, admin_session):
        r = admin_session.get(f"{API}/admin/orders", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        r2 = admin_session.get(f"{API}/admin/transactions", timeout=15)
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)
