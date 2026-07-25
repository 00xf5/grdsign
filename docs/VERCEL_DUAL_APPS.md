# Dual Next.js apps (Vercel)

Benchute splits into two Vercel-hostable Next.js apps that share **Turso** as the source of truth.

| App | Path | Local | Role |
|-----|------|-------|------|
| **auth-client** | [`apps/auth-client`](../apps/auth-client) | http://localhost:3000 | Connect Google / Microsoft → write `oauth_grants` |
| **mail-host** | [`apps/mail-host`](../apps/mail-host) | http://localhost:3001 | `/login` (env user/pass) + `/inbox` + mail APIs |

Shared packages:

- [`packages/db`](../packages/db) — Turso client, migrate, users, grants, vault, `oauth_pending`
- [`packages/mail`](../packages/mail) — Gmail / Graph clients + token refresher

```text
auth-client.vercel.app          mail-host.vercel.app
  OAuth Google / Microsoft        /login  →  /inbox
           \                         /
            \                       /
             ▼                     ▼
                    Turso (users, oauth_grants)
```

## Local run

```bash
# from repo root
npm install
npm run db:migrate          # applies schema incl. oauth_pending
npm run dev:auth            # :3000
npm run dev:mail            # :3001
```

1. Open auth-client → connect Gmail and/or Outlook  
2. Open mail-host → login with `INBOX_USER` / `INBOX_PASSWORD` (default in `.env.example`: `admin` / `changeme`)  
3. Inbox loads mail for the owner user (auto: first user with grants, or set `INBOX_OWNER_USER_ID`)

## Env checklist

### auth-client (`apps/auth-client/.env.local`)

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TOKEN_ENCRYPTION_KEY` (same as mail-host)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SCOPES`
- `GOOGLE_REDIRECT_URI=https://<auth-client-domain>/api/auth/google/callback`
- `MICROSOFT_*` + `MICROSOFT_REDIRECT_URI=https://<auth-client-domain>/api/auth/microsoft/callback`
- `SESSION_SECRET`, `APP_BASE_URL`, `MAIL_HOST_URL`

### mail-host (`apps/mail-host/.env.local`)

- Same Turso + `TOKEN_ENCRYPTION_KEY`
- `INBOX_USER`, `INBOX_PASSWORD`, `SESSION_SECRET`
- `AUTH_CLIENT_URL`
- Optional `INBOX_OWNER_USER_ID`
- Google/Microsoft client id+secret (token refresh only; redirects stay on auth-client)

## Vercel deploy

1. Create **two** Vercel projects from the same monorepo:
   - Project A: Root Directory = `apps/auth-client`
   - Project B: Root Directory = `apps/mail-host`
2. Set Install Command: `cd ../.. && npm install` (workspace root) or enable monorepo support so workspaces resolve `@benchute/db` / `@benchute/mail`.
3. Add env vars per checklist above (production redirect URIs).
4. In Google Cloud + Azure app registration, add the production redirect URIs.
5. Redeploy both; connect mail on A, login on B.

### Cookie / CORS notes

- Each app sets its own httpOnly cookie on its own domain (`benchute_auth_user` vs `benchute_inbox_session`).
- Mail-host APIs are same-origin to the inbox UI — no CORS needed for inbox fetch.
- Auth-client does not need to call mail-host APIs; linking is via shared Turso.

## Deprecation of Vite + Express

The legacy stack remains for reference until you cut over:

- [`frontend/`](../frontend/) — Vite SPA (deprecated for new work)
- [`backend/`](../backend/) — Express API (deprecated for new work)

Prefer `apps/*` + `packages/*` for all new features. Remove legacy folders once Vercel prod is verified.

## Related docs

- [MULTI_ACCOUNT_ARCHITECTURE.md](./MULTI_ACCOUNT_ARCHITECTURE.md)
- [MULTI_PROVIDER_MAIL.md](./MULTI_PROVIDER_MAIL.md)
- [API_CONTRACT.md](./API_CONTRACT.md) (legacy Express shapes; Next routes under `/api/mail` and `/api/auth`)
