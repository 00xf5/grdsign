import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const USER_COOKIE_NAME = "benchute_auth_user";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

function sign(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

export function encodeUserCookie(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeUserCookie(raw: string): string | null {
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const userId = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expected = sign(userId);
  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}
