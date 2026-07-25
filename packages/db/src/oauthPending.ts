import type { Client } from "@libsql/client";

export type OAuthProviderKind = "google" | "microsoft";

export type PendingOAuth = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  provider: OAuthProviderKind;
  /** Set when linking a second provider to an existing user. */
  linkUserId: string | null;
  /** ISO 8601 timestamp */
  createdAt: string;
};

export type PutPendingInput = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  provider: OAuthProviderKind;
  linkUserId?: string | null;
  /** Defaults to current time if omitted. */
  createdAt?: string;
};

/** Turso-backed OAuth PKCE state store. Replaces the in-memory OAuthStateStore. */
export class OAuthPendingStore {
  constructor(private db: Client) {}

  async put(input: PutPendingInput): Promise<void> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO oauth_pending
            (state, code_verifier, return_to, provider, link_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        input.state,
        input.codeVerifier,
        input.returnTo,
        input.provider,
        input.linkUserId ?? null,
        createdAt,
      ],
    });
  }

  /** Atomically delete and return the pending entry, or null if not found. */
  async take(state: string): Promise<PendingOAuth | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM oauth_pending WHERE state = ? LIMIT 1`,
      args: [state],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    await this.db.execute({
      sql: `DELETE FROM oauth_pending WHERE state = ?`,
      args: [state],
    });

    const provider: OAuthProviderKind =
      row.provider === "microsoft" ? "microsoft" : "google";
    return {
      state: String(row.state),
      codeVerifier: String(row.code_verifier),
      returnTo: String(row.return_to),
      provider,
      linkUserId: row.link_user_id == null ? null : String(row.link_user_id),
      createdAt: String(row.created_at),
    };
  }
}
