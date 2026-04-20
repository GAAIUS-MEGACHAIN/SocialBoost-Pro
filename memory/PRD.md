# SocialBoost Pro — PRD & Memory

## Original Problem Statement
Launch a fully-featured SMM panel SaaS — clients place/track orders for Facebook, Instagram, Twitter, TikTok (and more) from a single responsive web interface. Must include: robust user management, custom roles beyond Admin/Manager/User, integrated payments (Stripe + PayPal), real-time order tracking pulling status from supplier APIs, clean code, API-ready architecture. Subsequent expansion: massive service catalog across 10+ platforms, reseller API, API keys, refills/cancels, favorites, CSV bulk + export, announcements, profit dashboard, in-app notifications, support tickets, and a cross-platform Electron desktop app.

## User Choices (cumulative)
- Payments: Stripe (active) + PayPal live sandbox (credentials provided)
- Suppliers: Generic standard SMM API layer + seeded mock; admin "Import services" action
- Auth: JWT (email/password) + Emergent-managed Google Social Login
- Services catalog: ~250-item seeded catalog; admin CRUD + supplier import
- Email: skipped — in-app notification bell instead
- Design: agent-chosen Swiss brutalist (Clash Display / Manrope / JetBrains Mono, Signal Red accent)
- Electron: dual-mode (Online wrapper + Standalone lowdb/JSON mode)

## Architecture
- **Backend** (`/app/backend/app/`): FastAPI + Motor (Mongo), modular routers:
  `auth.py`, `services_router.py`, `orders_router.py`, `payments_router.py` (Stripe + PayPal),
  `paypal.py` (REST client), `admin_router.py`, `tickets_router.py`, `notifications_router.py`,
  `api_v2_router.py` (reseller API + user API keys), `extras_router.py` (refills / cancels /
  favorites / bulk CSV / export / announcements / profit), `catalog_seed.py`, `suppliers.py`.
- **Frontend** (`/app/frontend/src/`): React 19 + React Router 7 + Shadcn UI + Tailwind.
  Pages: Landing, Login, Register, AuthCallback, Dashboard, ServicesBrowse, NewOrder, OrdersList,
  AddFunds, PaymentSuccess, Transactions, Support, Profile (+ API keys), Favorites, Refills,
  BulkUpload. Admin sub-panel: Overview, Profit, Users, Roles, Services, Suppliers, Orders,
  Refills, Transactions, Tickets, Announcements.
- **Integrations**: Stripe (emergentintegrations), PayPal REST v2 (sandbox), Emergent Google Auth.
- **Desktop**: `/app/electron/` — Electron main + preload + standalone express+lowdb backend
  at `~/.socialboost-pro/db.json`. Online mode wraps hosted URL; Standalone mode is UI-demo
  only (payments/suppliers disabled by design — they need internet regardless of storage).

## Data Collections
users · user_sessions · roles · suppliers · services (165) · orders · payment_transactions ·
tickets · notifications · api_keys · api_logs · refills · announcements · user_prefs (favorites)

## Personas
1. **Client / Reseller** — browses catalog, places orders (individually or bulk CSV), tracks progress,
   requests refills, cancels, tops up wallet (Stripe or PayPal), manages API keys, opens tickets,
   receives in-app notifications.
2. **Manager** — reads users/orders, updates order statuses, replies to tickets.
3. **Admin** — full CRUD on users/roles/suppliers/services, reviews profit, broadcasts announcements,
   processes refill requests, manages tickets.

## What's Been Implemented
### Core (iter 1–3)
- JWT register/login/me/logout + Emergent Google session.
- 16-platform seeded catalog (~165 services) with deterministic IDs; public + admin CRUD.
- Orders: create/list/sync/sync-all with mock supplier auto-progression; notifications on create/status.
- Payments: Stripe Checkout (fixed amounts 5/10/25/50/100/250/500/1000) + webhook + idempotent credit
  + resilient status polling. PayPal REST v2 live sandbox with approval URL + capture flow + idempotent
  credit + status polling; notification on paid.
