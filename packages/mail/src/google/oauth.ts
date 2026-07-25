import { z } from "zod";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { createHash } from "node:crypto";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive().default(3600),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export type GoogleTokenResponse = z.infer<typeof tokenResponseSchema>;

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export type BuildGoogleAuthUrlInput = {
  state: string;
  codeVerifier: string;
  scopes: string[];
  prompt?: "consent" | "select_account" | "none";
};

export class GoogleOAuthClient {
  constructor(private config: GoogleOAuthConfig) {}

  buildAuthorizationUrl(input: BuildGoogleAuthUrlInput): string {
    if (input.scopes.length === 0) {
      throw new Error("OAuth scopes must not be empty");
    }
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: input.scopes.join(" "),
      state: input.state,
      code_challenge: sha256Base64Url(input.codeVerifier),
      code_challenge_method: "S256",
      access_type: "offline",
      include_granted_scopes: "true",
    });
    if (input.prompt) params.set("prompt", input.prompt);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: codeVerifier,
    });
  }

  async refresh(refreshToken: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
  }

  async revoke(token: string): Promise<void> {
    try {
      const res = await fetchWithTimeout(
        "https://oauth2.googleapis.com/revoke",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        },
        10_000,
      );
      if (!res.ok) {
        console.warn("google_revoke_failed", { status: res.status });
      }
    } catch (err) {
      console.warn("google_revoke_error", err instanceof Error ? err.message : err);
    }
  }

  private async tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(body),
        },
        15_000,
      );
    } catch (err) {
      throw new Error(
        `Token endpoint unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token endpoint failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json: unknown = await res.json();
    const parsed = tokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Token endpoint returned unexpected payload");
    }
    return parsed.data;
  }
}
