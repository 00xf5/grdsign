export type MailProvider = "google" | "microsoft";

export type OAuthGrant = {
  id: string;
  userId: string;
  provider: MailProvider;
  accountEmail: string | null;
  providerSubject: string | null;
  scopes: string[];
  refreshTokenEnc: string | null;
  accessTokenEnc: string | null;
  accessExpiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveGrantInput = {
  userId: string;
  provider: MailProvider;
  accountEmail: string;
  providerSubject?: string | null;
  scopes: string[];
  refreshTokenEnc: string | null;
  accessTokenEnc: string | null;
  accessExpiresAt: string | null;
};

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
