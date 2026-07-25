import { z } from "zod";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { createHash } from "node:crypto";

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenant?: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive().default(3600),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export type MicrosoftTokenResponse = z.infer<typeof tokenResponseSchema>;

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export type BuildMicrosoftAuthUrlInput = {
  state: string;
  codeVerifier: string;
  scopes?: string[];
  prompt?: "login" | "consent" | "select_account";
};

export class MicrosoftOAuthClient {
  private readonly authority: string;

  constructor(private config: MicrosoftOAuthConfig) {
    const tenant = config.tenant ?? "common";
    this.authority = `https://login.microsoftonline.com/${tenant}`;
  }

  buildAuthorizationUrl(input: BuildMicrosoftAuthUrlInput): string {
    const scopes = input.scopes?.length ? input.scopes : [];
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      response_mode: "query",
      scope: scopes.join(" "),
      state: input.state,
      code_challenge: sha256Base64Url(input.codeVerifier),
      code_challenge_method: "S256",
    });
    if (input.prompt) params.set("prompt", input.prompt);
    return `${this.authority}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
    return this.tokenRequest({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });
  }

  /**
   * Do NOT re-send the full scope list on refresh.
   * Omitting scope reuses whatever was originally consented.
   */
  async refresh(refreshToken: string): Promise<MicrosoftTokenResponse> {
    return this.tokenRequest({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${this.authority}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(body),
        },
        15_000,
      );
    } catch (err) {
      throw new Error(
        `Microsoft token endpoint unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft token failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json: unknown = await res.json();
    const parsed = tokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Microsoft token endpoint returned unexpected payload");
    }
    return parsed.data;
  }
}
