# Benchute mail

**Preferred stack (Vercel):** two Next.js apps sharing Turso — see **[docs/VERCEL_DUAL_APPS.md](docs/VERCEL_DUAL_APPS.md)**.

```text
apps/auth-client (:3000)  →  OAuth Google/Microsoft  →  Turso
apps/mail-host   (:3001)  →  /login + /inbox + mail APIs  →  Turso → Gmail/Graph
packages/db, packages/mail
```

```bash
npm install
npm run db:migrate
npm run dev:auth   # http://localhost:3000
npm run dev:mail   # http://localhost:3001  (login: see apps/mail-host/.env.example)
```

Register OAuth redirects for local auth-client:

- `http://localhost:3000/api/auth/google/callback`
- `http://localhost:3000/api/auth/microsoft/callback`

## Inbox centralization (temporary) — FIX LATER

**Current behavior (intentional hack):** mail-host treats the deployment as **single-tenant**. On each mail API request it reassigns every active `oauth_grants` row to one owner user (`INBOX_OWNER_USER_ID`, or the most recently updated grant’s `user_id`). That way a newly connected Gmail/Outlook appears in `/inbox` even if OAuth created a separate Turso user.

**FIX LATER (talk about this):**
- Proper multi-user / multi-tenant inbox (session ↔ user, no cross-user grant moves)
- Auth-client must always `linkUserId` to the signed-in Benchute user (or pinned owner) instead of merging in mail-host
- Remove `centralizeInboxGrants()` from [`apps/mail-host/src/lib/mail.ts`](apps/mail-host/src/lib/mail.ts)

Until then: set `INBOX_OWNER_USER_ID` on mail-host (and optionally auth-client) when you know the canonical user id.

---

## Legacy Vite + Express (deprecated)

The original modular **frontend** + **backend** still runs for reference until cutover. New work should target `apps/*`.

```
frontend (Vite/React :5173) ──credentials──▶ backend (Express :4000) ──▶ Google OAuth / Gmail API
```

## Layout

```
backend/          OAuth, sessions, token vault, Gmail
frontend/         UI + API client only
docs/             Technical blueprint
```

## Boundary rules

| Concern | Owner |
|---------|--------|
| `client_secret`, code exchange, refresh | Backend only |
| Encrypted refresh tokens | Backend `TokenVault` |
| Session cookie | Backend (`HttpOnly`) |
| Start OAuth | Frontend **navigates** to `GET /auth/google/start` |
| Call Gmail | Frontend → `GET /api/gmail/messages` → backend → Google |

## Quick start

### What you need from Google Console
See **[docs/GOOGLE_CONSOLE_SETUP.md](docs/GOOGLE_CONSOLE_SETUP.md)** — basically just **Client ID** + **Client secret**, plus the redirect URI registered as `http://localhost:4000/auth/google/callback`.

### 1. Google Cloud
1. Create OAuth client (Web)
2. Redirect URI: `http://localhost:4000/auth/google/callback`
3. Enable **Gmail API**
4. Add yourself as a **test user** while the consent screen is in Testing

### 2. Backend
```bash
cd backend
cp .env.example .env
# fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, TOKEN_ENCRYPTION_KEY
npm install
npm run dev
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev
```

Open `http://localhost:5173`.

**Use the absolute API URL** (`VITE_API_BASE_URL=http://localhost:4000`) so the session cookie set on the backend host is sent on API calls. Do not rely on the Vite proxy for authenticated requests.

## API surface

| Method | Path | Notes |
|--------|------|------|
| GET | `/health` | Liveness |
| GET | `/auth/google/start?intent=login\|connect_gmail&return_to=/` | 302 → Google |
| GET | `/auth/google/callback` | Google redirect; sets cookie; 302 → frontend |
| GET | `/auth/me` | Session + gmailConnected |
| POST | `/auth/logout` | Clears cookie |
| POST | `/auth/google/disconnect` | Revoke + drop grant |
| GET | `/api/gmail/messages` | Requires session + gmail scopes |

## Swap points (modularity)

- `UserRepository` / `GrantRepository` — replace memory impls with DB
- `OAuthStateStore` — replace with Redis for multi-instance
- `GmailClient` — only backend module that calls Gmail
- `frontend/src/api/client.ts` — sole HTTP boundary for the UI

See `docs/GOOGLE_OAUTH_BLUEPRINT.md` for the full protocol design.

## Dual Next.js apps (Vercel)

Primary path — full guide: **[docs/VERCEL_DUAL_APPS.md](docs/VERCEL_DUAL_APPS.md)**.

```bash
npm install
npm run db:migrate
npm run dev:auth   # :3000
npm run dev:mail   # :3001
```

Legacy `frontend/` + `backend/` are **deprecated** for new features.
