import type { User, UpsertGoogleInput, UpsertMicrosoftInput } from "./types";

export type { User, UpsertGoogleInput, UpsertMicrosoftInput };

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
