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
