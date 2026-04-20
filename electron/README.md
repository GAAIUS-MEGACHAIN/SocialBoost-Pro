# SocialBoost Pro — Desktop (Electron)

Two-mode Electron app wrapping SocialBoost Pro for desktop use.

## Modes

### 1. Online mode (default — recommended)
Wraps the hosted web app at `https://smm-panel-hub-10.preview.emergentagent.com`.
All real features work: Stripe/PayPal payments, supplier sync, admin, etc.

### 2. Standalone mode (offline — demo only)
Runs a local Node.js + Express + **lowdb (JSON file storage)** backend at `127.0.0.1:47219` and serves the React UI from `web-dist/`.

- Data is persisted at `~/.socialboost-pro/db.json`
- **Payments are disabled** (Stripe/PayPal need internet + merchant accounts)
- **Real supplier APIs are disabled** (mock status progression runs via a local timer)
- Default seeded credentials:
  - `admin@local` / `Admin@12345`
  - `demo@local` / `Demo@12345`

## Setup & run

```bash
cd /app/electron

# one-time install
yarn install      # or: npm install

# online mode
yarn start

# standalone mode
yarn start:standalone

# build the React UI into ./web-dist (required for standalone mode)
cd ../frontend && yarn build && cp -r build ../electron/web-dist && cd ../electron
```

## Packaging

```bash
yarn package:mac      # produces SocialBoostPro-darwin-universal/
yarn package:win      # produces SocialBoostPro-win32-x64/
yarn package:linux    # produces SocialBoostPro-linux-x64/
```

The packaged binary can be shared with others. Users on any Mac / Windows / Linux machine can open the `.app` / `.exe` and log in with their account (online mode) or the seeded credentials (standalone mode).

## Why `localhost:3000` can't be shared across computers/WiFi

`localhost` is a reserved loopback address meaning "the same computer". Someone on a different computer or network cannot reach it — that's not a limitation of this app, that's how TCP/IP works. To share your app with others, use either:

1. The Emergent preview URL (already public),
2. A deployment (Emergent Deploy / Vercel / Railway),
3. Or this Electron app — packaged and sent as a file to the other person (they run it on their own computer, storing data locally in standalone mode, or connecting to your online panel).
