import type { UserRepository, GrantRepository, MailProvider, TokenVault } from "@benchute/db";
import type { GoogleOAuthClient } from "./google/oauth";
import type { MicrosoftOAuthClient } from "./microsoft/oauth";

const SKEW_MS = 60_000;

export interface TokenRefresher {
  getValidAccessToken(
    userId: string,
    provider?: MailProvider,
    forceRefresh?: boolean,
  ): Promise<string>;
}

export class AuthGrantError extends Error {
  constructor(
    message: string,
    public code: "reconnect_required" | "reconsent_required",
  ) {
    super(message);
    this.name = "AuthGrantError";
  }
}

export class TokenRefresherImpl implements TokenRefresher {
  private inflight = new Map<string, Promise<string>>();

  constructor(
    private grants: GrantRepository,
    private vault: TokenVault,
    private google: GoogleOAuthClient,
    private microsoft: MicrosoftOAuthClient,
    private users: UserRepository,
  ) {}

  async getValidAccessToken(
    userId: string,
    provider: MailProvider = "google",
    forceRefresh = false,
  ): Promise<string> {
    const key = `${provider}:${userId}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.resolve(userId, provider, forceRefresh).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private async resolve(
    userId: string,
    provider: MailProvider,
    forceRefresh: boolean,
  ): Promise<string> {
    const user = await this.users.findById(userId);
    const grant = await this.grants.findPreferredActive(
      userId,
      provider,
      user?.activeGrantId,
    );
    if (!grant) {
      throw new AuthGrantError(
        `No ${provider} grant. Reconnect required.`,
        "reconnect_required",
      );
    }

    const expiresAt = grant.accessExpiresAt ? Date.parse(grant.accessExpiresAt) : 0;
    const accessStillValid =
      Number.isFinite(expiresAt) && expiresAt - SKEW_MS > Date.now();

    if (!forceRefresh && accessStillValid) {
      const access = await this.vault.readAccessToken(grant);
      if (access) return access;
    }

    const refreshToken = await this.vault.readRefreshToken(grant);
    if (!refreshToken) {
      if (accessStillValid) {
        const access = await this.vault.readAccessToken(grant);
        if (access) return access;
      }
      throw new AuthGrantError(
        "Missing refresh token. Reconsent required.",
        "reconsent_required",
      );
    }

    try {
      if (provider === "microsoft") {
        const tokens = await this.microsoft.refresh(refreshToken);
        await this.vault.updateAccess(
          grant.id,
          tokens.access_token,
          tokens.expires_in || 3600,
          tokens.refresh_token,
        );
        return tokens.access_token;
      }

      const tokens = await this.google.refresh(refreshToken);
      await this.vault.updateAccess(
        grant.id,
        tokens.access_token,
        tokens.expires_in || 3600,
        tokens.refresh_token,
      );
      return tokens.access_token;
    } catch (err) {
      console.error(
        `${provider}_token_refresh_failed`,
        err instanceof Error ? err.message : err,
      );
      if (!forceRefresh && accessStillValid) {
        const access = await this.vault.readAccessToken(grant);
        if (access) return access;
      }
      throw new AuthGrantError(
        `Token refresh failed. Reconnect ${provider === "microsoft" ? "Outlook" : "Gmail"}.`,
        "reconnect_required",
      );
    }
  }
}
