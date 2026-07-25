import { z } from "zod";
import { env, microsoftAuthority, microsoftScopes } from "../config/env.js";
import { sha256Base64Url } from "../lib/crypto.js";
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive().default(3600),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export type MicrosoftTokenResponse = z.infer<typeof tokenResponseSchema>;

export type BuildMicrosoftAuthUrlInput = {
  state: string;
  codeVerifier: string;
  scopes?: string[];
  prompt?: "login" | "consent" | "select_account";
};

export class MicrosoftOAuthClient {
  buildAuthorizationUrl(input: BuildMicrosoftAuthUrlInput): string {
    const scopes = input.scopes?.length ? input.scopes : microsoftScopes();
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.MICROSOFT_REDIRECT_URI,
      response_mode: "query",
      scope: scopes.join(" "),
      state: input.state,
      code_challenge: sha256Base64Url(input.codeVerifier),
      code_challenge_method: "S256",
    });
    if (input.prompt) params.set("prompt", input.prompt);

    return `${microsoftAuthority()}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
    return this.tokenRequest({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.MICROSOFT_REDIRECT_URI,
      code_verifier: codeVerifier,
    });
  }

  /**
   * Do NOT re-send the full MICROSOFT_SCOPES list on refresh.
   * Asking for scopes the refresh token never received causes AADSTS70000 invalid_grant.
   * Omitting `scope` reuses whatever was originally consented.
   */
  async refresh(refreshToken: string): Promise<MicrosoftTokenResponse> {
    return this.tokenRequest({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${microsoftAuthority()}/oauth2/v2.0/token`,
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
