# Google OAuth 2.0 + Gmail — Technical Dev Blueprint

Stack-agnostic reference for implementing Google OAuth (Authorization Code + PKCE) and Gmail API access. Aligns with the same mental model as Microsoft Entra OAuth / Graph.

---

## 1. Goals & Non-Goals

### Goals
- Authenticate users via Google (OpenID Connect).
- Obtain delegated access to Gmail on behalf of the user.
- Persist tokens securely; refresh without re-consent when possible.
- Call Gmail API with least-privilege scopes.
- Support local, staging, and production redirect URIs.

### Non-Goals (v1)
- Service-account / domain-wide delegation (Workspace admin).
- Full Gmail product UI.
- Multi-provider auth abstraction beyond a clean provider interface.

---

## 2. Protocol Choice

| Flow | Use when |
|------|----------|
| **Authorization Code + PKCE** | Browser / SPA + backend, native apps (preferred) |
| **Authorization Code (confidential)** | Server-rendered web app with `client_secret` |
| **Client Credentials** | Not for user Gmail; machine-to-machine only |
| **Implicit** | Do not use (deprecated) |

**Primary recommendation:** Authorization Code with PKCE, code exchange on a confidential backend.

**OIDC:** Request `openid email profile` when you need identity claims (`sub`, email). Use `id_token` for identity; use `access_token` for Gmail API.

---

## 3. High-Level Architecture

```
┌─────────────┐     1. GET /auth/google/start      ┌──────────────┐
│   Client    │ ──────────────────────────────────▶│   Backend    │
│ (Web/App)   │                                    │  API Server  │
└─────────────┘                                    └──────┬───────┘
       ▲                                                  │
       │ 5. session / JWT                                 │ 2. redirect
       │                                                  ▼
       │                                           ┌──────────────┐
       │                                           │    Google    │
       │                                           │ accounts +   │
       │                                           │ oauth2.googleapis.com
       │                                           └──────┬───────┘
       │                                                  │
       │            3. redirect ?code&state               │
       │◀─────────────────────────────────────────────────┘
       │
       │ 4. GET /auth/google/callback
       ▼
┌─────────────┐     exchange code → tokens         ┌──────────────┐
│   Backend   │ ──────────────────────────────────▶│ Google Token │
│  stores RT  │◀──────────────────────────────────│   Endpoint   │
└──────┬──────┘                                    └──────────────┘
       │
       │ 6. Gmail API (Bearer access_token)
       ▼
┌─────────────┐
│ Gmail API   │
│ gmail.googleapis.com
└─────────────┘
```

### Components
1. **Auth Controller** — start, callback, logout, token refresh orchestration.
2. **OAuth Client** — builds auth URL, exchanges code, refreshes tokens.
3. **Token Store** — encrypted refresh tokens + metadata, keyed by user.
4. **Gmail Client** — thin wrapper; injects Bearer token; handles 401 → refresh → retry once.
5. **Session / Identity layer** — app session after successful OIDC + optional Gmail grant.

---

## 4. Google Cloud Setup (Ops Checklist)

1. Create GCP project.
2. Enable APIs: **Gmail API**, (optional) **People API** if needed.
3. Configure **OAuth consent screen**
   - App name, support email, logo
   - User type: External (unless Workspace-only Internal)
   - Scopes listed explicitly
   - Test users while status = Testing
4. Create **OAuth Client ID**
   - Type: Web application (typical)
   - Authorized redirect URIs (exact match):
     - `http://localhost:3000/auth/google/callback` (dev)
     - `https://staging.example.com/auth/google/callback`
     - `https://app.example.com/auth/google/callback`
5. Record:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET` (server only)
6. Plan for **verification** if using sensitive/restricted scopes in production.

---

## 5. Endpoints & Contracts

### `GET /auth/google/start`
**Purpose:** Begin OAuth; redirect user to Google.

**Query (optional):**
- `return_to` — post-login path (validate against allowlist)
- `intent` — `login` | `connect_gmail`

**Server actions:**
1. Generate `state` (32+ bytes, cryptographically random).
2. Generate `code_verifier` (PKCE); store `code_challenge = BASE64URL(SHA256(verifier))`.
3. Persist `{ state, code_verifier, return_to, intent, created_at }` in short-lived store (cookie or Redis, TTL ≤ 10 min).
4. Redirect 302 to Google authorization URL.

**Auth URL params:**
```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=...
  &redirect_uri=...
  &response_type=code
  &scope=...
  &state=...
  &code_challenge=...
  &code_challenge_method=S256
  &access_type=offline
  &include_granted_scopes=true
  &prompt=consent          # first connect, or when refresh_token missing
```

### `GET /auth/google/callback`
**Query:** `code`, `state` (or `error`, `error_description`)

**Server actions:**
1. Validate `state` against store; reject on mismatch / expiry.
2. Load `code_verifier`; delete one-time state record.
3. `POST https://oauth2.googleapis.com/token`:
   ```
   grant_type=authorization_code
   code=...
   redirect_uri=...        # must match start exactly
   client_id=...
   client_secret=...
   code_verifier=...
   ```
