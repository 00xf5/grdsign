# Frontend ↔ Backend API contract

Frontend depends only on this HTTP surface. No Google SDK in the browser.

## Auth

### `GET /auth/google/start`
Query:
- `intent`: `login` | `connect_gmail`
- `return_to`: path allowlisted on backend (`/`, `/app`, `/settings`, `/inbox`…)

Response: `302` to Google.

### `GET /auth/google/callback`
Consumed by Google + backend only. Frontend must not implement this.

Success: `302` to `{FRONTEND_ORIGIN}{return_to}?auth=ok[&gmail=connected]`
Failure: `302` to `{FRONTEND_ORIGIN}/auth/error?reason=...`

### `GET /auth/me`
Cookie session required for `authenticated: true`.

```json
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "name": "...", "pictureUrl": "..." },
  "gmailConnected": true,
  "outlookConnected": true,
  "activeMailProvider": "google",
  "activeGrantId": "...",
  "gmailAccounts": [{ "grantId": "...", "email": "a@gmail.com", "provider": "google" }],
  "outlookAccounts": [{ "grantId": "...", "email": "b@outlook.com", "provider": "microsoft" }],
  "connectedProviders": ["google", "microsoft"],
  "scopes": ["..."]
}
```

### `POST /auth/active-account`
Body: `{ "grantId": "..." }` — select which linked mailbox is active.

### `POST /auth/logout`
Clears **session cookie only**. Linked mailboxes (`oauth_grants`) remain in Turso.

```json
{ "ok": true }
```

### `POST /auth/google/disconnect`
Auth required. Optional body `{ "grantId" }` to revoke one mailbox; otherwise all Google grants.
Revokes at Google when possible and soft-deletes local grant(s).

## Gmail

### `GET /api/gmail/messages?maxResults=10`
Auth + gmail scope required.

```json
{
  "messages": [
    {
      "id": "...",
      "threadId": "...",
      "snippet": "...",
      "subject": "...",
      "from": "...",
      "date": "..."
    }
  ],
  "nextPageToken": null,
  "resultSizeEstimate": 12
}
```

Error codes:
- `401` `{ "error": "unauthenticated" }`
- `409` `{ "error": "gmail_not_connected" }`
- `401` `{ "error": "reconnect_required" | "reconsent_required" }`

## CORS / cookies

- Backend `CORS` origin = `FRONTEND_ORIGIN`
- `credentials: true` on both sides
- Session cookie: `HttpOnly`, `SameSite=Lax`, host = API origin
