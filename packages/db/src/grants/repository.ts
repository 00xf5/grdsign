import type { MailProvider, OAuthGrant, SaveGrantInput } from "./types";

export type { MailProvider, OAuthGrant, SaveGrantInput };

export interface GrantRepository {
  findById(id: string): Promise<OAuthGrant | null>;
  findActiveByUserId(
    userId: string,
    provider?: MailProvider,
  ): Promise<OAuthGrant | null>;
  /** Prefer activeGrantId when it matches provider; else first active grant for provider. */
  findPreferredActive(
    userId: string,
    provider: MailProvider,
    preferredGrantId?: string | null,
  ): Promise<OAuthGrant | null>;
  listActiveByUserId(userId: string): Promise<OAuthGrant[]>;
  listActiveByUserIdAndProvider(
    userId: string,
    provider: MailProvider,
  ): Promise<OAuthGrant[]>;
  upsertGrant(input: SaveGrantInput): Promise<OAuthGrant>;
  updateAccessToken(
    grantId: string,
    accessTokenEnc: string,
    accessExpiresAt: string,
    refreshTokenEnc?: string | null,
  ): Promise<OAuthGrant>;
  revokeById(grantId: string): Promise<void>;
  revokeByUserId(userId: string, provider?: MailProvider): Promise<void>;
}
