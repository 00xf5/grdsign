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
