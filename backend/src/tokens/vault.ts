import { decryptString, encryptString } from "../lib/crypto.js";
import type { GrantRepository, MailProvider, OAuthGrant } from "./grantRepository.js";

export class TokenVault {
  constructor(private grants: GrantRepository) {}

  async saveTokens(input: {
    userId: string;
    provider: MailProvider;
    accountEmail: string;
    providerSubject?: string | null;
    scopes: string[];
    accessToken: string;
    expiresIn: number;
    refreshToken?: string | null;
  }): Promise<OAuthGrant> {
    const expiresIn =
      Number.isFinite(input.expiresIn) && input.expiresIn > 0
        ? input.expiresIn
        : 3600;
    const accessExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return this.grants.upsertGrant({
      userId: input.userId,
      provider: input.provider,
      accountEmail: input.accountEmail,
      providerSubject: input.providerSubject ?? null,
      scopes: input.scopes,
      accessTokenEnc: encryptString(input.accessToken),
      accessExpiresAt,
      refreshTokenEnc: input.refreshToken ? encryptString(input.refreshToken) : null,
    });
  }

  async readAccessToken(grant: OAuthGrant): Promise<string | null> {
    if (!grant.accessTokenEnc) return null;
    return decryptString(grant.accessTokenEnc);
  }

  async readRefreshToken(grant: OAuthGrant): Promise<string | null> {
    if (!grant.refreshTokenEnc) return null;
    return decryptString(grant.refreshTokenEnc);
  }

  /**
   * Updates access token. Pass a new refreshToken only when the IdP rotated it.
   * Omit / undefined keeps the existing encrypted refresh token (do not pass null).
   */
  async updateAccess(
    grantId: string,
    accessToken: string,
    expiresIn: number,
    refreshToken?: string,
  ): Promise<OAuthGrant> {
    const accessExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return this.grants.updateAccessToken(
      grantId,
      encryptString(accessToken),
      accessExpiresAt,
      refreshToken ? encryptString(refreshToken) : undefined,
    );
  }
}
