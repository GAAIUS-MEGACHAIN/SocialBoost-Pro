// Full embedded backend for SocialBoost Pro Desktop.
// Storage: lowdb JSON at ~/.socialboost-pro/db.json.
// Outbound integrations (only called when online):
//   - Stripe Checkout (uses STRIPE_API_KEY; falls back to test key sk_test_emergent)
//   - PayPal REST v2 (uses PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_MODE)
//   - SMM supplier APIs (user-added, standard action=add/status format)

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { Low, JSONFile } = require("lowdb");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");

function nowIso() { return new Date().toISOString(); }
function uid(p) { return `${p}_${nanoid(12)}`; }

// ---------- PayPal client (REST v2) ----------
const PAYPAL_BASE = () => (process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
async function ppToken() {
  const cid = process.env.PAYPAL_CLIENT_ID;
  const sec = process.env.PAYPAL_SECRET;
  if (!cid || !sec) throw new Error("PayPal not configured");
  const basic = Buffer.from(`${cid}:${sec}`).toString("base64");
  const r = await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal auth ${r.status}`);
  return (await r.json()).access_token;
}
async function ppCreateOrder({ amount, returnUrl, cancelUrl, tx_id, user_id }) {
  const token = await ppToken();
  const r = await fetch(`${PAYPAL_BASE()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: user_id, amount: { currency_code: "USD", value: amount.toFixed(2) }, custom_id: tx_id, description: "SocialBoost Pro wallet top-up" }],
      application_context: { brand_name: "SocialBoost Pro", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: cancelUrl },
    }),
  });
  if (!r.ok) throw new Error(`PayPal create ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const approve = (data.links || []).find((l) => l.rel === "approve");
  return { id: data.id, approve_url: approve && approve.href };
}
async function ppCaptureOrder(id) {
  const token = await ppToken();
  const r = await fetch(`${PAYPAL_BASE()}/v2/checkout/orders/${id}/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`PayPal capture ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ppGetOrder(id) {
  const token = await ppToken();
  const r = await fetch(`${PAYPAL_BASE()}/v2/checkout/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`PayPal get ${r.status}`);
  return r.json();
}

// ---------- Stripe ----------
async function stripeCreateCheckout({ amount, success_url, cancel_url, metadata }) {
  const key = process.env.STRIPE_API_KEY || "sk_test_emergent";
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", success_url);
  params.append("cancel_url", cancel_url);
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", "SocialBoost Pro wallet top-up");
  params.append("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
  params.append("line_items[0][quantity]", "1");
  Object.entries(metadata || {}).forEach(([k, v]) => params.append(`metadata[${k}]`, String(v)));
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${await r.text()}`);
  return r.json();
}
async function stripeGetSession(id) {
  const key = process.env.STRIPE_API_KEY || "sk_test_emergent";
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Stripe ${r.status}`);
  return r.json();
}

