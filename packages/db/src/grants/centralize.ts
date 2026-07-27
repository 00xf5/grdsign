import type { Client } from "@libsql/client";

type GrantRow = {
  id: string;
  userId: string;
  provider: string;
  accountEmail: string | null;
  scopesJson: string;
  refreshTokenEnc: string | null;
  accessTokenEnc: string | null;
  accessExpiresAt: string | null;
  providerSubject: string | null;
  updatedAt: string;
};

function grantKey(provider: string, accountEmail: unknown): string {
  const email =
    accountEmail == null ? "" : String(accountEmail).trim().toLowerCase();
  return `${provider}\0${email}`;
}

function rowToGrant(row: Record<string, unknown>): GrantRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: String(row.provider),
    accountEmail: row.account_email == null ? null : String(row.account_email),
    scopesJson: String(row.scopes_json ?? "[]"),
    refreshTokenEnc:
      row.refresh_token_enc == null ? null : String(row.refresh_token_enc),
    accessTokenEnc:
      row.access_token_enc == null ? null : String(row.access_token_enc),
    accessExpiresAt:
      row.access_expires_at == null ? null : String(row.access_expires_at),
    providerSubject:
      row.provider_subject == null ? null : String(row.provider_subject),
    updatedAt: String(row.updated_at),
  };
}

async function fetchGrant(db: Client, id: string): Promise<GrantRow | null> {
  const rs = await db.execute({
    sql: `SELECT * FROM oauth_grants WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = rs.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToGrant(row) : null;
}

async function revokeGrant(db: Client, grantId: string, now: string): Promise<void> {
  await db.execute({
    sql: `UPDATE oauth_grants
          SET revoked_at = ?,
              refresh_token_enc = NULL,
              access_token_enc = NULL,
              access_expires_at = NULL,
              updated_at = ?
          WHERE id = ? AND revoked_at IS NULL`,
    args: [now, now, grantId],
  });
}

async function copyGrantTokens(
  db: Client,
  from: GrantRow,
  toId: string,
  now: string,
): Promise<void> {
  await db.execute({
    sql: `UPDATE oauth_grants
          SET scopes_json = ?,
              provider_subject = ?,
              refresh_token_enc = ?,
              access_token_enc = ?,
              access_expires_at = ?,
              revoked_at = NULL,
              updated_at = ?
          WHERE id = ?`,
    args: [
      from.scopesJson,
      from.providerSubject,
      from.refreshTokenEnc,
      from.accessTokenEnc,
      from.accessExpiresAt,
      now,
      toId,
    ],
  });
}

/**
 * Move active grants onto one owner user without violating
 * UNIQUE(user_id, provider, account_email).
 * Duplicates keep the newest tokens; older rows are revoked.
 */
export async function centralizeGrantsToOwner(
  db: Client,
  ownerId: string,
): Promise<{ moved: number; revoked: number }> {
  const now = new Date().toISOString();
  const keeperByKey = new Map<string, string>();
  let moved = 0;
  let revoked = 0;

  const ownerRows = await db.execute({
    sql: `SELECT id, provider, account_email FROM oauth_grants
          WHERE revoked_at IS NULL AND user_id = ?`,
    args: [ownerId],
  });
  for (const row of ownerRows.rows) {
    const r = row as Record<string, unknown>;
    keeperByKey.set(grantKey(String(r.provider), r.account_email), String(r.id));
  }

  const orphans = await db.execute({
    sql: `SELECT id FROM oauth_grants
          WHERE revoked_at IS NULL AND user_id != ?
          ORDER BY updated_at DESC`,
    args: [ownerId],
  });

  for (const row of orphans.rows) {
    const orphan = await fetchGrant(db, String((row as Record<string, unknown>).id));
    if (!orphan) continue;

    const key = grantKey(orphan.provider, orphan.accountEmail);
    const keeperId = keeperByKey.get(key);

    if (!keeperId) {
      await db.execute({
        sql: `UPDATE oauth_grants SET user_id = ?, updated_at = ? WHERE id = ?`,
        args: [ownerId, now, orphan.id],
      });
      keeperByKey.set(key, orphan.id);
      moved += 1;
      continue;
    }

    const keeper = await fetchGrant(db, keeperId);
    if (!keeper) {
      await db.execute({
        sql: `UPDATE oauth_grants SET user_id = ?, updated_at = ? WHERE id = ?`,
        args: [ownerId, now, orphan.id],
      });
      keeperByKey.set(key, orphan.id);
      moved += 1;
      continue;
    }

    const orphanNewer = orphan.updatedAt >= keeper.updatedAt;
    if (orphanNewer) {
      await copyGrantTokens(db, orphan, keeper.id, now);
      await revokeGrant(db, orphan.id, now);
    } else {
      await revokeGrant(db, orphan.id, now);
    }
    revoked += 1;
  }

  return { moved, revoked };
}
