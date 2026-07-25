import {
  getDb,
  migrate,
  TursoUserRepository,
  TursoGrantRepository,
  TokenVault,
} from "@benchute/db";
import {
  GoogleOAuthClient,
  MicrosoftOAuthClient,
  TokenRefresherImpl,
  GmailClient,
  OutlookClient,
} from "@benchute/mail";
import { env } from "./env";

let _initialized = false;

const db = getDb();
const userRepo = new TursoUserRepository(db);
const grantRepo = new TursoGrantRepository(db);
const vault = new TokenVault(grantRepo);

const googleOAuth = new GoogleOAuthClient({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: "",
});

const microsoftOAuth = new MicrosoftOAuthClient({
  clientId: env.MICROSOFT_CLIENT_ID,
  clientSecret: env.MICROSOFT_CLIENT_SECRET,
  redirectUri: "",
  tenant: env.MICROSOFT_TENANT,
});

export const refresher = new TokenRefresherImpl(
  grantRepo,
  vault,
  googleOAuth,
  microsoftOAuth,
  userRepo,
);

export const gmailClient = new GmailClient(refresher);
export const outlookClient = new OutlookClient(refresher);

export async function ensureMigrated(): Promise<void> {
  if (_initialized) return;
  await migrate(db);
  _initialized = true;
}

/**
 * Returns the owner user's ID.
 * Prefers INBOX_OWNER_USER_ID env var; falls back to first user
 * in the database that has at least one active oauth grant.
 */
export async function resolveOwnerUserId(): Promise<string | null> {
  if (env.INBOX_OWNER_USER_ID) return env.INBOX_OWNER_USER_ID;

  const result = await db.execute(
    `SELECT user_id FROM oauth_grants WHERE revoked_at IS NULL LIMIT 1`,
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const id = row["user_id"];
  return id ? String(id) : null;
}

export { userRepo, grantRepo, vault };
