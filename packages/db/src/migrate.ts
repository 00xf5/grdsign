import type { Client } from "@libsql/client";

export async function migrate(db: Client): Promise<void> {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        google_sub TEXT UNIQUE,
        microsoft_oid TEXT UNIQUE,
        email TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        picture_url TEXT,
        active_mail_provider TEXT NOT NULL DEFAULT 'google',
        active_grant_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS oauth_grants (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'google',
        account_email TEXT NOT NULL,
        provider_subject TEXT,
        scopes_json TEXT NOT NULL DEFAULT '[]',
        refresh_token_enc TEXT,
        access_token_enc TEXT,
        access_expires_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, provider, account_email),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS oauth_pending (
        state TEXT PRIMARY KEY NOT NULL,
        code_verifier TEXT NOT NULL,
        return_to TEXT NOT NULL,
        provider TEXT NOT NULL,
        link_user_id TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)`,
      `CREATE INDEX IF NOT EXISTS idx_grants_user_provider ON oauth_grants(user_id, provider)`,
    ],
    "write",
  );

  await ensureUserColumns(db);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_users_microsoft_oid ON users(microsoft_oid)`,
  );
  await rebuildGrantsIfNeeded(db);
  await rebuildGrantsForMultiAccount(db);
}

export async function deleteExpiredPending(db: Client, maxAgeMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  await db.execute({
    sql: `DELETE FROM oauth_pending WHERE created_at < ?`,
    args: [cutoff],
  });
}

async function tableExists(db: Client, name: string): Promise<boolean> {
  const rs = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    args: [name],
  });
  return rs.rows.length > 0;
}

async function columnExists(db: Client, table: string, column: string): Promise<boolean> {
  const rs = await db.execute(`PRAGMA table_info(${table})`);
  return rs.rows.some((r) => String((r as Record<string, unknown>).name) === column);
}

async function ensureUserColumns(db: Client): Promise<void> {
  if (!(await tableExists(db, "users"))) return;

  if (!(await columnExists(db, "users", "active_mail_provider"))) {
    await db.execute(
      `ALTER TABLE users ADD COLUMN active_mail_provider TEXT NOT NULL DEFAULT 'google'`,
    );
  }
  if (!(await columnExists(db, "users", "microsoft_oid"))) {
    await db.execute(`ALTER TABLE users ADD COLUMN microsoft_oid TEXT`);
  }
  if (!(await columnExists(db, "users", "active_grant_id"))) {
    await db.execute(`ALTER TABLE users ADD COLUMN active_grant_id TEXT`);
  }
}

/**
 * Older schema had UNIQUE(user_id) which blocks Gmail+Outlook on one user.
 * Rebuild to UNIQUE(user_id, provider) when needed.
 */
async function rebuildGrantsIfNeeded(db: Client): Promise<void> {
  if (!(await tableExists(db, "oauth_grants"))) return;

  const master = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='oauth_grants'`,
  );
  const sql = String((master.rows[0] as Record<string, unknown> | undefined)?.sql ?? "");
  const hasComposite =
    /UNIQUE\s*\(\s*user_id\s*,\s*provider\s*\)/i.test(sql) ||
    /UNIQUE\s*\(\s*provider\s*,\s*user_id\s*\)/i.test(sql);
  const hasMulti =
    /UNIQUE\s*\(\s*user_id\s*,\s*provider\s*,\s*account_email\s*\)/i.test(sql);
  const hasOldUserUnique = /user_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql);

  if (hasMulti || hasComposite || !hasOldUserUnique) {
    if (!(await columnExists(db, "oauth_grants", "account_email"))) {
      await db.execute(`ALTER TABLE oauth_grants ADD COLUMN account_email TEXT`);
    }
    if (!(await columnExists(db, "oauth_grants", "provider_subject"))) {
      await db.execute(`ALTER TABLE oauth_grants ADD COLUMN provider_subject TEXT`);
    }
    return;
  }

  await db.execute(`
    CREATE TABLE oauth_grants_new (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'google',
      account_email TEXT,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      refresh_token_enc TEXT,
      access_token_enc TEXT,
      access_expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    INSERT INTO oauth_grants_new
      (id, user_id, provider, account_email, scopes_json, refresh_token_enc,
       access_token_enc, access_expires_at, revoked_at, created_at, updated_at)
    SELECT
      id, user_id, COALESCE(provider, 'google'), NULL, scopes_json, refresh_token_enc,
      access_token_enc, access_expires_at, revoked_at, created_at, updated_at
    FROM oauth_grants
  `);

  await db.execute(`DROP TABLE oauth_grants`);
  await db.execute(`ALTER TABLE oauth_grants_new RENAME TO oauth_grants`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_grants_user_provider ON oauth_grants(user_id, provider)`,
  );
}

/**
 * Multi-mailbox: UNIQUE(user_id, provider, account_email) so one Benchute user
 * can keep several Gmail and several Outlook accounts.
 */
async function rebuildGrantsForMultiAccount(db: Client): Promise<void> {
  if (!(await tableExists(db, "oauth_grants"))) return;

  const master = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='oauth_grants'`,
  );
  const sql = String((master.rows[0] as Record<string, unknown> | undefined)?.sql ?? "");
  if (/UNIQUE\s*\(\s*user_id\s*,\s*provider\s*,\s*account_email\s*\)/i.test(sql)) {
    return;
  }

  if (!(await columnExists(db, "oauth_grants", "provider_subject"))) {
    await db.execute(`ALTER TABLE oauth_grants ADD COLUMN provider_subject TEXT`);
  }

  await db.execute(`
    CREATE TABLE oauth_grants_multi (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'google',
      account_email TEXT NOT NULL,
      provider_subject TEXT,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      refresh_token_enc TEXT,
      access_token_enc TEXT,
      access_expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, provider, account_email),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    INSERT INTO oauth_grants_multi
      (id, user_id, provider, account_email, provider_subject, scopes_json,
       refresh_token_enc, access_token_enc, access_expires_at, revoked_at,
       created_at, updated_at)
    SELECT
      id,
      user_id,
      COALESCE(provider, 'google'),
      lower(trim(COALESCE(NULLIF(account_email, ''), 'mailbox-' || id))),
      provider_subject,
      scopes_json,
      refresh_token_enc,
      access_token_enc,
      access_expires_at,
      revoked_at,
      created_at,
      updated_at
    FROM oauth_grants
  `);

  await db.execute(`DROP TABLE oauth_grants`);
  await db.execute(`ALTER TABLE oauth_grants_multi RENAME TO oauth_grants`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_grants_user_provider ON oauth_grants(user_id, provider)`,
  );
}
