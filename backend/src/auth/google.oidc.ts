import * as jose from "jose";
import { env } from "../config/env.js";

export type GoogleIdClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  hd?: string;
};

const JWKS = jose.createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdClaims> {
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
    clockTolerance: 300,
  });

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("id_token missing sub/email");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    hd: typeof payload.hd === "string" ? payload.hd : undefined,
  };
}
