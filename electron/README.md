# SocialBoost Pro — Desktop App

Single-mode Electron build: **standalone, full backend embedded.**

No web-wrapper. No live-URL shortcut. The Electron app runs its own Node + Express + **lowdb (JSON)** backend at `127.0.0.1:47219`, stores data at `~/.socialboost-pro/db.json`, and makes **real outbound calls** to Stripe, PayPal, and SMM supplier APIs whenever the machine has internet.

## Features (identical to the web version)
- Full auth (register / login / logout / sessions)
- 16-platform catalog (Instagram, TikTok, Facebook, X, YouTube, LinkedIn, Telegram, Spotify, Discord, Twitch, Pinterest, Snapchat, WhatsApp, Threads, Website, App)
- Dedicated platform pages (Dashboard → click Instagram / TikTok / etc.)
- Orders + sync + refills + cancels + CSV export
- Favorites, bulk upload (see note below)
- Stripe Checkout (live API, uses `STRIPE_API_KEY` env or test key)
- PayPal Orders v2 (live API, uses `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` env)
- Supplier import via `action=services` (real HTTP to your supplier)
- Admin: users, roles, services, suppliers, orders, refills, transactions, tickets, announcements, profit dashboard
- In-app notifications, support tickets, API keys + reseller v2 API, my-accounts tracking

## Seeded credentials
- `admin@socialboost.pro` / `Admin@12345`
- `demo@socialboost.pro` / `Demo@12345` ($50 balance)

## Setup

```bash
cd /app/electron
yarn install
```

### Configure real payment keys (optional — skip for mock-only use)

Stripe and PayPal calls will use environment variables if set. On launch:

```bash
# macOS / Linux
STRIPE_API_KEY=sk_live_xxx \
PAYPAL_CLIENT_ID=AX... PAYPAL_SECRET=EX... PAYPAL_MODE=live \
yarn start

# Windows (PowerShell)
$env:STRIPE_API_KEY="sk_live_xxx"
$env:PAYPAL_CLIENT_ID="AX..."
$env:PAYPAL_SECRET="EX..."
yarn start
```

If no keys are set, Stripe falls back to the test key `sk_test_emergent` and PayPal uses the sandbox credentials already baked into the web version (`PAYPAL_MODE=sandbox` default).

### Build the UI into the desktop app

```bash
yarn build:ui    # builds React and copies to ./web-dist
yarn start       # launches Electron, loads the embedded UI
```

### Package for distribution

```bash
yarn package:mac     # SocialBoostPro-darwin-universal/
yarn package:win     # SocialBoostPro-win32-x64/
yarn package:linux   # SocialBoostPro-linux-x64/
```

The packaged binary is a single folder you can zip and send to anyone — they run the executable and get the exact same app with their own local `~/.socialboost-pro/db.json`.

## Data location

`~/.socialboost-pro/db.json` — one JSON file with users, orders, services, suppliers, tickets, notifications, api_keys, transactions, refills, announcements, user_accounts, favorites. Back it up, copy it to another machine, edit it by hand. It's your data.

## Minor differences vs. hosted version
- **Bulk CSV upload** — returns HTTP 501 in desktop mode (multipart parser not bundled to keep the binary small). Use single-order or the reseller v2 API for batch work.
- **Emergent Google Sign-in** — not supported in desktop (no OAuth callback host). Use email/password.
- **Stripe webhooks** — not applicable in desktop (no public HTTP endpoint). Status polling on `/payment/success` picks up the payment within 2-4 seconds.

Everything else is feature-parity.
