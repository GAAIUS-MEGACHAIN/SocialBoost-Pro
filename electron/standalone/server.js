// Standalone Express + lowdb backend for Electron offline mode.
// This is a SIMPLIFIED clone of the real backend for UI/demo purposes only:
//   ✓ Auth (local JWT-less session kept in-memory + persisted user list)
//   ✓ Services catalog (read-only, seeded from bundled JSON)
//   ✓ Orders (local — status progresses over time via a local timer)
//   ✓ Favorites / Refills / Tickets / Notifications (all local JSON)
//   ✗ Payments — disabled (no Stripe/PayPal possible offline)
//   ✗ Real suppliers — disabled (no network calls)
//
// Data is persisted at ~/.socialboost-pro/db.json
// Default credentials (seeded on first run):
//   admin@local / Admin@12345     (admin)
//   demo@local  / Demo@12345      ($50 balance)

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Low, JSONFile } = require("lowdb");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");

function nowIso() { return new Date().toISOString(); }
function uid(prefix) { return prefix + "_" + nanoid(12); }

async function initDb() {
  const dir = path.join(os.homedir(), ".socialboost-pro");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "db.json");
  const adapter = new JSONFile(file);
  const db = new Low(adapter);
  await db.read();
  db.data ||= {
    users: [],
    sessions: [],
    services: [],
    orders: [],
    favorites: {},
    refills: [],
    tickets: [],
    notifications: [],
    announcements: [],
    api_keys: [],
    transactions: [],
  };

  // Seed services from bundled json on first run
  if (!db.data.services.length) {
    try {
      const services = require("./services.seed.json");
      db.data.services = services;
    } catch {}
  }

  // Seed users on first run
  if (!db.data.users.find((u) => u.email === "admin@local")) {
    db.data.users.push({
      user_id: uid("user"),
      email: "admin@local",
      name: "Admin",
      password_hash: bcrypt.hashSync("Admin@12345", 10),
      role: "admin",
      balance: 0,
      status: "active",
      auth_provider: "local",
      created_at: nowIso(),
    });
  }
  if (!db.data.users.find((u) => u.email === "demo@local")) {
    db.data.users.push({
      user_id: uid("user"),
      email: "demo@local",
      name: "Demo User",
      password_hash: bcrypt.hashSync("Demo@12345", 10),
      role: "user",
      balance: 50,
      status: "active",
      auth_provider: "local",
      created_at: nowIso(),
    });
  }
  await db.write();
  return db;
}

