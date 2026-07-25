import type { Client } from "@libsql/client";
import type { GrantRepository, MailProvider, OAuthGrant, SaveGrantInput } from "./repository";

function mergeScopes(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b].map((s) => s.trim()).filter(Boolean))];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToGrant(row: Record<string, unknown>): OAuthGrant {
  let scopes: string[] = [];
  try {
    scopes = JSON.parse(String(row.scopes_json ?? "[]")) as string[];
  } catch {
    scopes = [];
  }
  const provider: MailProvider = row.provider === "microsoft" ? "microsoft" : "google";
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider,
    accountEmail: row.account_email == null ? null : String(row.account_email),
    providerSubject:
      row.provider_subject == null ? null : String(row.provider_subject),
    scopes,
    refreshTokenEnc: row.refresh_token_enc == null ? null : String(row.refresh_token_enc),
    accessTokenEnc: row.access_token_enc == null ? null : String(row.access_token_enc),
    accessExpiresAt: row.access_expires_at == null ? null : String(row.access_expires_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class TursoGrantRepository implements GrantRepository {
  constructor(private db: Client) {}

  async findById(id: string): Promise<OAuthGrant | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM oauth_grants WHERE id = ? LIMIT 1`,
      args: [id],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToGrant(row) : null;
  }

  async findActiveByUserId(
    userId: string,
    provider: MailProvider = "google",
  ): Promise<OAuthGrant | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM oauth_grants
            WHERE user_id = ? AND provider = ? AND revoked_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1`,
      args: [userId, provider],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToGrant(row) : null;
  }

  async findPreferredActive(
    userId: string,
    provider: MailProvider,
    preferredGrantId?: string | null,
  ): Promise<OAuthGrant | null> {
    if (preferredGrantId) {
      const preferred = await this.findById(preferredGrantId);
      if (
        preferred &&
        !preferred.revokedAt &&
        preferred.userId === userId &&
        preferred.provider === provider
      ) {
        return preferred;
      }
    }
    return this.findActiveByUserId(userId, provider);
  }

  async listActiveByUserId(userId: string): Promise<OAuthGrant[]> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM oauth_grants
            WHERE user_id = ? AND revoked_at IS NULL
            ORDER BY provider ASC, account_email ASC`,
      args: [userId],
    });
    return rs.rows.map((r) => rowToGrant(r as Record<string, unknown>));
  }

  async listActiveByUserIdAndProvider(
    userId: string,
    provider: MailProvider,
  ): Promise<OAuthGrant[]> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM oauth_grants
            WHERE user_id = ? AND provider = ? AND revoked_at IS NULL
            ORDER BY account_email ASC`,
      args: [userId, provider],
    });
    return rs.rows.map((r) => rowToGrant(r as Record<string, unknown>));
  }

  async upsertGrant(input: SaveGrantInput): Promise<OAuthGrant> {
    const accountEmail = normalizeEmail(input.accountEmail);
    const now = new Date().toISOString();

    const byEmail = await this.db.execute({
      sql: `SELECT * FROM oauth_grants
            WHERE user_id = ? AND provider = ? AND lower(account_email) = ?
            LIMIT 1`,
      args: [input.userId, input.provider, accountEmail],
    });
    const existingRow = byEmail.rows[0] as Record<string, unknown> | undefined;
    const existing = existingRow ? rowToGrant(existingRow) : null;

    const scopes = mergeScopes(existing?.scopes ?? [], input.scopes);
    const refreshTokenEnc =
      input.refreshTokenEnc ?? existing?.refreshTokenEnc ?? null;
    const providerSubject =
      input.providerSubject ?? existing?.providerSubject ?? null;

    if (existing) {
      await this.db.execute({
        sql: `UPDATE oauth_grants
              SET scopes_json = ?,
                  account_email = ?,
                  provider_subject = ?,
                  refresh_token_enc = ?,
                  access_token_enc = ?,
                  access_expires_at = ?,
                  revoked_at = NULL,
                  updated_at = ?
              WHERE id = ?`,
        args: [
          JSON.stringify(scopes),
          accountEmail,
          providerSubject,
          refreshTokenEnc,
          input.accessTokenEnc,
          input.accessExpiresAt,
          now,
          existing.id,
        ],
      });
      return {
        ...existing,
        scopes,
        accountEmail,
        providerSubject,
        refreshTokenEnc,
        accessTokenEnc: input.accessTokenEnc,
        accessExpiresAt: input.accessExpiresAt,
        revokedAt: null,
        updatedAt: now,
      };
    }

    const grant: OAuthGrant = {
      id: crypto.randomUUID(),
      userId: input.userId,
      provider: input.provider,
      accountEmail,
      providerSubject,
      scopes,
      refreshTokenEnc,
      accessTokenEnc: input.accessTokenEnc,
      accessExpiresAt: input.accessExpiresAt,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute({
      sql: `INSERT INTO oauth_grants
            (id, user_id, provider, account_email, provider_subject, scopes_json,
             refresh_token_enc, access_token_enc, access_expires_at, revoked_at,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      args: [
        grant.id,
        grant.userId,
        grant.provider,
        grant.accountEmail,
        grant.providerSubject,
        JSON.stringify(grant.scopes),
        grant.refreshTokenEnc,
        grant.accessTokenEnc,
        grant.accessExpiresAt,
        grant.createdAt,
        grant.updatedAt,
      ],
    });

    return grant;
  }

  async updateAccessToken(
    grantId: string,
    accessTokenEnc: string,
    accessExpiresAt: string,
    refreshTokenEnc?: string | null,
  ): Promise<OAuthGrant> {
    const existing = await this.findById(grantId);
    if (!existing) throw new Error(`Grant not found: ${grantId}`);

    const now = new Date().toISOString();
    const nextRefresh =
      refreshTokenEnc === undefined ? existing.refreshTokenEnc : refreshTokenEnc;

    await this.db.execute({
      sql: `UPDATE oauth_grants
            SET access_token_enc = ?,
                access_expires_at = ?,
                refresh_token_enc = ?,
                updated_at = ?
            WHERE id = ?`,
      args: [accessTokenEnc, accessExpiresAt, nextRefresh, now, grantId],
    });

    return {
      ...existing,
      accessTokenEnc,
      accessExpiresAt,
      refreshTokenEnc: nextRefresh,
      updatedAt: now,
    };
  }

  async revokeById(grantId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute({
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

  async revokeByUserId(userId: string, provider?: MailProvider): Promise<void> {
    const now = new Date().toISOString();
    if (provider) {
      await this.db.execute({
        sql: `UPDATE oauth_grants
              SET revoked_at = ?,
                  refresh_token_enc = NULL,
                  access_token_enc = NULL,
                  access_expires_at = NULL,
                  updated_at = ?
              WHERE user_id = ? AND provider = ? AND revoked_at IS NULL`,
        args: [now, now, userId, provider],
      });
      return;
    }
    await this.db.execute({
      sql: `UPDATE oauth_grants
            SET revoked_at = ?,
                refresh_token_enc = NULL,
                access_token_enc = NULL,
                access_expires_at = NULL,
                updated_at = ?
            WHERE user_id = ? AND revoked_at IS NULL`,
      args: [now, now, userId],
    });
  }
}
