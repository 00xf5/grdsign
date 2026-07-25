# What I need from you (Google Cloud Console)

Paste these into `backend/.env` — nothing else from Google is required for local login + Gmail readonly.

## Values to copy

| Env var | Where in Console | Example |
|---------|------------------|---------|
| `GOOGLE_CLIENT_ID` | APIs & Services → Credentials → your OAuth 2.0 Client ID | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Same client → Client secret | `GOCSPX-...` |
| `GOOGLE_SCOPES` | OAuth consent screen → **Data Access / Scopes** (copy each scope URI) | space-separated list in `.env` |

**Important:** Enabling a scope in Console only *allows* it. The app requests scopes via `GOOGLE_SCOPES` in `.env`. Google does not auto-inject your consent-screen list into the login URL.

Also generate locally (not from Google):

| Env var | How |
|---------|-----|
| `SESSION_SECRET` | Long random string (≥16 chars) |
| `TOKEN_ENCRYPTION_KEY` | Long random string (≥16 chars) |

Keep these as-is for local:

```
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
APP_BASE_URL=http://localhost:4000
FRONTEND_ORIGIN=http://localhost:5173
```

## Console setup checklist

1. **Create / select a GCP project**
2. **Enable API:** APIs & Services → Library → **Gmail API** → Enable
3. **OAuth consent screen**
   - User type: **External** (unless Workspace-only Internal)
   - App name, support email
   - Scopes to add:
     - `openid`
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `https://www.googleapis.com/auth/gmail.readonly`
   - **Test users:** add your Gmail while status is **Testing**
4. **Create credentials**
   - Credentials → Create → **OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs → add **exactly**:
     - `http://localhost:4000/auth/google/callback`
5. Copy **Client ID** + **Client secret** into `backend/.env`

## You do **not** need to send me

- Service account JSON
- API keys
- Organization / Workspace admin access
- Production verified app (Testing + test user is enough for you)

## After you fill `.env`

```powershell
cd backend
npm run dev
```

If it boots, `/health` should return `{ "ok": true, ... }`.

Then start frontend with `VITE_API_BASE_URL=http://localhost:4000`.