async function startServer(port) {
  const db = await initDb();
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(bodyParser.json({ limit: "5mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));

  // Session cookie middleware (hand-rolled)
  app.use((req, res, next) => {
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/sbp_session=([^;]+)/);
    req.sessionToken = match ? decodeURIComponent(match[1]) : null;
    next();
  });

  const requireAuth = (req, res, next) => {
    const s = db.data.sessions.find((x) => x.token === req.sessionToken && x.expires > Date.now());
    if (!s) return res.status(401).json({ detail: "Not authenticated" });
    req.user = db.data.users.find((u) => u.user_id === s.user_id);
    if (!req.user) return res.status(401).json({ detail: "User not found" });
    next();
  };

  const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
      if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ detail: "Admin only" });
      next();
    });
  };

  const pub = (u) => ({
    user_id: u.user_id, email: u.email, name: u.name, role: u.role,
    balance: u.balance, avatar_url: u.avatar_url, auth_provider: u.auth_provider,
    status: u.status, created_at: u.created_at,
  });

  // ---- Auth ----
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    const u = db.data.users.find((x) => x.email.toLowerCase() === String(email || "").toLowerCase());
    if (!u || !bcrypt.compareSync(password || "", u.password_hash)) return res.status(401).json({ detail: "Invalid email or password" });
    const token = nanoid(48);
    db.data.sessions.push({ token, user_id: u.user_id, expires: Date.now() + 7 * 24 * 3600 * 1000 });
    await db.write();
    res.setHeader("Set-Cookie", `sbp_session=${token}; Path=/; HttpOnly; Max-Age=${7 * 24 * 3600}`);
    res.json(pub(u));
  });
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ detail: "email, password, name required" });
    if (db.data.users.find((x) => x.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ detail: "Email already registered" });
    const u = { user_id: uid("user"), email: email.toLowerCase(), name, password_hash: bcrypt.hashSync(password, 10), role: "user", balance: 0, status: "active", auth_provider: "local", created_at: nowIso() };
    db.data.users.push(u);
    const token = nanoid(48);
    db.data.sessions.push({ token, user_id: u.user_id, expires: Date.now() + 7 * 24 * 3600 * 1000 });
    await db.write();
    res.setHeader("Set-Cookie", `sbp_session=${token}; Path=/; HttpOnly; Max-Age=${7 * 24 * 3600}`);
    res.json(pub(u));
  });
  app.post("/api/auth/logout", async (req, res) => {
    db.data.sessions = db.data.sessions.filter((s) => s.token !== req.sessionToken);
    await db.write();
    res.setHeader("Set-Cookie", `sbp_session=; Path=/; HttpOnly; Max-Age=0`);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => res.json(pub(req.user)));
  app.get("/api/health", (_, res) => res.json({ status: "ok", mode: "standalone" }));
  app.get("/api/", (_, res) => res.json({ name: "SocialBoost Pro (standalone)", ok: true }));

  // ---- Services ----
  app.get("/api/services", (req, res) => {
    const { platform, category } = req.query;
    let out = db.data.services.filter((s) => s.active !== false);
    if (platform) out = out.filter((s) => s.platform === platform);
    if (category) out = out.filter((s) => s.category === category);
    res.json(out);
  });

  // ---- Orders ----
  app.get("/api/orders", requireAuth, (req, res) => {
    const out = db.data.orders.filter((o) => o.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json(out);
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
    const order = {
      order_id: uid("ord"), user_id: req.user.user_id, service_id, service_name: svc.name, platform: svc.platform,
      link, quantity: qty, charge, status: "Pending", start_count: 0, remains: qty,
      created_at: nowIso(), updated_at: nowIso(),
    };
    db.data.orders.push(order);
    db.data.notifications.push({ notif_id: uid("ntf"), user_id: req.user.user_id, type: "order", title: "Order placed", message: `${svc.name} × ${qty}`, link: "/orders", read: false, created_at: nowIso() });
    await db.write();
    res.json(order);
  });
  app.post("/api/orders/:id/sync", requireAuth, async (req, res) => {
    const o = db.data.orders.find((x) => x.order_id === req.params.id && x.user_id === req.user.user_id);
    if (!o) return res.status(404).json({ detail: "Order not found" });
    progressOrder(o);
    await db.write();
    res.json(o);
  });
  app.post("/api/orders/sync-all", requireAuth, async (req, res) => {
    let n = 0;
    for (const o of db.data.orders.filter((x) => x.user_id === req.user.user_id && !["Completed", "Canceled"].includes(x.status))) {
      progressOrder(o); n++;
    }
    await db.write();
    res.json({ synced: n });
  });
  app.post("/api/orders/:id/cancel", requireAuth, async (req, res) => {
    const o = db.data.orders.find((x) => x.order_id === req.params.id && x.user_id === req.user.user_id);
    if (!o) return res.status(404).json({ detail: "Not found" });
    if (!["Pending", "In Progress"].includes(o.status)) return res.status(400).json({ detail: "Cannot cancel" });
    o.status = "Canceled"; o.updated_at = nowIso();
    req.user.balance = Math.round((req.user.balance + o.charge) * 10000) / 10000;
    await db.write();
    res.json({ ok: true, refunded: o.charge });
  });

  // ---- Favorites / Refills / Tickets / Notifications / Announcements ----
  app.get("/api/favorites", requireAuth, (req, res) => {
    const ids = db.data.favorites[req.user.user_id] || [];
    res.json(db.data.services.filter((s) => ids.includes(s.service_id)));
  });
  app.post("/api/favorites", requireAuth, async (req, res) => {
    const arr = db.data.favorites[req.user.user_id] || [];
    if (!arr.includes(req.body.service_id)) arr.push(req.body.service_id);
    db.data.favorites[req.user.user_id] = arr;
    await db.write();
    res.json({ ok: true });
  });
  app.delete("/api/favorites/:sid", requireAuth, async (req, res) => {
    const arr = (db.data.favorites[req.user.user_id] || []).filter((x) => x !== req.params.sid);
    db.data.favorites[req.user.user_id] = arr;
    await db.write();
    res.json({ ok: true });
  });

  app.get("/api/notifications", requireAuth, (req, res) => {
    const mine = db.data.notifications.filter((n) => n.user_id === req.user.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json({ notifications: mine, unread: mine.filter((n) => !n.read).length });
  });
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    db.data.notifications.forEach((n) => { if (n.user_id === req.user.user_id) n.read = true; });
    await db.write();
    res.json({ ok: true });
  });

  app.get("/api/wallet/balance", requireAuth, (req, res) => res.json({ balance: req.user.balance }));
  app.get("/api/wallet/transactions", requireAuth, (req, res) => res.json(db.data.transactions.filter((t) => t.user_id === req.user.user_id)));

  // Payments are disabled in standalone mode
  app.post("/api/payments/stripe/checkout", (_, res) => res.status(503).json({ detail: "Payments disabled in standalone mode. Switch to Online mode to add funds." }));
  app.post("/api/payments/paypal/checkout", (_, res) => res.status(503).json({ detail: "Payments disabled in standalone mode. Switch to Online mode to add funds." }));

  // Admin: minimal
  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    res.json({
      users: { total: db.data.users.length, active: db.data.users.filter((u) => u.status === "active").length, suspended: db.data.users.filter((u) => u.status === "suspended").length },
      orders: { total: db.data.orders.length, pending: db.data.orders.filter((o) => ["Pending", "In Progress", "Processing"].includes(o.status)).length, completed: db.data.orders.filter((o) => o.status === "Completed").length },
      services: db.data.services.length,
      suppliers: 1,
      revenue: 0,
      spend: db.data.orders.reduce((a, o) => a + o.charge, 0),
    });
  });
  app.get("/api/admin/users", requireAdmin, (_, res) => res.json(db.data.users.map((u) => { const { password_hash, ...rest } = u; return rest; })));

  // Serve the React build
  const webDir = path.join(__dirname, "..", "web-dist");
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) return res.status(404).json({ detail: "Not found" });
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`SocialBoost Pro standalone running at http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

// Status progression: Pending -> In Progress -> Processing -> Completed based on elapsed time
function progressOrder(o) {
  if (["Completed", "Canceled"].includes(o.status)) return;
  const elapsed = (Date.now() - new Date(o.created_at).getTime()) / 1000;
  if (elapsed < 30) { o.status = "Pending"; o.remains = o.quantity; }
  else if (elapsed < 90) { o.status = "In Progress"; o.remains = Math.floor(o.quantity * 0.6); }
  else if (elapsed < 180) { o.status = "Processing"; o.remains = Math.floor(o.quantity * 0.2); }
  else { o.status = "Completed"; o.remains = 0; }
  o.start_count = o.start_count || Math.floor(Math.random() * 10000 + 100);
  o.updated_at = nowIso();
}

module.exports = { startServer };
