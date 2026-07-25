import * as jose from "jose";
import { env, microsoftAuthority } from "../config/env.js";

export type MicrosoftIdClaims = {
  oid: string;
  sub: string;
  email: string;
  name?: string;
  preferred_username?: string;
};

export async function verifyMicrosoftIdToken(idToken: string): Promise<MicrosoftIdClaims> {
  const issuer = `${microsoftAuthority()}/v2.0`;
  const JWKS = jose.createRemoteJWKSet(
    new URL(`${microsoftAuthority()}/discovery/v2.0/keys`),
  );

  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer,
    audience: env.MICROSOFT_CLIENT_ID,
    clockTolerance: 300,
  });

  const oid = typeof payload.oid === "string" ? payload.oid : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email =
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    null;

  if (!oid || !sub || !email) {
    throw new Error("Microsoft id_token missing oid/sub/email");
  }

  return {
    oid,
    sub,
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    preferred_username:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : undefined,
  };
}

export type GraphMe = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
};

export async function fetchGraphMe(accessToken: string): Promise<GraphMe> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph /me failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GraphMe;
}
