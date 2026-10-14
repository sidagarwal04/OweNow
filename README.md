# OweNow

A modern Splitwise clone — split expenses with friends, without the friction.

Built with **React 18 + Vite + Tailwind + Framer Motion** on the front, **Google OAuth 2.0** for sign-in, and **Netlify Blobs + Netlify Functions** (with a local `.data/` fallback in dev) for zero-config cloud persistence — the same architecture as [Meridian](https://meridian.meetsid.dev/).

---

## Stack

- **Frontend** — React 18, Vite, Tailwind CSS, Framer Motion, React Router, React Query, Lucide icons
- **Storage** — `@netlify/blobs` (`owenow-store` in production on Netlify, `.data/cloud-store.json` local fallback on localhost)
- **Functions** — Netlify Functions (Node, ESM, esbuild) + built-in Vite `/api/*` dev middleware
- **Auth** — Direct Google OAuth 2.0 + HMAC-SHA256 JWT sessions (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_SECRET`)
- **Fonts** — Cabinet Grotesk (headings) + Outfit (body) via Fontshare

---

## Quick start

### 1. Clone & install

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```ini
NEXTAUTH_URL=http://localhost:5173
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional for local development: connect localhost directly to your live Netlify Blobs store.
# (In production on Netlify, Netlify Blobs is configured automatically with zero env vars needed.)
NETLIFY_SITE_ID=
NETLIFY_AUTH_TOKEN=

# Optional: invite emails & currency exchange rate API
RESEND_API_KEY=
RESEND_FROM_EMAIL=OweNow <noreply@yourdomain.com>
EXCHANGE_RATE_API_KEY=
```

1. **Google OAuth (`NEXTAUTH_*` & `GOOGLE_*`)**:
   - `NEXTAUTH_SECRET` — any random secret used to sign JWT sessions (e.g. `openssl rand -base64 32`).
   - In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID of type **Web application** and add:
     - `http://localhost:5173/api/auth/callback/google` (for local development)
     - `https://<your-domain>/api/auth/callback/google` (for production)
     to **Authorized redirect URIs**.
2. **Cross-Device Storage (`@netlify/blobs`)**:
   - **On Netlify (Production)**: Zero configuration is required. Netlify automatically provisions and injects the `owenow-store` Netlify Blobs context at runtime.
   - **On Localhost**: By default, if `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` are left blank, the dev server stores all profiles, groups, expenses, settlements, notifications, and receipts in local `.data/cloud-store.json` and `.data/receipts.json` fallback files. If you want `localhost:5173` to sync directly with your live production Netlify Blobs store, set `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` in `.env`.
3. **Optional integrations**:
   - `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — sends invite emails when inviting someone who hasn't signed in yet (even without Resend, pending invites are saved and auto-joined as soon as that email signs in with Google).
   - `EXCHANGE_RATE_API_KEY` — optional; `/api/convert` falls back to free `exchangerate.host`.

### 2. Develop

```bash
npm run dev
```

Frontend and all `/api/*` function routes boot together at [http://localhost:5173](http://localhost:5173) via the built-in Vite middleware (you can also run `npx netlify dev` on `http://localhost:8888`).

### 3. Deploy

The repo is wired up for one-click Netlify deploys:

1. Push to GitHub and connect the repo to Netlify.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` (plus optional `RESEND_*` / `EXCHANGE_RATE_API_KEY`) in **Netlify → Site settings → Environment variables**.
3. Push to `main` — Netlify auto-builds (`npm run build`) and serves `dist/` + functions from `netlify/functions/`.

---

## Project structure

```
/
├── netlify/
│   └── functions/
│       ├── _shared.js          # Netlify Blobs + .data/ fallback store & JWT auth helpers
│       ├── auth.js             # Google OAuth 2.0 (/api/auth/*) + profile updates
│       ├── groups.js           # GET / POST / DELETE /api/groups
│       ├── expenses.js         # GET / POST / PUT / DELETE /api/expenses
│       ├── settlements.js      # GET / POST /api/settlements
│       ├── notifications.js    # GET / PATCH /api/notifications
│       ├── receipts.js         # GET / POST /api/receipts
│       ├── simplify-debts.js   # POST /api/simplify-debts
│       ├── invite.js           # POST /api/invite
│       └── convert.js          # GET  /api/convert
├── src/
│   ├── components/             # UI building blocks
│   ├── pages/                  # route components
│   ├── hooks/                  # React Query hooks
│   ├── lib/                    # API client (api.js), queryClient, auth context (auth.jsx)
│   └── utils/                  # debt simplifier, currency, formatters
├── netlify.toml                # build + redirects + functions config
├── vite.config.js              # Vite config + local /api/* function middleware
└── package.json
```

---

## How the pieces fit together

### Auth
- `/api/auth/google` initiates Google OAuth 2.0 and redirects back to `/api/auth/callback/google`.
- `upsertUserOnSignIn` creates or updates the user's profile (keyed by a deterministic UUID derived from their email), auto-joins any pending group invites for that email, and issues a signed HMAC-SHA256 JWT stored in both an `HttpOnly` cookie and `localStorage`.
- `AuthProvider` (`src/lib/auth.jsx`) hydrates immediately from local cache and verifies the session via `/api/auth/session`.

### Data & Storage
- All queries and mutations flow through **React Query** (`src/hooks/*`) to `/api/*` endpoints.
- Server handlers in `netlify/functions/*` enforce group membership checks on every read and write.
- Data is persisted in `@netlify/blobs` (`owenow-store`) with a 5-second in-memory cache and a local `.data/cloud-store.json` fallback for offline/local development.
- `BroadcastChannel` (`owenow-sync`) and background polling keep open tabs in sync.

### Debt simplification
- A local greedy algorithm in `src/utils/debtSimplifier.js` runs on every group page for instant feedback.
- A Netlify Function (`/api/simplify-debts`) performs the same calculation server-side after verifying group membership.

### Receipts
- Receipt images are uploaded via `/api/receipts` and stored in Netlify Blobs under `receipts/<userId>/<uuid>.<ext>` (with `.data/receipts.json` fallback locally).
- `useReceiptUrl` resolves receipt data URLs on demand.

### Notifications
- Recording an expense (`/api/expenses`), recording a settlement (`/api/settlements`), or inviting a member (`/api/invite`) automatically creates in-app notifications for the relevant group members.

---

## Tweak the look

Theme tokens live in [`tailwind.config.js`](./tailwind.config.js). The big ones:

- `bg.DEFAULT` — page background (deep navy)
- `accent.DEFAULT` — primary teal-emerald
- `secondary.DEFAULT` — indigo
- `font.display` — Cabinet Grotesk
- `font.sans` — Outfit

Component classes (`.card`, `.btn-primary`, `.input` …) live in [`src/index.css`](./src/index.css).

---

## Roadmap

- [ ] Per-currency expenses with on-the-fly conversion via `/api/convert`
- [ ] Recurring expenses
- [ ] Group archiving
- [ ] Push notifications via web push

---

## License

MIT