// ---------- Supplier ----------
async function supplierCall(supplier, payload) {
  if (supplier.is_mock) return { order: `mock_${nanoid(10)}` };
  const body = new URLSearchParams({ key: supplier.api_key, ...payload }).toString();
  const r = await fetch(supplier.api_url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Supplier ${r.status}`);
  return r.json();
}

function normalizeStatus(raw) {
  if (!raw) return "Pending";
  const s = raw.toString().trim().toLowerCase();
  const map = { pending: "Pending", "in progress": "In Progress", processing: "Processing", completed: "Completed", complete: "Completed", partial: "Partial", canceled: "Canceled", cancelled: "Canceled", refunded: "Canceled" };
  return map[s] || s.charAt(0).toUpperCase() + s.slice(1);
}

function progressMockOrder(o) {
  if (["Completed", "Canceled"].includes(o.status)) return;
  const elapsed = (Date.now() - new Date(o.created_at).getTime()) / 1000;
  if (elapsed < 30) { o.status = "Pending"; o.remains = o.quantity; }
  else if (elapsed < 90) { o.status = "In Progress"; o.remains = Math.floor(o.quantity * 0.6); }
  else if (elapsed < 180) { o.status = "Processing"; o.remains = Math.floor(o.quantity * 0.2); }
  else { o.status = "Completed"; o.remains = 0; }
  o.start_count = o.start_count || Math.floor(Math.random() * 10000 + 100);
  o.updated_at = nowIso();
}

// ---------- DB init ----------
async function initDb() {
  const dir = path.join(os.homedir(), ".socialboost-pro");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const adapter = new JSONFile(path.join(dir, "db.json"));
  const db = new Low(adapter);
  await db.read();
  db.data ||= {
    users: [], sessions: [], roles: [], suppliers: [], services: [], orders: [],
    favorites: {}, refills: [], tickets: [], notifications: [], announcements: [],
    api_keys: [], transactions: [], user_accounts: [],
  };

  // Seed services from bundled JSON
  if (!db.data.services.length) {
    try {
      const extra = JSON.parse(fs.readFileSync(path.join(__dirname, "services.seed.json"), "utf-8"));
      db.data.services = extra;
    } catch {}
  }
  // Seed mock supplier
  if (!db.data.suppliers.find((s) => s.supplier_id === "sup_mock_default")) {
    db.data.suppliers.push({ supplier_id: "sup_mock_default", name: "Internal Mock Supplier", api_url: "internal://mock", api_key: "mock", status: "active", is_mock: true, notes: "Edit/add your real supplier in Admin → Suppliers", created_at: nowIso() });
  }
  // Seed roles
  if (!db.data.roles.length) {
    db.data.roles = [
      { role_id: "role_admin", name: "admin", permissions: ["*"], is_system: true, created_at: nowIso() },
      { role_id: "role_manager", name: "manager", permissions: ["users.read", "orders.read", "orders.update"], is_system: true, created_at: nowIso() },
      { role_id: "role_user", name: "user", permissions: ["orders.own", "wallet.own"], is_system: true, created_at: nowIso() },
    ];
  }
  // Seed users
  if (!db.data.users.find((u) => u.email === "admin@socialboost.pro")) {
    db.data.users.push({ user_id: uid("user"), email: "admin@socialboost.pro", name: "Admin", password_hash: bcrypt.hashSync("Admin@12345", 10), role: "admin", balance: 0, status: "active", auth_provider: "local", created_at: nowIso() });
  }
  if (!db.data.users.find((u) => u.email === "demo@socialboost.pro")) {
    db.data.users.push({ user_id: uid("user"), email: "demo@socialboost.pro", name: "Demo User", password_hash: bcrypt.hashSync("Demo@12345", 10), role: "user", balance: 50, status: "active", auth_provider: "local", created_at: nowIso() });
  }
  await db.write();
  return db;
}

// ---------- Server ----------
async function startServer(port) {
  const db = await initDb();
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

  app.use((req, res, next) => {
    const c = req.headers.cookie || "";
    const m = c.match(/sbp_session=([^;]+)/);
    req.sessionToken = m ? decodeURIComponent(m[1]) : null;
    next();
  });

  const requireAuth = (req, res, next) => {
    const s = db.data.sessions.find((x) => x.token === req.sessionToken && x.expires > Date.now());
    if (!s) return res.status(401).json({ detail: "Not authenticated" });
    req.user = db.data.users.find((u) => u.user_id === s.user_id);
    if (!req.user || req.user.status === "suspended") return res.status(403).json({ detail: "Account inactive" });
    next();
  };
  const requireAdmin = (req, res, next) => requireAuth(req, res, () => ["admin", "manager"].includes(req.user.role) ? next() : res.status(403).json({ detail: "Admin only" }));

  const pub = (u) => ({ user_id: u.user_id, email: u.email, name: u.name, role: u.role, balance: u.balance, avatar_url: u.avatar_url, auth_provider: u.auth_provider, status: u.status, created_at: u.created_at });
  const strip = (u) => { const { password_hash, ...rest } = u; return rest; };
  const notify = async (user_id, type, title, message, link = "") => {
    db.data.notifications.push({ notif_id: uid("ntf"), user_id, type, title, message, link, read: false, created_at: nowIso() });
    await db.write();
  };
  const save = () => db.write();

  // Health
  app.get("/api/", (_, res) => res.json({ name: "SocialBoost Pro (desktop)", ok: true }));
  app.get("/api/health", (_, res) => res.json({ status: "ok", mode: "desktop" }));

  // ---- Auth ----
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ detail: "email, password, name required" });
    if (db.data.users.find((x) => x.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ detail: "Email already registered" });
    const u = { user_id: uid("user"), email: email.toLowerCase(), name, password_hash: bcrypt.hashSync(password, 10), role: "user", balance: 0, status: "active", auth_provider: "local", created_at: nowIso() };
    db.data.users.push(u);
    const token = nanoid(48);
    db.data.sessions.push({ token, user_id: u.user_id, expires: Date.now() + 7 * 864e5 });
    await save();
    res.setHeader("Set-Cookie", `sbp_session=${token}; Path=/; HttpOnly; Max-Age=${7 * 86400}`);
    res.json(pub(u));
  });
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    const u = db.data.users.find((x) => x.email.toLowerCase() === String(email || "").toLowerCase());
    if (!u || !bcrypt.compareSync(password || "", u.password_hash)) return res.status(401).json({ detail: "Invalid email or password" });
    if (u.status === "suspended") return res.status(403).json({ detail: "Account suspended" });
    const token = nanoid(48);
    db.data.sessions.push({ token, user_id: u.user_id, expires: Date.now() + 7 * 864e5 });
    await save();
    res.setHeader("Set-Cookie", `sbp_session=${token}; Path=/; HttpOnly; Max-Age=${7 * 86400}`);
    res.json(pub(u));
  });
  app.post("/api/auth/logout", async (req, res) => {
    db.data.sessions = db.data.sessions.filter((s) => s.token !== req.sessionToken);
    await save();
    res.setHeader("Set-Cookie", `sbp_session=; Path=/; HttpOnly; Max-Age=0`);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => res.json(pub(req.user)));

  // ---- Services ----
  app.get("/api/services", (req, res) => {
    let out = db.data.services.filter((s) => s.active !== false);
    if (req.query.platform) out = out.filter((s) => s.platform === req.query.platform);
    if (req.query.category) out = out.filter((s) => s.category === req.query.category);
    res.json(out.map(({ supplier_rate, ...rest }) => rest));
  });

  // ---- Orders ----
  app.get("/api/orders", requireAuth, (req, res) => res.json(db.data.orders.filter((o) => o.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at))));
  app.get("/api/orders/export", requireAuth, (req, res) => {
    const rows = db.data.orders.filter((o) => o.user_id === req.user.user_id);
    const csv = ["order_id,platform,service_name,link,quantity,charge,status,remains,created_at"].concat(rows.map((r) => [r.order_id, r.platform, r.service_name, r.link, r.quantity, r.charge, r.status, r.remains, r.created_at].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=orders.csv");
    res.send(csv);
  });
  app.post("/api/orders", requireAuth, async (req, res) => {
    const { service_id, link, quantity } = req.body || {};
    const svc = db.data.services.find((s) => s.service_id === service_id && s.active !== false);
    if (!svc) return res.status(404).json({ detail: "Service not found" });
    const qty = parseInt(quantity || 0, 10);
    if (qty < svc.min || qty > svc.max) return res.status(400).json({ detail: `Quantity must be ${svc.min}-${svc.max}` });
    if (!link) return res.status(400).json({ detail: "Link required" });
    const charge = Math.round((svc.rate * qty / 1000) * 10000) / 10000;
    if (req.user.balance < charge) return res.status(400).json({ detail: "Insufficient balance" });
    req.user.balance = Math.round((req.user.balance - charge) * 10000) / 10000;
    let supplier_order_id = null;
    const supplier = db.data.suppliers.find((s) => s.supplier_id === svc.supplier_id);
    if (supplier) {
      try {
        const r = await supplierCall(supplier, { action: "add", service: svc.supplier_service_id || svc.service_id, link, quantity: qty });
        supplier_order_id = r.order ? String(r.order) : null;
      } catch (e) {
        req.user.balance = Math.round((req.user.balance + charge) * 10000) / 10000;
        await save();
        return res.status(502).json({ detail: `Supplier error: ${e.message}` });
      }
    }
    const o = { order_id: uid("ord"), user_id: req.user.user_id, service_id, service_name: svc.name, platform: svc.platform, link, quantity: qty, charge, status: "Pending", start_count: 0, remains: qty, supplier_id: svc.supplier_id, supplier_order_id, created_at: nowIso(), updated_at: nowIso() };
    db.data.orders.push(o);
    db.data.transactions.push({ tx_id: uid("tx"), user_id: req.user.user_id, provider: "wallet", amount: -charge, currency: "usd", status: "completed", metadata: { order_id: o.order_id, service_name: svc.name }, created_at: nowIso() });
    await notify(req.user.user_id, "order", "Order placed", `${svc.name} × ${qty.toLocaleString()} for $${charge.toFixed(2)}`, "/orders");
    await save();
    res.json(o);
  });
  app.post("/api/orders/:id/sync", requireAuth, async (req, res) => {
    const o = db.data.orders.find((x) => x.order_id === req.params.id && x.user_id === req.user.user_id);
    if (!o) return res.status(404).json({ detail: "Not found" });
    const supplier = db.data.suppliers.find((s) => s.supplier_id === o.supplier_id);
    if (supplier && supplier.is_mock) progressMockOrder(o);
    else if (supplier && o.supplier_order_id) {
      try {
        const r = await supplierCall(supplier, { action: "status", order: o.supplier_order_id });
        o.status = normalizeStatus(r.status || o.status);
        o.remains = parseInt(r.remains || o.remains || 0, 10);
        o.start_count = parseInt(r.start_count || o.start_count || 0, 10);
        o.updated_at = nowIso();
      } catch {}
    }
    await save();
    res.json(o);
  });
  app.post("/api/orders/sync-all", requireAuth, async (req, res) => {
    const mine = db.data.orders.filter((x) => x.user_id === req.user.user_id && !["Completed", "Canceled"].includes(x.status));
    let n = 0;
    for (const o of mine) {
      const supplier = db.data.suppliers.find((s) => s.supplier_id === o.supplier_id);
      if (!supplier) continue;
      if (supplier.is_mock) { progressMockOrder(o); n++; }
      else if (o.supplier_order_id) {
        try { const r = await supplierCall(supplier, { action: "status", order: o.supplier_order_id }); o.status = normalizeStatus(r.status || o.status); o.remains = parseInt(r.remains || 0, 10); o.updated_at = nowIso(); n++; } catch {}
      }
    }
    await save();
    res.json({ synced: n });
  });
  app.post("/api/orders/:id/cancel", requireAuth, async (req, res) => {
    const o = db.data.orders.find((x) => x.order_id === req.params.id && x.user_id === req.user.user_id);
    if (!o) return res.status(404).json({ detail: "Not found" });
    if (!["Pending", "In Progress"].includes(o.status)) return res.status(400).json({ detail: "Cannot cancel" });
    o.status = "Canceled"; o.updated_at = nowIso();
    req.user.balance = Math.round((req.user.balance + o.charge) * 10000) / 10000;
    db.data.transactions.push({ tx_id: uid("tx"), user_id: req.user.user_id, provider: "refund", amount: o.charge, currency: "usd", status: "completed", metadata: { order_id: o.order_id, reason: "user_cancel" }, created_at: nowIso() });
    await notify(req.user.user_id, "order", "Order canceled", `Refunded $${o.charge.toFixed(2)} for ${o.order_id.slice(-8).toUpperCase()}`, "/orders");
    await save();
    res.json({ ok: true, refunded: o.charge });
  });
  app.post("/api/orders/:id/refill", requireAuth, async (req, res) => {
    const o = db.data.orders.find((x) => x.order_id === req.params.id && x.user_id === req.user.user_id);
    if (!o) return res.status(404).json({ detail: "Not found" });
    const svc = db.data.services.find((s) => s.service_id === o.service_id);
    if (!svc || !svc.refill_supported) return res.status(400).json({ detail: "Refills not supported for this service" });
    if (!["Completed", "Partial"].includes(o.status)) return res.status(400).json({ detail: "Refill only after completion" });
    if (db.data.refills.find((r) => r.order_id === o.order_id && ["pending", "processing"].includes(r.status))) return res.status(400).json({ detail: "Already pending" });
    const r = { refill_id: uid("ref"), order_id: o.order_id, user_id: req.user.user_id, status: "pending", reason: (req.body || {}).reason, created_at: nowIso() };
    db.data.refills.push(r);
    await save();
    res.json(r);
  });
  app.get("/api/refills", requireAuth, (req, res) => res.json(db.data.refills.filter((r) => r.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at))));

  // Bulk
  app.post("/api/orders/bulk", requireAuth, async (req, res) => {
    res.status(501).json({ detail: "Bulk upload available in hosted version only (multipart parsing not bundled)." });
  });

  // ---- Favorites ----
  app.get("/api/favorites", requireAuth, (req, res) => { const ids = db.data.favorites[req.user.user_id] || []; res.json(db.data.services.filter((s) => ids.includes(s.service_id))); });
  app.post("/api/favorites", requireAuth, async (req, res) => { const a = db.data.favorites[req.user.user_id] || []; if (!a.includes(req.body.service_id)) a.push(req.body.service_id); db.data.favorites[req.user.user_id] = a; await save(); res.json({ ok: true }); });
  app.delete("/api/favorites/:sid", requireAuth, async (req, res) => { db.data.favorites[req.user.user_id] = (db.data.favorites[req.user.user_id] || []).filter((x) => x !== req.params.sid); await save(); res.json({ ok: true }); });

  // ---- My accounts ----
  app.get("/api/me/accounts", requireAuth, (req, res) => {
    const rows = db.data.user_accounts.filter((a) => a.user_id === req.user.user_id);
    rows.forEach((a) => {
      const matches = db.data.orders.filter((o) => o.user_id === req.user.user_id && o.platform === a.platform && (o.link === a.link || (a.handle && (o.link || "").toLowerCase().includes(a.handle.replace("@", "").toLowerCase()))));
      a.stats = { orders: matches.length, spend: Math.round(matches.reduce((s, o) => s + (o.charge || 0), 0) * 100) / 100 };
    });
    res.json(rows);
  });
  app.post("/api/me/accounts", requireAuth, async (req, res) => {
    const a = { account_id: uid("acc"), user_id: req.user.user_id, platform: (req.body.platform || "").toLowerCase(), handle: (req.body.handle || "").trim(), link: (req.body.link || "").trim() || null, label: (req.body.label || "").trim() || null, created_at: nowIso() };
    db.data.user_accounts.push(a);
    await save();
    res.json(a);
  });
  app.delete("/api/me/accounts/:id", requireAuth, async (req, res) => { const n = db.data.user_accounts.length; db.data.user_accounts = db.data.user_accounts.filter((a) => !(a.account_id === req.params.id && a.user_id === req.user.user_id)); await save(); res.json({ ok: n !== db.data.user_accounts.length }); });

  // ---- Wallet & payments ----
  app.get("/api/wallet/balance", requireAuth, (req, res) => res.json({ balance: req.user.balance }));
  app.get("/api/wallet/transactions", requireAuth, (req, res) => res.json(db.data.transactions.filter((t) => t.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at))));

  app.post("/api/payments/stripe/checkout", requireAuth, async (req, res) => {
    const allowed = new Set([5, 10, 25, 50, 100, 250, 500, 1000]);
    const amount = Number(req.body.amount);
    if (!allowed.has(amount)) return res.status(400).json({ detail: "Invalid amount" });
    try {
      const origin = (req.body.origin_url || "").replace(/\/$/, "");
      const s = await stripeCreateCheckout({
        amount,
        success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/add-funds?canceled=1`,
        metadata: { user_id: req.user.user_id, email: req.user.email, purpose: "wallet_topup" },
      });
      db.data.transactions.push({ tx_id: uid("tx"), user_id: req.user.user_id, provider: "stripe", session_id: s.id, amount, currency: "usd", status: "initiated", metadata: {}, created_at: nowIso() });
      await save();
      res.json({ url: s.url, session_id: s.id });
    } catch (e) { res.status(502).json({ detail: `Stripe error: ${e.message}` }); }
  });
  app.get("/api/payments/stripe/status/:id", requireAuth, async (req, res) => {
    const tx = db.data.transactions.find((t) => t.session_id === req.params.id && t.provider === "stripe");
    if (!tx) return res.status(404).json({ detail: "Not found" });
    if (tx.status === "paid") return res.json({ session_id: tx.session_id, status: "paid", payment_status: "paid", amount_total: Math.round(tx.amount * 100), currency: "usd", already_processed: true });
    try {
      const s = await stripeGetSession(req.params.id);
      if (s.payment_status === "paid" && tx.status !== "paid") {
        tx.status = "paid"; tx.payment_status = "paid";
        req.user.balance = Math.round((req.user.balance + tx.amount) * 10000) / 10000;
        await notify(req.user.user_id, "payment", "Payment received", `$${tx.amount.toFixed(2)} added via Stripe`, "/transactions");
        await save();
      }
      res.json({ session_id: s.id, status: tx.status, payment_status: s.payment_status, amount_total: s.amount_total, currency: s.currency });
    } catch (e) { res.json({ session_id: req.params.id, status: tx.status, payment_status: null, amount_total: Math.round(tx.amount * 100), currency: "usd", error: e.message }); }
  });

  app.post("/api/payments/paypal/checkout", requireAuth, async (req, res) => {
    const allowed = new Set([5, 10, 25, 50, 100, 250, 500, 1000]);
    const amount = Number(req.body.amount);
    if (!allowed.has(amount)) return res.status(400).json({ detail: "Invalid amount" });
    const origin = (req.body.origin_url || "").replace(/\/$/, "");
    const tx_id = uid("tx");
    try {
      const order = await ppCreateOrder({ amount, returnUrl: `${origin}/payment/success?provider=paypal`, cancelUrl: `${origin}/add-funds?canceled=1`, tx_id, user_id: req.user.user_id });
      db.data.transactions.push({ tx_id, user_id: req.user.user_id, provider: "paypal", session_id: order.id, amount, currency: "usd", status: "initiated", metadata: { paypal_order_id: order.id }, created_at: nowIso() });
      await save();
      res.json({ url: order.approve_url, session_id: order.id, provider: "paypal" });
    } catch (e) { res.status(502).json({ detail: `PayPal error: ${e.message}` }); }
  });
  app.get("/api/payments/paypal/status/:id", requireAuth, async (req, res) => {
    const tx = db.data.transactions.find((t) => t.session_id === req.params.id && t.provider === "paypal");
    if (!tx) return res.status(404).json({ detail: "Not found" });
    if (tx.status === "paid") return res.json({ session_id: tx.session_id, status: "paid", payment_status: "paid", amount_total: Math.round(tx.amount * 100), currency: "usd", already_processed: true });
    try {
      const o = await ppGetOrder(req.params.id);
      let newStatus = tx.status;
      if (o.status === "APPROVED") { try { const c = await ppCaptureOrder(req.params.id); if (c.status === "COMPLETED") newStatus = "paid"; } catch {} }
      else if (o.status === "COMPLETED") newStatus = "paid";
      else if (["VOIDED", "EXPIRED"].includes(o.status)) newStatus = "expired";
      if (newStatus === "paid" && tx.status !== "paid") { tx.status = "paid"; tx.payment_status = "paid"; req.user.balance = Math.round((req.user.balance + tx.amount) * 10000) / 10000; await notify(req.user.user_id, "payment", "Payment received", `$${tx.amount.toFixed(2)} added via PayPal`, "/transactions"); }
      else tx.status = newStatus;
      await save();
      res.json({ session_id: req.params.id, status: tx.status, payment_status: tx.payment_status, amount_total: Math.round(tx.amount * 100), currency: "usd" });
    } catch (e) { res.json({ session_id: req.params.id, status: tx.status, payment_status: null, amount_total: Math.round(tx.amount * 100), currency: "usd", error: e.message }); }
  });

  // ---- Notifications ----
  app.get("/api/notifications", requireAuth, (req, res) => { const mine = db.data.notifications.filter((n) => n.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at)); res.json({ notifications: mine, unread: mine.filter((n) => !n.read).length }); });
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => { db.data.notifications.forEach((n) => { if (n.user_id === req.user.user_id) n.read = true; }); await save(); res.json({ ok: true }); });
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => { const n = db.data.notifications.find((x) => x.notif_id === req.params.id && x.user_id === req.user.user_id); if (n) n.read = true; await save(); res.json({ ok: !!n }); });

  // ---- Tickets ----
  app.post("/api/tickets", requireAuth, async (req, res) => {
    const { subject, category, message } = req.body || {};
    if (!subject || !message) return res.status(400).json({ detail: "subject + message required" });
    const t = { ticket_id: uid("tkt"), user_id: req.user.user_id, user_email: req.user.email, user_name: req.user.name, subject, category: category || "General", status: "open", priority: "normal", messages: [{ message_id: uid("msg"), sender_id: req.user.user_id, sender_name: req.user.name, sender_role: req.user.role, message, created_at: nowIso() }], created_at: nowIso(), updated_at: nowIso() };
    db.data.tickets.push(t);
    await save();
    res.json(t);
  });
  app.get("/api/tickets", requireAuth, (req, res) => res.json(db.data.tickets.filter((t) => t.user_id === req.user.user_id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))));
  app.get("/api/tickets/:id", requireAuth, (req, res) => { const t = db.data.tickets.find((x) => x.ticket_id === req.params.id); if (!t) return res.status(404).json({ detail: "Not found" }); if (t.user_id !== req.user.user_id && !["admin", "manager"].includes(req.user.role)) return res.status(403).json({ detail: "Not yours" }); res.json(t); });
  app.post("/api/tickets/:id/reply", requireAuth, async (req, res) => {
    const t = db.data.tickets.find((x) => x.ticket_id === req.params.id);
    if (!t) return res.status(404).json({ detail: "Not found" });
    const isAdmin = ["admin", "manager"].includes(req.user.role);
    if (t.user_id !== req.user.user_id && !isAdmin) return res.status(403).json({ detail: "Not allowed" });
    t.messages.push({ message_id: uid("msg"), sender_id: req.user.user_id, sender_name: req.user.name, sender_role: req.user.role, message: req.body.message, created_at: nowIso() });
    t.status = isAdmin ? "answered" : "pending"; t.updated_at = nowIso();
    await save();
    res.json(t);
  });

  // ---- API keys ----
  app.get("/api/me/api-keys", requireAuth, (req, res) => res.json(db.data.api_keys.filter((k) => k.user_id === req.user.user_id).map((k) => ({ ...k, key_masked: k.key.length > 10 ? k.key.slice(0, 6) + "•".repeat(k.key.length - 10) + k.key.slice(-4) : k.key }))));
  app.post("/api/me/api-keys", requireAuth, async (req, res) => {
    const active = db.data.api_keys.filter((k) => k.user_id === req.user.user_id && k.active).length;
    if (active >= 5) return res.status(400).json({ detail: "Max 5 active keys" });
    const k = { key_id: uid("apk"), user_id: req.user.user_id, key: "sbp_" + crypto.randomBytes(32).toString("base64url"), label: (req.body || {}).label || `Key ${active + 1}`, active: true, calls: 0, last_used_at: null, created_at: nowIso() };
    db.data.api_keys.push(k);
    await save();
    res.json(k);
  });
  app.post("/api/me/api-keys/:id/revoke", requireAuth, async (req, res) => { const k = db.data.api_keys.find((x) => x.key_id === req.params.id && x.user_id === req.user.user_id); if (!k) return res.status(404).json({ detail: "Not found" }); k.active = false; await save(); res.json({ ok: true }); });
  app.delete("/api/me/api-keys/:id", requireAuth, async (req, res) => { db.data.api_keys = db.data.api_keys.filter((k) => !(k.key_id === req.params.id && k.user_id === req.user.user_id)); await save(); res.json({ ok: true }); });

  // ---- Reseller v2 ----
  const resolveKey = (req) => {
    const key = req.headers["x-api-key"] || (req.body && req.body.key) || (req.query && req.query.key);
    if (!key) return null;
    const k = db.data.api_keys.find((x) => x.key === key && x.active);
    if (!k) return null;
    k.calls = (k.calls || 0) + 1; k.last_used_at = nowIso();
    return db.data.users.find((u) => u.user_id === k.user_id);
  };
  app.all("/api/v2", async (req, res) => {
    const u = resolveKey(req); if (!u) return res.status(401).json({ detail: "Invalid API key" });
    const action = (req.body.action || "").toLowerCase();
    if (action === "balance") return res.json({ balance: u.balance, currency: "USD" });
    if (action === "services") return res.json(db.data.services.filter((s) => s.active !== false).map((s) => ({ service: s.service_id, name: s.name, category: `${s.platform} - ${s.category}`, type: s.type || "Default", rate: String(s.rate), min: String(s.min), max: String(s.max), refill: !!s.refill_supported, cancel: !!s.cancel_supported })));
    if (action === "add") { req.user = u; return app._router.handle(Object.assign(req, { method: "POST", url: "/api/orders", body: { service_id: req.body.service, link: req.body.link, quantity: req.body.quantity } }), res, () => {}); }
    if (action === "status") { const o = db.data.orders.find((x) => x.order_id === req.body.order && x.user_id === u.user_id); if (!o) return res.json({ error: "Order not found" }); return res.json({ status: o.status, remains: o.remains, start_count: o.start_count, charge: o.charge }); }
    res.status(400).json({ detail: "Unknown action" });
  });

  // ---- Admin ----
  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    res.json({
      users: { total: db.data.users.length, active: db.data.users.filter((u) => u.status === "active").length, suspended: db.data.users.filter((u) => u.status === "suspended").length },
      orders: { total: db.data.orders.length, pending: db.data.orders.filter((o) => ["Pending", "In Progress", "Processing"].includes(o.status)).length, completed: db.data.orders.filter((o) => o.status === "Completed").length },
      services: db.data.services.length,
      suppliers: db.data.suppliers.length,
      revenue: Math.round(db.data.transactions.filter((t) => ["stripe", "paypal"].includes(t.provider) && t.status === "paid").reduce((a, t) => a + (t.amount || 0), 0) * 100) / 100,
      spend: Math.round(db.data.orders.reduce((a, o) => a + (o.charge || 0), 0) * 100) / 100,
    });
  });
  app.get("/api/admin/users", requireAdmin, (_, res) => res.json(db.data.users.map(strip)));
  app.post("/api/admin/users", requireAdmin, async (req, res) => { const { email, password, name, role, balance } = req.body; if (db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ detail: "Exists" }); const u = { user_id: uid("user"), email: email.toLowerCase(), name, password_hash: bcrypt.hashSync(password, 10), role: role || "user", balance: balance || 0, status: "active", auth_provider: "local", created_at: nowIso() }; db.data.users.push(u); await save(); res.json(strip(u)); });
  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => { const u = db.data.users.find((x) => x.user_id === req.params.id); if (!u) return res.status(404).json({ detail: "Not found" }); Object.assign(u, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null))); await save(); res.json(strip(u)); });
  app.post("/api/admin/users/:id/adjust-balance", requireAdmin, async (req, res) => { const u = db.data.users.find((x) => x.user_id === req.params.id); if (!u) return res.status(404).json({ detail: "Not found" }); u.balance = Math.round((u.balance + Number(req.body.amount)) * 10000) / 10000; db.data.transactions.push({ tx_id: uid("tx"), user_id: u.user_id, provider: "admin", amount: Number(req.body.amount), currency: "usd", status: "completed", metadata: { note: req.body.note, admin: req.user.email }, created_at: nowIso() }); await save(); res.json(strip(u)); });
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => { if (req.params.id === req.user.user_id) return res.status(400).json({ detail: "Cannot delete yourself" }); db.data.users = db.data.users.filter((u) => u.user_id !== req.params.id); await save(); res.json({ ok: true }); });

  app.get("/api/admin/roles", requireAdmin, (_, res) => res.json(db.data.roles));
  app.post("/api/admin/roles", requireAdmin, async (req, res) => { const r = { role_id: uid("role"), name: (req.body.name || "").toLowerCase(), permissions: req.body.permissions || [], is_system: false, created_at: nowIso() }; db.data.roles.push(r); await save(); res.json(r); });
  app.patch("/api/admin/roles/:id", requireAdmin, async (req, res) => { const r = db.data.roles.find((x) => x.role_id === req.params.id); if (!r) return res.status(404).json({ detail: "Not found" }); Object.assign(r, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null))); await save(); res.json(r); });
  app.delete("/api/admin/roles/:id", requireAdmin, async (req, res) => { const r = db.data.roles.find((x) => x.role_id === req.params.id); if (!r) return res.status(404).json({ detail: "Not found" }); if (r.is_system) return res.status(400).json({ detail: "System role" }); db.data.roles = db.data.roles.filter((x) => x.role_id !== req.params.id); await save(); res.json({ ok: true }); });

  app.get("/api/admin/suppliers", requireAdmin, (_, res) => res.json(db.data.suppliers));
  app.post("/api/admin/suppliers", requireAdmin, async (req, res) => { const s = { supplier_id: uid("sup"), name: req.body.name, api_url: req.body.api_url, api_key: req.body.api_key, notes: req.body.notes, status: "active", is_mock: false, created_at: nowIso() }; db.data.suppliers.push(s); await save(); res.json(s); });
  app.patch("/api/admin/suppliers/:id", requireAdmin, async (req, res) => { const s = db.data.suppliers.find((x) => x.supplier_id === req.params.id); if (!s) return res.status(404).json({ detail: "Not found" }); Object.assign(s, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null))); await save(); res.json(s); });
  app.delete("/api/admin/suppliers/:id", requireAdmin, async (req, res) => { if (req.params.id === "sup_mock_default") return res.status(400).json({ detail: "Cannot delete mock" }); db.data.suppliers = db.data.suppliers.filter((s) => s.supplier_id !== req.params.id); await save(); res.json({ ok: true }); });
  app.post("/api/admin/suppliers/:id/import-services", requireAdmin, async (req, res) => {
    const s = db.data.suppliers.find((x) => x.supplier_id === req.params.id);
    if (!s) return res.status(404).json({ detail: "Not found" });
    if (s.is_mock) return res.json({ imported: 0, updated: 0, skipped: db.data.services.filter((x) => x.supplier_id === s.supplier_id).length, note: "Mock pre-seeded; nothing to import." });
    const markup = (req.body && req.body.markup) || 2.0;
    try {
      const r = await fetch(s.api_url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key: s.api_key, action: "services" }) });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("not an array");
      let imported = 0, updated = 0;
      for (const it of data) {
        const sup_sid = String(it.service);
        const existing = db.data.services.find((x) => x.supplier_id === s.supplier_id && x.supplier_service_id === sup_sid);
        const cat = (it.category || "").toLowerCase();
        const platform = ["instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin", "telegram", "spotify", "discord", "twitch"].find((p) => cat.includes(p)) || "other";
        const category = ["followers", "likes", "views", "comments", "shares", "subscribers"].map((c) => c.charAt(0).toUpperCase() + c.slice(1)).find((c) => cat.includes(c.toLowerCase())) || "Other";
        const supplier_rate = parseFloat(it.rate || 0);
        const rate = Math.round(supplier_rate * markup * 10000) / 10000;
        const payload = { name: it.name, rate, supplier_rate, min: parseInt(it.min || 50, 10), max: parseInt(it.max || 10000, 10), type: it.type || "Default", platform, category, supplier_id: s.supplier_id, supplier_service_id: sup_sid, active: true, refill_supported: !!it.refill, cancel_supported: !!it.cancel };
        if (existing) { Object.assign(existing, payload); updated++; }
        else { db.data.services.push({ service_id: uid("svc"), description: `Imported from ${s.name}`, created_at: nowIso(), ...payload }); imported++; }
      }
      await save();
      res.json({ imported, updated, markup, total: imported + updated });
    } catch (e) { res.status(502).json({ detail: `Supplier error: ${e.message}` }); }
  });

  app.get("/api/admin/services", requireAdmin, (_, res) => res.json(db.data.services));
  app.post("/api/admin/services", requireAdmin, async (req, res) => { const svc = { service_id: uid("svc"), created_at: nowIso(), ...req.body }; db.data.services.push(svc); await save(); res.json(svc); });
  app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => { const svc = db.data.services.find((x) => x.service_id === req.params.id); if (!svc) return res.status(404).json({ detail: "Not found" }); Object.assign(svc, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null))); await save(); res.json(svc); });
  app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => { db.data.services = db.data.services.filter((s) => s.service_id !== req.params.id); await save(); res.json({ ok: true }); });

  app.get("/api/admin/orders", requireAdmin, (req, res) => { let o = db.data.orders; if (req.query.status) o = o.filter((x) => x.status === req.query.status); res.json(o.sort((a, b) => b.created_at.localeCompare(a.created_at))); });
  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => { const o = db.data.orders.find((x) => x.order_id === req.params.id); if (!o) return res.status(404).json({ detail: "Not found" }); Object.assign(o, Object.fromEntries(Object.entries(req.body).filter(([k, v]) => ["status", "remains", "start_count", "supplier_order_id"].includes(k) && v != null))); o.updated_at = nowIso(); await save(); res.json(o); });
  app.get("/api/admin/transactions", requireAdmin, (_, res) => res.json(db.data.transactions.sort((a, b) => b.created_at.localeCompare(a.created_at))));
  app.get("/api/admin/tickets", requireAdmin, (req, res) => { let t = db.data.tickets; if (req.query.status) t = t.filter((x) => x.status === req.query.status); res.json(t.sort((a, b) => b.updated_at.localeCompare(a.updated_at))); });
  app.patch("/api/admin/tickets/:id", requireAdmin, async (req, res) => { const t = db.data.tickets.find((x) => x.ticket_id === req.params.id); if (!t) return res.status(404).json({ detail: "Not found" }); Object.assign(t, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v != null))); t.updated_at = nowIso(); await save(); res.json(t); });
  app.get("/api/admin/refills", requireAdmin, (_, res) => res.json(db.data.refills));
  app.patch("/api/admin/refills/:id", requireAdmin, async (req, res) => { const r = db.data.refills.find((x) => x.refill_id === req.params.id); if (!r) return res.status(404).json({ detail: "Not found" }); r.status = req.body.status; r.updated_at = nowIso(); await save(); res.json(r); });
  app.get("/api/admin/announcements", requireAdmin, (_, res) => res.json(db.data.announcements));
  app.post("/api/admin/announcements", requireAdmin, async (req, res) => { const a = { announcement_id: uid("ann"), title: req.body.title, body: req.body.body, severity: req.body.severity || "info", published: true, created_by: req.user.email, created_at: nowIso() }; db.data.announcements.push(a); for (const u of db.data.users.filter((x) => x.status === "active")) db.data.notifications.push({ notif_id: uid("ntf"), user_id: u.user_id, type: "announcement", title: a.title, message: a.body.slice(0, 200), link: "", read: false, created_at: nowIso() }); await save(); res.json(a); });
  app.delete("/api/admin/announcements/:id", requireAdmin, async (req, res) => { db.data.announcements = db.data.announcements.filter((a) => a.announcement_id !== req.params.id); await save(); res.json({ ok: true }); });
  app.get("/api/announcements", requireAuth, (_, res) => res.json(db.data.announcements.filter((a) => a.published).sort((a, b) => b.created_at.localeCompare(a.created_at))));
  app.get("/api/admin/profit", requireAdmin, (_, res) => {
    const totals = { revenue: 0, cost: 0, profit: 0, orders: db.data.orders.length };
    const byPlat = {}; const byService = {};
    for (const o of db.data.orders) {
      const svc = db.data.services.find((s) => s.service_id === o.service_id) || {};
      const cost = (svc.supplier_rate || 0) * (o.quantity || 0) / 1000;
      const rev = o.charge || 0; const prof = rev - cost;
      totals.revenue += rev; totals.cost += cost; totals.profit += prof;
      (byPlat[o.platform] ||= { platform: o.platform, orders: 0, revenue: 0, cost: 0, profit: 0 });
      byPlat[o.platform].orders++; byPlat[o.platform].revenue += rev; byPlat[o.platform].cost += cost; byPlat[o.platform].profit += prof;
      (byService[o.service_name] ||= { service_name: o.service_name, orders: 0, revenue: 0, cost: 0, profit: 0 });
      byService[o.service_name].orders++; byService[o.service_name].revenue += rev; byService[o.service_name].cost += cost; byService[o.service_name].profit += prof;
    }
    const round = (o) => { for (const k of ["revenue", "cost", "profit"]) o[k] = Math.round(o[k] * 100) / 100; return o; };
    res.json({ totals: round(totals), by_platform: Object.values(byPlat).map(round), top_services: Object.values(byService).map(round).sort((a, b) => b.profit - a.profit).slice(0, 15) });
  });
  app.get("/api/analytics/platform/:platform", requireAuth, (req, res) => {
    const platform = req.params.platform.toLowerCase();
    const services_total = db.data.services.filter((s) => s.platform === platform && s.active !== false).length;
    const mine = db.data.orders.filter((o) => o.user_id === req.user.user_id && o.platform === platform);
    const by = {};
    mine.forEach((o) => { (by[o.service_name] ||= { name: o.service_name, count: 0, spend: 0 }); by[o.service_name].count++; by[o.service_name].spend += o.charge || 0; });
    res.json({ platform, services_total, orders: mine.length, spend: Math.round(mine.reduce((s, o) => s + (o.charge || 0), 0) * 100) / 100, completed: mine.filter((o) => o.status === "Completed").length, active: mine.filter((o) => ["Pending", "In Progress", "Processing"].includes(o.status)).length, top_services: Object.values(by).sort((a, b) => b.spend - a.spend).slice(0, 10) });
  });

  // Serve React build
  const webDir = path.join(__dirname, "..", "web-dist");
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/api\/).*/, (_, res) => res.sendFile(path.join(webDir, "index.html")));
  } else {
    app.get("/", (_, res) => res.send(`<html><body style="font-family:sans-serif;padding:40px;max-width:640px;margin:auto"><h1>SocialBoost Pro (desktop)</h1><p>Backend running on port ${port}. Build the UI first:</p><pre>cd frontend && yarn build && cp -r build ../electron/web-dist</pre></body></html>`));
  }

  return new Promise((resolve) => {
    const srv = app.listen(port, "127.0.0.1", () => { console.log(`[socialboost-pro] full backend on http://127.0.0.1:${port}`); resolve(srv); });
  });
}

module.exports = { startServer };
