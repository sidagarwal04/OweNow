# OweNow

A modern Splitwise clone — split expenses with friends, without the friction.

Built with **React 18 + Vite + Tailwind + Framer Motion** on the front, **Google OAuth** for sign-in, and **Netlify Blobs + Netlify Functions** (with local `.data/` fallback in dev) for zero-config cloud persistence — the exact same architecture as [Meridian](https://meridian.meetsid.dev/).

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

Configure `.env`:

```ini
NEXTAUTH_URL=http://localhost:5173
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: connect localhost directly to your live production Netlify Blobs store
NETLIFY_SITE_ID=
NETLIFY_AUTH_TOKEN=
```

1. **Google OAuth (`NEXTAUTH_*` & `GOOGLE_*`)**:
   - `NEXTAUTH_SECRET` can be any random string (e.g. `openssl rand -base64 32`).
   - In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID of type **Web application** and add `http://localhost:5173/api/auth/callback/google` (and your production URL `https://<your-domain>/api/auth/callback/google`) to **Authorized redirect URIs**.
2. **Cross-Device Storage (`@netlify/blobs`)**:
   - **On Netlify (Production)**: Zero configuration is required. Netlify automatically provisions and injects the `owenow-store` Netlify Blobs context at runtime.
   - **On Localhost**: By default, if `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` are left blank, the dev server stores all groups, expenses, settlements, and notifications in a local `.data/cloud-store.json` fallback file. If you want `localhost:5173` to sync directly with your live production Netlify Blobs store, add `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` to `.env`.

### 2. Develop

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (both frontend and `/api/*` endpoints work directly under `npm run dev`, or you can run `npx netlify dev` on port `8888`).

### 3. Deploy

The repo is wired up for one-click Netlify deploys:

1. Push to GitHub and connect the repo to Netlify.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` in **Netlify → Site settings → Environment variables** (Netlify Blobs requires zero env vars in production).
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
│   ├── lib/                    # API client, queryClient, auth context
│   └── utils/                  # debt simplifier, currency, formatters
├── netlify.toml                # build + redirects + functions config
└── package.json
```

---

## License

MIT
