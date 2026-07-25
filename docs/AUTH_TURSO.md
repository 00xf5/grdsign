# Auth + Turso

## Decisions
- **Sign in with Google = connect account** (one OAuth flow).
- **Turso / libSQL** stores users + encrypted OAuth tokens.

## Tables
- `users` — id, google_sub, email, profile fields
- `oauth_grants` — user_id, scopes_json, refresh_token_enc, access_token_enc, access_expires_at

Tokens are AES-GCM encrypted with `TOKEN_ENCRYPTION_KEY` before insert.

## Env
```env
TURSO_DATABASE_URL=file:./data/benchute.db   # local
TURSO_AUTH_TOKEN=                           # empty for file:

# or remote:
# TURSO_DATABASE_URL=libsql://....turso.io
# TURSO_AUTH_TOKEN=eyJ...
```

## Flow
1. User clicks Sign in with Google  
2. Backend `/auth/google/start` → Google consent (`GOOGLE_SCOPES`)  
3. Callback → upsert user + grant in Turso → session cookie  
4. Gmail API uses vault → decrypt access/refresh from Turso  
