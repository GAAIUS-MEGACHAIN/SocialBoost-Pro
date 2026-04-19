# SocialBoost Pro — PRD & Memory

## Original Problem Statement
Launch a fully-featured Social Media Marketing (SMM) panel SaaS that lets clients place and track orders for Facebook, Instagram, Twitter, and TikTok services from a single responsive web interface. Must include: robust user management, custom roles beyond Admin/Manager/User, integrated payments (Stripe + PayPal minimum) with secure transactions and automatic order crediting, and real-time order tracking pulling status from supplier APIs with clear progress indicators. Clean code, API-ready architecture, concise setup guide.

## User Choices (confirmed)
- Payments: Stripe + PayPal (user to provide PayPal credentials; Stripe uses platform test key)
- Suppliers: Generic standard SMM API integration layer (seeded with internal mock)
- Auth: JWT email/password + Emergent-managed Google Social Login
- Services catalog: seeded with sample services for IG/TikTok/FB/X/YouTube
- Visual: agent-chosen (Swiss brutalist "command center" — Clash Display + Manrope, signal red accent)

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async). Modular routers under `/app/backend/app/`: `auth.py`, `services_router.py`, `orders_router.py`, `payments_router.py`, `admin_router.py`, `suppliers.py`, `models.py`, `db.py`.
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn UI. Pages in `/app/frontend/src/pages/`; admin sub-panel in `/app/frontend/src/pages/admin/`. Auth via httpOnly cookies (access_token for JWT, session_token for Emergent Google).
- **Integrations**: `emergentintegrations` Stripe Checkout; Emergent Google OAuth; bcrypt + pyjwt for local auth; generic HTTP (httpx) adapter for real SMM suppliers.
- **Data collections**: users, user_sessions, roles, suppliers, services, orders, payment_transactions.

## User Personas
1. **Client/Reseller** — logs in, browses catalog, places orders, tracks progress, tops up wallet.
2. **Manager** — views users/orders, adjusts order statuses.
3. **Admin** — full CRUD on users, custom roles, suppliers, services; views revenue.

## Core Requirements (static)
- Role-based access with ability to create custom roles beyond admin/manager/user
- Stripe + PayPal funding with secure transaction recording and idempotent balance credits
- Real-time order tracking with supplier sync (generic standard SMM API adapter)
- Admin CRUD on users/roles/suppliers/services/orders
- API-ready architecture (everything exposed under `/api/*`)

## What's Been Implemented (2026-04-19)
- **Auth**: JWT login/register/logout/me + Emergent Google session exchange. Admin + Demo user seeded.
- **Services**: 16 seeded services across 5 platforms with real rates. Public listing endpoint with platform/category filters.
- **Orders**: Create/list/detail/sync/sync-all. Mock supplier auto-progresses status over time. Balance is deducted atomically with refund-on-supplier-failure.
- **Payments**: Stripe Checkout (fixed-amount whitelist 5/10/25/50/100/250/500/1000) + webhook + polling status (resilient to emergent SDK errors). PayPal placeholder ready for credentials.
- **Wallet**: Balance + transaction history endpoints.
- **Admin**: Stats, users (create/edit/suspend/delete/adjust-balance), roles (CRUD + protected system roles), suppliers (CRUD + protected mock), services (CRUD), orders (list + status override), transactions (list).
- **Frontend**: Landing (brutalist with marquee/bento/pricing/CTA), split-screen Login/Register, dashboard layout with sidebar, Dashboard stats, Services browse, NewOrder form with preset + live summary, Orders list with progress bars, Add Funds (Stripe + PayPal tabs), Payment success polling page, Transactions, Admin overview, Admin Users, Roles, Services, Suppliers, Orders, Transactions.

## Verified
- Testing agent iteration 1: 26/27 backend + 90% frontend; 2 bugs found (Stripe status 500, NewOrder preset)
- Fixes applied; iteration 2: 100% pass, both bugs verified fixed, end-to-end order placement works.

## Prioritized Backlog
### P1
- PayPal live integration (awaiting `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET`)
- Supplier `services` auto-import: button in Admin → Suppliers to call `action=services` and import into service catalog
- Rate limiting / brute-force lockout on `/api/auth/login`

### P2
- Support ticket system (UI + endpoints)
- Email notifications (order status, payment receipts) via Resend/SendGrid
- Drip-feed + Custom-comments advanced service types
- API keys for clients (for programmatic order placement)
- Profit reports (service rate vs supplier_rate)

### P3
- Multi-currency / FX
- Referral / affiliate system
- Supplier auto-markup rules

## Next Tasks
1. Add PayPal credentials when provided → switch placeholder into live flow
2. Add supplier services auto-import action in admin UI
3. Optional: add rate limiter on login endpoint and silence 401 on initial /auth/me