- Wallet: balance + transactions.
- Support tickets (user + admin, reply threads, status transitions) + notifications.
- Admin: stats, users (create/edit/suspend/delete/adjust-balance), roles (CRUD + system protection),
  suppliers (CRUD + mock-protection + **action=services import**), services (CRUD), orders (status
  override), transactions, tickets triage.
- In-app notification bell (polling, mark-read).

### Iteration 4 (expansion)
- **Catalog expansion** to 16 platforms (added LinkedIn, Telegram, Spotify, Discord, Twitch, Website,
  App, WhatsApp, Pinterest, Snapchat, Threads) with quality variants (HQ, Premium, Real, Country-targeted,
  Drip-feed, Female, Monetized, Watch-Time, Live Viewers, Custom Comments, etc.).
- **Reseller API v2** (`/api/v2`): SMM-panel-standard endpoints (balance, services, add, status)
  accepting `X-Api-Key` header or `key=` body param, plus action dispatcher at `POST /api/v2`.
- **User API keys** — up to 5 active, label, rotate, revoke, delete; usage counter + last_used_at.
- **Favorites** — heart icon on Services; dedicated Favorites page.
- **Refills** — eligible on Completed/Partial orders where `refill_supported`; user list page + admin review.
- **Cancels** — eligible on Pending/In-Progress orders; auto-refund via wallet + notification.
- **Bulk CSV upload** — atomic pre-validation + single-charge deduct + per-row results.
- **CSV order export** — `GET /api/orders/export`.
- **Announcements** — admin publishes → broadcasts in-app notification to every active user.
- **Profit dashboard** — admin: totals, by-platform, top 15 services by profit.

### Iteration 4 bugs found and fixed
- Route shadowing (`/api/orders/export` masked by `/{order_id}`) — fixed by registering `extras_router`
  before `orders_router`.
- OrdersList missing lucide imports — fixed.
- Added testid parity for refill/cancel buttons; notification parity for order cancel.

### Electron desktop
- `/app/electron/package.json`, `main.js`, `preload.js`, `standalone/server.js` (express + lowdb +
  bcrypt), `standalone/services.seed.json`, `README.md`.
- Menu toggle between Online / Standalone mode (relaunches with env var).
- Packaging scripts: `yarn package:mac | :win | :linux`.

## Verified
- Iter 1: 26/27 + 2 bugs → fixed.
- Iter 2: 100% green, end-to-end order flow verified.
- Iter 3: 100% green — PayPal, tickets, notifications.
- Iter 4: 62/63 backend (1 fixed post-test: CSV export) + 100% frontend + 45/45 regression. All fixes applied.

## Credentials (seeded)
- `admin@socialboost.pro` / `Admin@12345` (admin)
- `demo@socialboost.pro` / `Demo@12345` (user, $50 balance)
- Electron standalone: `admin@local` / `Admin@12345`, `demo@local` / `Demo@12345`

## Prioritized Backlog
### P1
- **2FA** (TOTP) for admin accounts
- **Rate limiting** on `/api/auth/login` + reseller `/api/v2/*`
- **User-specific pricing** / reseller markup tiers (table + price override at order time)
- **Automatic supplier failover / smart routing** (pick cheapest-eligible supplier per service)
- **Webhook support for clients** (order status change callbacks)

### P2
- Email notifications (Resend/SendGrid) when user opts in
- Admin activity logs + system health dashboard
- Multi-currency (current: USD only)
- Fraud detection basics (IP velocity, card decline clustering)
- Drip-feed scheduler (bg job dispatches sub-batches over time)

### P3
- Plugin system (modular supplier adapters)
- Multi-language UI (i18n)
- Crypto payments (Stripe Crypto / Coinbase Commerce)

## Next Tasks
1. Deploy (user explicitly flagged removing "Made with Emergent" — needs Deploy, 50 credits/mo).
2. Wire real SMM supplier credentials in Admin → Suppliers → "Import services".
3. Bundle `frontend/build` into `electron/web-dist` for true offline standalone packaging.
4. Swap PayPal `PAYPAL_MODE` from `sandbox` to `live` when going to production.