4. Validate `id_token` (signature, `aud`, `iss`, `exp`, optional `hd`).
5. Upsert user by Google `sub`.
6. Encrypt + store `refresh_token` if present; store `access_token` + `expires_at` (memory/Redis ok for AT).
7. Establish app session.
8. Redirect to safe `return_to`.

**Error handling:**
- `access_denied` → user-facing “permission not granted”
- invalid_grant / state miss → restart flow
- never echo raw Google errors with secrets

### `POST /auth/google/disconnect`
- Revoke token at Google (optional but recommended):
  `POST https://oauth2.googleapis.com/revoke?token=REFRESH_OR_ACCESS`
- Delete local refresh token + Gmail grant flag.
- Keep app user account unless full account deletion requested.

### `POST /auth/logout`
- Clear session cookie / invalidate refresh session.
- Do not necessarily revoke Google tokens (product decision).

---

## 6. Scopes Matrix

| Intent | Scopes | Notes |
|--------|--------|-------|
| Login only | `openid email profile` | Identity; no Gmail |
| Read mail | `.../auth/gmail.readonly` | Prefer over full |
| Send | `.../auth/gmail.send` | |
| Labels/modify | `.../auth/gmail.modify` | Broader |
| Full mailbox | `.../auth/gmail` | Avoid unless required; harder verification |

**Policy:** separate “Sign in” from “Connect Gmail”. Escalate scopes only when feature needs them.

Full scope strings:
```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

---

## 7. Token Lifecycle

```
[authorization_code]
        │
        ▼
 access_token (≈ 3600s)  +  refresh_token (long-lived, may be omitted on re-consent)
        │
        ├── use until expires_at - skew (e.g. 60s)
        │
        └── on expiry / 401:
              POST /token
                grant_type=refresh_token
                refresh_token=...
                client_id=...
                client_secret=...
              → new access_token
              → sometimes new refresh_token (rotate if present)
```

### Rules
- Treat missing `refresh_token` as “needs re-consent” → `prompt=consent` + `access_type=offline`.
- Single-flight refresh per user (mutex / lock) to avoid stampede.
- On `invalid_grant`: mark grant revoked; force reconnect.
- Never log tokens. Redact Authorization headers.

### Storage model (suggested)

```
User
  id
  google_sub          UNIQUE
  email
  email_verified
  name
  picture_url
  created_at
  updated_at

OAuthGrant
  id
  user_id
  provider            = 'google'
  scopes              TEXT[] / JSON
  refresh_token_enc   BYTEA / encrypted string
  access_token_enc    optional / cache
  access_expires_at
  token_type
  revoked_at
  created_at
  updated_at
```

Encrypt refresh tokens with app KMS / AES-GCM key from secrets manager (`TOKEN_ENCRYPTION_KEY`).

---

## 8. Gmail API Integration Layer

### Client interface
```
interface GmailPort {
  listMessages(userId, query?, pageToken?): Promise<Page>
  getMessage(userId, messageId, format): Promise<Message>
  sendMessage(userId, rawRfc822): Promise<Sent>
}
```

### Request pattern
1. Resolve user → load grant.
2. Ensure valid access token (refresh if needed).
3. `Authorization: Bearer <access_token>`
4. Base: `https://gmail.googleapis.com/gmail/v1/users/me/...`
5. On 401: refresh once, retry once; then fail with `GmailAuthError`.
6. On 403 / insufficient scopes: return `ReconsentRequired` with missing scopes.
7. Respect quota; exponential backoff on 429 / 5xx.

### Minimal first endpoints
- `users.messages.list`
- `users.messages.get` (`format=metadata|full`)
- `users.messages.send` (if in scope)

---

## 9. Security Requirements

| Control | Requirement |
|---------|-------------|
| PKCE | Required for public clients; recommended for all |
| `state` | Required; one-time; TTL ≤ 10m |
| Redirect URI | Exact allowlist match; no open redirects via `return_to` |
| Secrets | `client_secret` + encryption keys only on server / secret store |
| Cookies | Session: `HttpOnly`, `Secure`, `SameSite=Lax` (or Strict if feasible) |
| Token logs | Forbidden |
| CSRF | State param + SameSite session |
| SSRF | Do not fetch user-supplied URLs during callback |
| Clock skew | Validate JWT `exp`/`iat` with ≤ 5m leeway |

### Threat notes
- Authorization code interception → PKCE mitigates.
- Token theft from DB → encryption at rest + breach rotation runbook.
- Session fixation → rotate session ID on login.

---

## 10. Config Surface

```env
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://app.example.com/auth/google/callback
GOOGLE_SCOPES_LOGIN=openid email profile
GOOGLE_SCOPES_GMAIL=openid email profile https://www.googleapis.com/auth/gmail.readonly

# App
APP_BASE_URL=https://app.example.com
SESSION_SECRET=
TOKEN_ENCRYPTION_KEY=   # 32-byte base64
REDIS_URL=              # optional: state + AT cache
NODE_ENV=production
```

Per-environment redirect URIs must be registered in GCP.

---

## 11. Sequence — Connect Gmail (happy path)

