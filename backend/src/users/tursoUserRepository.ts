import type { Client } from "@libsql/client";
import type {
  UpsertGoogleInput,
  UpsertMicrosoftInput,
  User,
  UserRepository,
} from "./repository.js";

function rowToUser(row: Record<string, unknown>): User {
  const active =
    row.active_mail_provider === "microsoft" ? "microsoft" : "google";
  return {
    id: String(row.id),
    googleSub: row.google_sub == null ? null : String(row.google_sub),
    microsoftOid: row.microsoft_oid == null ? null : String(row.microsoft_oid),
    email: String(row.email),
    emailVerified: Boolean(row.email_verified),
    name: row.name == null ? null : String(row.name),
    pictureUrl: row.picture_url == null ? null : String(row.picture_url),
    activeMailProvider: active,
    activeGrantId:
      row.active_grant_id == null ? null : String(row.active_grant_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class TursoUserRepository implements UserRepository {
  constructor(private db: Client) {}

  async findById(id: string): Promise<User | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
      args: [id],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToUser(row) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM users WHERE google_sub = ? LIMIT 1`,
      args: [googleSub],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToUser(row) : null;
  }

  async findByMicrosoftOid(oid: string): Promise<User | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM users WHERE microsoft_oid = ? LIMIT 1`,
      args: [oid],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1`,
      args: [email],
    });
    const row = rs.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToUser(row) : null;
  }

  async upsertFromGoogle(input: UpsertGoogleInput): Promise<User> {
    const existing = await this.findByGoogleSub(input.googleSub);
    const now = new Date().toISOString();

    if (existing) {
      await this.db.execute({
        sql: `UPDATE users
              SET email = ?, email_verified = ?, name = ?, picture_url = ?,
                  active_mail_provider = 'google', updated_at = ?
              WHERE id = ?`,
        args: [
          input.email,
          input.emailVerified ? 1 : 0,
          input.name,
          input.pictureUrl,
          now,
          existing.id,
        ],
      });
      return {
        ...existing,
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        pictureUrl: input.pictureUrl,
        activeMailProvider: "google",
        updatedAt: now,
      };
    }

    const byEmail = await this.findByEmail(input.email);
    if (byEmail) {
      await this.db.execute({
        sql: `UPDATE users
              SET google_sub = ?, email = ?, email_verified = ?, name = ?, picture_url = ?,
                  active_mail_provider = 'google', updated_at = ?
              WHERE id = ?`,
        args: [
          input.googleSub,
          input.email,
          input.emailVerified ? 1 : 0,
          input.name,
          input.pictureUrl,
          now,
          byEmail.id,
        ],
      });
      return {
        ...byEmail,
        googleSub: input.googleSub,
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        pictureUrl: input.pictureUrl,
        activeMailProvider: "google",
        updatedAt: now,
      };
    }

    const user: User = {
      id: crypto.randomUUID(),
      googleSub: input.googleSub,
      microsoftOid: null,
      email: input.email,
      emailVerified: input.emailVerified,
      name: input.name,
      pictureUrl: input.pictureUrl,
      activeMailProvider: "google",
      activeGrantId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute({
      sql: `INSERT INTO users
            (id, google_sub, microsoft_oid, email, email_verified, name, picture_url,
             active_mail_provider, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, 'google', ?, ?)`,
      args: [
        user.id,
        user.googleSub,
        user.email,
        user.emailVerified ? 1 : 0,
        user.name,
        user.pictureUrl,
        user.createdAt,
        user.updatedAt,
      ],
    });

    return user;
  }

  async upsertFromMicrosoft(input: UpsertMicrosoftInput): Promise<User> {
    const now = new Date().toISOString();

    if (input.linkUserId) {
      const linked = await this.findById(input.linkUserId);
      if (linked) {
        await this.db.execute({
          sql: `UPDATE users
                SET microsoft_oid = ?, name = COALESCE(?, name),
                    active_mail_provider = 'microsoft', updated_at = ?
                WHERE id = ?`,
          args: [input.microsoftOid, input.name, now, linked.id],
        });
        return {
          ...linked,
          microsoftOid: input.microsoftOid,
          name: input.name ?? linked.name,
          activeMailProvider: "microsoft",
          updatedAt: now,
        };
      }
    }

    const existing = await this.findByMicrosoftOid(input.microsoftOid);
    if (existing) {
      await this.db.execute({
        sql: `UPDATE users
              SET email = ?, email_verified = ?, name = ?,
                  active_mail_provider = 'microsoft', updated_at = ?
              WHERE id = ?`,
        args: [
          input.email,
          input.emailVerified ? 1 : 0,
          input.name,
          now,
          existing.id,
        ],
      });
      return {
        ...existing,
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        activeMailProvider: "microsoft",
        updatedAt: now,
      };
    }

    const byEmail = await this.findByEmail(input.email);
    if (byEmail) {
      await this.db.execute({
        sql: `UPDATE users
              SET microsoft_oid = ?, email = ?, email_verified = ?, name = ?,
                  active_mail_provider = 'microsoft', updated_at = ?
              WHERE id = ?`,
        args: [
          input.microsoftOid,
          input.email,
          input.emailVerified ? 1 : 0,
          input.name,
          now,
          byEmail.id,
        ],
      });
      return {
        ...byEmail,
        microsoftOid: input.microsoftOid,
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        activeMailProvider: "microsoft",
        updatedAt: now,
      };
    }

    const user: User = {
      id: crypto.randomUUID(),
      googleSub: null,
      microsoftOid: input.microsoftOid,
      email: input.email,
      emailVerified: input.emailVerified,
      name: input.name,
      pictureUrl: null,
      activeMailProvider: "microsoft",
      activeGrantId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute({
      sql: `INSERT INTO users
            (id, google_sub, microsoft_oid, email, email_verified, name, picture_url,
             active_mail_provider, created_at, updated_at)
            VALUES (?, NULL, ?, ?, ?, ?, NULL, 'microsoft', ?, ?)`,
      args: [
        user.id,
        user.microsoftOid,
        user.email,
        user.emailVerified ? 1 : 0,
        user.name,
        user.createdAt,
        user.updatedAt,
      ],
    });

    return user;
  }

  async setActiveMailProvider(
    userId: string,
    provider: "google" | "microsoft",
  ): Promise<User> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE users SET active_mail_provider = ?, updated_at = ? WHERE id = ?`,
      args: [provider, now, userId],
    });
    const user = await this.findById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  async setActiveGrant(
    userId: string,
    grantId: string,
    provider: "google" | "microsoft",
  ): Promise<User> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE users
            SET active_grant_id = ?, active_mail_provider = ?, updated_at = ?
            WHERE id = ?`,
      args: [grantId, provider, now, userId],
    });
    const user = await this.findById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }
}
