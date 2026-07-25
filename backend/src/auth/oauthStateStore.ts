export type OAuthProviderKind = "google" | "microsoft";

export type PendingOAuth = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  provider: OAuthProviderKind;
  /** When linking Outlook while already signed in with Google */
  linkUserId: string | null;
  createdAt: number;
};

/** Short-lived OAuth state. Swap for Redis in production multi-instance. */
export class OAuthStateStore {
  private store = new Map<string, PendingOAuth>();
  private ttlMs = 10 * 60 * 1000;

  put(entry: PendingOAuth): void {
    this.purge();
    this.store.set(entry.state, entry);
  }

  take(state: string): PendingOAuth | null {
    this.purge();
    const entry = this.store.get(state) ?? null;
    if (entry) this.store.delete(state);
    return entry;
  }

  private purge(): void {
    const now = Date.now();
    for (const [key, value] of this.store) {
      if (now - value.createdAt > this.ttlMs) this.store.delete(key);
    }
  }
}
