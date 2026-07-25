export type User = {
  id: string;
  googleSub: string | null;
  microsoftOid: string | null;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
  activeMailProvider: "google" | "microsoft";
  activeGrantId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertGoogleInput = {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
};

export type UpsertMicrosoftInput = {
  microsoftOid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
  /** If set, attach Microsoft identity to this existing user (link after Google login). */
  linkUserId?: string | null;
};

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  findByMicrosoftOid(oid: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  upsertFromGoogle(input: UpsertGoogleInput): Promise<User>;
  upsertFromMicrosoft(input: UpsertMicrosoftInput): Promise<User>;
  setActiveMailProvider(
    userId: string,
    provider: "google" | "microsoft",
  ): Promise<User>;
  setActiveGrant(
    userId: string,
    grantId: string,
    provider: "google" | "microsoft",
  ): Promise<User>;
}
