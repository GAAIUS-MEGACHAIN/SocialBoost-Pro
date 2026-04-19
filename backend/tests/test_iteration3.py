"""SocialBoost Pro iteration 3 tests.

Covers new features:
- PayPal live sandbox checkout + status
- Ticket system (user + admin)
- Notifications
- Admin import-services
- Regression: auth, services, orders, stripe
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


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def other_user_session():
    s = requests.Session()
    email = f"other_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Other"}, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ---------- PayPal ----------
class TestPayPal:
    def test_paypal_checkout_creates_session(self, demo_session):
        r = demo_session.post(
            f"{API}/payments/paypal/checkout",
            json={"amount": 25, "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data
        assert "session_id" in data
        assert data.get("provider") == "paypal"
        assert data["url"].startswith("https://www.sandbox.paypal.com"), f"expected sandbox url, got {data['url']}"
        pytest._paypal_order_id = data["session_id"]

    def test_paypal_status_returns_json(self, demo_session):
        oid = getattr(pytest, "_paypal_order_id", None)
        if not oid:
            pytest.skip("no paypal order id")
        r = demo_session.get(f"{API}/payments/paypal/status/{oid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data
        assert "status" in data
        assert "payment_status" in data
        assert "amount_total" in data
        assert "currency" in data

    def test_paypal_status_bad_id_404(self, demo_session):
        r = demo_session.get(f"{API}/payments/paypal/status/BOGUS_ORDER_ID_XYZ", timeout=20)
        assert r.status_code == 404, r.text

    def test_paypal_invalid_amount_400(self, demo_session):
        r = demo_session.post(
            f"{API}/payments/paypal/checkout",
            json={"amount": 3, "origin_url": BASE_URL},
            timeout=15,
        )
        assert r.status_code == 400
        body = r.json()
        msg = str(body.get("detail") or body)
        assert "Amount must be one of" in msg or "amount" in msg.lower()


# ---------- Tickets ----------
class TestTickets:
    def test_user_create_and_list(self, demo_session):
        r = demo_session.post(
            f"{API}/tickets",
            json={"subject": "TEST_Ticket subject", "category": "General", "message": "Initial message body"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["subject"] == "TEST_Ticket subject"
        assert t["status"] == "open"
        assert isinstance(t["messages"], list) and len(t["messages"]) == 1
        assert t["messages"][0]["message"] == "Initial message body"
        pytest._ticket_id = t["ticket_id"]

        lst = demo_session.get(f"{API}/tickets", timeout=10)
        assert lst.status_code == 200
        items = lst.json()
        assert any(x["ticket_id"] == t["ticket_id"] for x in items)

    def test_get_ticket_by_id(self, demo_session):
        tid = pytest._ticket_id
        r = demo_session.get(f"{API}/tickets/{tid}", timeout=10)
        assert r.status_code == 200
        assert r.json()["ticket_id"] == tid

    def test_other_user_cannot_read(self, other_user_session):
        tid = pytest._ticket_id
        r = other_user_session.get(f"{API}/tickets/{tid}", timeout=10)
        assert r.status_code == 403

    def test_user_reply_sets_pending(self, demo_session):
        tid = pytest._ticket_id
        r = demo_session.post(f"{API}/tickets/{tid}/reply", json={"message": "Any update?"}, timeout=10)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["status"] == "pending"
        assert len(t["messages"]) >= 2

    def test_admin_list_all(self, admin_session, demo_session):
        r = admin_session.get(f"{API}/admin/tickets", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(x["ticket_id"] == pytest._ticket_id for x in items)

        d = demo_session.get(f"{API}/admin/tickets", timeout=10)
        assert d.status_code == 403

    def test_admin_reply_sets_answered(self, admin_session):
        tid = pytest._ticket_id
        r = admin_session.post(f"{API}/tickets/{tid}/reply", json={"message": "Admin response"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "answered"

    def test_admin_patch_status(self, admin_session):
        tid = pytest._ticket_id
        r = admin_session.patch(f"{API}/admin/tickets/{tid}", json={"status": "closed"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "closed"


# ---------- Notifications ----------
class TestNotifications:
    def test_order_creates_notification(self, demo_session):
        services = requests.get(f"{API}/services", timeout=10).json()
        # pick a cheap service that demo can afford
        services_sorted = sorted(services, key=lambda s: float(s.get("rate", 0)) * int(s.get("min", 1)) / 1000.0)
        svc = services_sorted[0]
        qty = int(svc.get("min", 100))
        # Check balance first
        bal = demo_session.get(f"{API}/wallet/balance", timeout=10).json()["balance"]
        cost = float(svc["rate"]) * qty / 1000.0
        if bal < cost:
            pytest.skip(f"demo balance {bal} too low for {cost}")

        r = demo_session.post(
            f"{API}/orders",
            json={"service_id": svc["service_id"], "link": "https://instagram.com/example", "quantity": qty},
            timeout=20,
        )
        assert r.status_code == 200, r.text

        n = demo_session.get(f"{API}/notifications", timeout=10)
        assert n.status_code == 200
        body = n.json()
        assert "notifications" in body
        assert "unread" in body
        assert any(x.get("type") == "order" for x in body["notifications"]), body

    def test_mark_read_and_read_all(self, demo_session):
        n = demo_session.get(f"{API}/notifications", timeout=10).json()
        if not n["notifications"]:
            pytest.skip("no notifications")
        nid = n["notifications"][0]["notif_id"]
        r = demo_session.post(f"{API}/notifications/{nid}/read", timeout=10)
        assert r.status_code == 200

        r2 = demo_session.post(f"{API}/notifications/read-all", timeout=10)
        assert r2.status_code == 200

        after = demo_session.get(f"{API}/notifications", timeout=10).json()
        assert after["unread"] == 0


# ---------- Import Services ----------
class TestImportServices:
    def test_mock_supplier_import_skips(self, admin_session):
        r = admin_session.post(f"{API}/admin/suppliers/sup_mock_default/import-services", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("imported") == 0
        assert data.get("skipped", 0) >= 1
        assert "note" in data

    def test_nonexistent_supplier_404(self, admin_session):
        r = admin_session.post(f"{API}/admin/suppliers/does_not_exist_xyz/import-services", timeout=15)
        assert r.status_code == 404


# ---------- Regression quick ----------
class TestRegression:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        assert r.status_code == 200

    def test_services_available(self):
        r = requests.get(f"{API}/services", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_stripe_checkout_still_works(self, demo_session):
        r = demo_session.post(
            f"{API}/payments/stripe/checkout",
            json={"amount": 25, "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert "url" in r.json() and "session_id" in r.json()
