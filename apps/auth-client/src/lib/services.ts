import { GoogleOAuthClient } from "./google-oauth";
import { MicrosoftOAuthClient } from "./microsoft-oauth";

export async function getServices() {
  const {
    getDb,
    migrate,
    TursoUserRepository,
    TursoGrantRepository,
    TokenVault,
    OAuthPendingStore,
  } = await import("@benchute/db");

  const db = getDb();
  await migrate(db);

  const grants = new TursoGrantRepository(db);

  return {
    users: new TursoUserRepository(db),
    grants,
    vault: new TokenVault(grants),
    pending: new OAuthPendingStore(db),
    google: new GoogleOAuthClient(),
    microsoft: new MicrosoftOAuthClient(),
  };
}
