import {
  getDb,
  migrate,
  TursoUserRepository,
  TursoGrantRepository,
  TokenVault,
  centralizeGrantsToOwner,
  type UserRepository,
  type GrantRepository,
} from "@benchute/db";
import {
  GoogleOAuthClient,
  MicrosoftOAuthClient,
  TokenRefresherImpl,
  GmailClient,
  OutlookClient,
} from "@benchute/mail";
import { getEnv } from "./env";

export type MailStack = {
  userRepo: UserRepository;
  grantRepo: GrantRepository;
  vault: TokenVault;
  refresher: TokenRefresherImpl;
  gmailClient: GmailClient;
  outlookClient: OutlookClient;
  resolveOwnerUserId: () => Promise<string | null>;
  ensureMigrated: () => Promise<void>;
};

let stack: MailStack | null = null;
let migrated = false;

/** Lazy init — safe during `next build` (no env/DB until first request). */
export function getMailStack(): MailStack {
  if (stack) return stack;

  const env = getEnv();
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

  const refresher = new TokenRefresherImpl(
    grantRepo,
    vault,
    googleOAuth,
    microsoftOAuth,
    userRepo,
  );

  const gmailClient = new GmailClient(refresher);
  const outlookClient = new OutlookClient(refresher);

  async function ensureMigrated(): Promise<void> {
    if (!migrated) {
      await migrate(db);
      migrated = true;
    }
    // TEMP: always fold orphan grants into one owner (every request).
    // FIX LATER — README "Inbox centralization (temporary)".
    await centralizeInboxGrants();
  }

  async function centralizeInboxGrants(): Promise<void> {
    let ownerId = env.INBOX_OWNER_USER_ID?.trim() || null;
    if (!ownerId) {
      const first = await db.execute(
        `SELECT user_id FROM oauth_grants WHERE revoked_at IS NULL
         ORDER BY updated_at DESC LIMIT 1`,
      );
      const row = first.rows[0] as Record<string, unknown> | undefined;
      ownerId = row?.user_id ? String(row.user_id) : null;
    }
    if (!ownerId) return;

    await centralizeGrantsToOwner(db, ownerId);
  }

  async function resolveOwnerUserId(): Promise<string | null> {
    if (env.INBOX_OWNER_USER_ID?.trim()) return env.INBOX_OWNER_USER_ID.trim();

    const result = await db.execute(
      `SELECT user_id FROM oauth_grants WHERE revoked_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const id = row["user_id"];
    return id ? String(id) : null;
  }

  stack = {
    userRepo,
    grantRepo,
    vault,
    refresher,
    gmailClient,
    outlookClient,
    resolveOwnerUserId,
    ensureMigrated,
  };
  return stack;
}
