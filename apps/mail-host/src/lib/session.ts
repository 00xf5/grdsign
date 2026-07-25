import { env } from "./env";

export const COOKIE_NAME = "benchute_inbox_session";
export const SESSION_DURATION_S = 24 * 60 * 60; // 24 hours

export type SessionPayload = { ok: true; exp: number };

// Web Crypto helpers — compatible with both Edge Runtime and Node.js
function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToBuf(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(payload: SessionPayload): Promise<string> {
  const key = await importHmacKey(env.SESSION_SECRET);
  const payloadB64 = bufToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bufToBase64Url(sig)}`;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await importHmacKey(env.SESSION_SECRET);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBuf(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBuf(payloadB64))
    ) as SessionPayload;
    if (!payload.ok || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Read session from the incoming request cookies (Server Components / Route Handlers). */
export async function readSession(): Promise<SessionPayload | null> {
  // Dynamic import avoids a top-level next/headers reference in Edge middleware
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
