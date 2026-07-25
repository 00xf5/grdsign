# Multi-account mail architecture

> **Deploy shape:** dual Next.js apps — see [VERCEL_DUAL_APPS.md](./VERCEL_DUAL_APPS.md).  
> Legacy Vite (`frontend/`) + Express (`backend/`) remain until cutover (see their `DEPRECATED.md`).

## Goals

- One **Benchute user** can attach **many Gmail** and **many Outlook** mailboxes.
- Inbox sidebar lists every linked mailbox; switching loads that mailbox’s mail.
- **Log out** on mail-host clears only the inbox session cookie — **Turso keeps all grants**.
- Tokens never leave the server; clients only see emails + grant ids.

## Dual-app identity layers

| Layer | App | Storage | Purpose |
|-------|-----|---------|---------|
| Provider OAuth session | auth-client | `benchute_auth_user` cookie | Link / reconnect mailboxes |
| Inbox gate | mail-host | `benchute_inbox_session` cookie | Local user/pass before `/inbox` |
| User | Turso `users` | profile + `active_grant_id` | Stable Benchute id |
| Mailbox grant | Turso `oauth_grants` | encrypted tokens | Per-mailbox Gmail/Outlook |
| OAuth PKCE state | Turso `oauth_pending` | short-lived | Serverless-safe (not in-memory) |

```text
auth-client (OAuth) ──writes──► Turso ◄──reads── mail-host (/login + /inbox)
```

## Database

### `users`

- `id` — Benchute user id
- `email` — profile email (first sign-in)
- `google_sub` / `microsoft_oid` — optional primary IdP subjects (not one-per-mailbox)
- `active_mail_provider` — `google` | `microsoft`
- `active_grant_id` — which `oauth_grants` row is selected for mail APIs

### `oauth_grants`

| Column | Role |
|--------|------|
| `user_id` | Owner Benchute user |
| `provider` | `google` or `microsoft` |
| `account_email` | Mailbox address (normalized lower-case) |
| `provider_subject` | Google `sub` or Microsoft `oid` for that mailbox |
| token columns | Encrypted access/refresh + expiry |
| `revoked_at` | Soft delete (disconnect) |

**Uniqueness:** `UNIQUE (user_id, provider, account_email)`  
→ many Gmails + many Outlooks per user; reconnecting the same address updates the same row.

## OAuth link flow (auth-client)

1. User opens auth-client → `GET /api/auth/google/start` or `/api/auth/microsoft/start`.
2. If `benchute_auth_user` cookie present → store `linkUserId` in `oauth_pending`.
3. Callback verifies tokens / scopes.
4. If `linkUserId` is set → attach grant to **that** user (do not create a second Benchute user).
5. Else → upsert user from IdP, then save grant.
6. `vault.saveTokens` upserts by `(user_id, provider, account_email)`.
7. `users.active_grant_id` set to the new/updated grant.
8. Auth cookie set; redirect to `/connected?provider=google|microsoft` → link to mail-host `/login`.

## Logout vs disconnect

| Action | Where | Session | Grants in Turso |
|--------|-------|---------|-----------------|
| **Log out** | mail-host `POST /api/logout` | Inbox cookie cleared | **Kept** |
| **Disconnect mailbox** | (optional / future) | Kept | Soft-revoked |

Next provider connect on auth-client can link more mailboxes to the same Turso user via `linkUserId`.

## Mail API resolution (mail-host)

```text
Inbox session (local login)
  → resolveOwnerUserId (INBOX_OWNER_USER_ID or first user with grants)
  → users.active_grant_id (or selected grant)
  → oauth_grants row
  → TokenRefresher → Gmail API or Microsoft Graph
```

Primary endpoints (all behind inbox session middleware):

- `GET /api/mail/me` → `gmailAccounts[]`, `outlookAccounts[]`, `activeGrantId`
- `POST /api/mail/active-account` `{ grantId }` → select mailbox
- `GET /api/mail/messages?provider=&q=` → list
- `GET /api/mail/messages/open?provider=&id=` → detail (Outlook-safe query `id`)
- `POST /api/mail/send` / `POST /api/mail/messages/actions`

## UI (mail-host `/inbox`)

- **Gmail accounts** — list + “+ Add Gmail” → auth-client
- **Outlook accounts** — list + “+ Add Outlook” → auth-client
- Active mailbox highlighted via `activeGrantId`
- **Log out** in nav footer (inbox session only)

## Persistence guarantee

Encrypted refresh tokens live in Turso (`TOKEN_ENCRYPTION_KEY` must match on both apps). Losing either app’s session cookie does not delete grants. Changing `TOKEN_ENCRYPTION_KEY` makes stored tokens unreadable (reconnect required).

## Related docs

- [VERCEL_DUAL_APPS.md](./VERCEL_DUAL_APPS.md) — run + deploy
- [MULTI_PROVIDER_MAIL.md](./MULTI_PROVIDER_MAIL.md) — provider routing overview
- [API_CONTRACT.md](./API_CONTRACT.md) — legacy Express shapes (historical)