1. Authenticated (or anonymous) user hits **Connect Gmail**.
2. Backend `/auth/google/start?intent=connect_gmail`.
3. User consents to Gmail scopes on Google.
4. Callback exchanges code; persists refresh token + scopes.
5. Backend sets `gmail_connected=true` on user/grant.
6. Feature route calls GmailPort; token refresh transparent.
7. UI shows connected account email from OIDC claims.

---

## 12. Failure Modes & Product Mapping

| Condition | Detection | UX / API |
|-----------|-----------|----------|
| User denies consent | `error=access_denied` | “Gmail not connected” |
| No refresh token | Token response lacks RT | Force reconnect with `prompt=consent` |
| Refresh invalid | `invalid_grant` | “Reconnect Google” CTA |
| Scope too narrow | 403 insufficientPermissions | Incremental auth / reconsent |
| App in Testing | non-test user blocked | Add test user or publish |
| Verification pending | Restricted scope blocked | Limit scopes or complete verification |

---

## 13. Observability

**Metrics**
- `oauth_start_total{intent}`
- `oauth_callback_success_total`
- `oauth_callback_failure_total{reason}`
- `token_refresh_total{result}`
- `gmail_api_requests_total{op,status}`

**Logs (structured, redacted)**
- `event=oauth.callback`, `google_sub`, `scopes`, `has_refresh_token` (bool only)
- Never: code, tokens, Authorization header

**Alerts**
- Spike in `invalid_grant`
- Refresh failure rate > threshold
- Gmail 403/401 ratio anomaly

---

## 14. Testing Strategy

### Unit
- State/PKCE generation and verification
- Redirect URI / `return_to` allowlist
- Token expiry skew logic
- Scope merge / incremental auth decisions

### Integration (recorded HTTP or sandbox)
- Code exchange success / failure fixtures
- Refresh rotation
- Gmail list/get against mock server

### Manual / E2E
- Full browser consent on test user
- Revoke in Google Account → app forces reconnect
- Local + staging redirect URI checks

### Security checks
- Replayed `state` rejected
- Mismatched `redirect_uri` rejected by Google
- Open redirect attempts on `return_to` blocked

---

## 15. Implementation Phases

### Phase 0 — Platform
- GCP project, consent screen, OAuth client, secrets in env
- Enable Gmail API

### Phase 1 — Login
- `/start` + `/callback` with `openid email profile`
- User upsert on `sub`
- Session issuance
- No Gmail yet

### Phase 2 — Token vault
- Encrypted refresh token storage
- Refresh helper + single-flight lock
- Disconnect + optional revoke

### Phase 3 — Gmail read
- GmailPort + `messages.list` / `get`
- Feature endpoint behind `gmail_connected`
- Reconsent path

### Phase 4 — Harden
- Metrics, alerts, rate-limit auth routes
- Staging + prod clients
- Scope minimization review / verification prep

### Phase 5 — Expand (optional)
- Send mail, labels, sync/webhooks (Gmail push via Pub/Sub — separate design)

---

## 16. Microsoft ↔ Google Mapping (for implementers)

| Concept | Microsoft Entra | Google |
|---------|-----------------|--------|
| App registration | Azure App Registration | GCP OAuth Client |
| Authority | `login.microsoftonline.com/{tenant}` | `accounts.google.com` |
| Token URL | `/oauth2/v2.0/token` | `https://oauth2.googleapis.com/token` |
| Identity | `oid` / `sub` | `sub` |
| Mail API | Microsoft Graph | Gmail API |
| Mail scope example | `Mail.Read` | `gmail.readonly` |
| Offline access | `offline_access` scope | `access_type=offline` |
| Tenant complexity | High (common/org/MSA) | Lower (consumer + Workspace) |

---

## 17. Repo Layout (implemented)

```
/docs
  GOOGLE_OAUTH_BLUEPRINT.md
  API_CONTRACT.md
/backend/src
  auth/          # OAuth client, OIDC, session, routes
  tokens/        # vault, grant repo, refresher
  gmail/         # Gmail client + API routes
  users/         # user repository
  config/env.ts
/frontend/src
  api/client.ts  # sole HTTP boundary to backend
  auth/          # session context (calls /auth/me)
  pages/         # UI only — no Google SDK
```

---

## 18. Definition of Done (v1)

- [ ] Login with Google works in local + staging
- [ ] PKCE + state enforced
- [ ] Refresh token stored encrypted
- [ ] Access token refresh transparent to Gmail client
- [ ] Disconnect revokes/deletes grant
- [ ] No secrets in client bundles or logs
- [ ] Test users can grant `gmail.readonly` and list messages
- [ ] Failure paths return actionable reconnect errors
- [ ] Basic metrics on callback + refresh + Gmail calls

---

## 19. Open Decisions (fill before coding)

1. Web app only, or also mobile/desktop clients?
2. Session style: cookie session vs JWT access + refresh?
3. Login-only first, or Gmail connect in same consent?
4. Hosted users: consumer Gmail only, or Google Workspace (`hd` claim)?
5. Target language/runtime for backend?

---

*Document version: 1.0 — technical blueprint for Google OAuth + Gmail delegated access.*
