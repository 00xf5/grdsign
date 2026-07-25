import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type SessionPayload = {
  userId: string;
  email: string;
  /** Unix ms expiry — enforced even if cookie maxAge is ignored. */
  exp: number;
};

const COOKIE_NAME = "benchute_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(raw: string): SessionPayload | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(
  res: Response,
  payload: Omit<SessionPayload, "exp">,
): void {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + MAX_AGE_MS,
  };
  res.cookie(COOKIE_NAME, encode(full), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

export function readSession(req: Request): SessionPayload | null {
  const raw = req.cookies?.[COOKIE_NAME];
  if (typeof raw !== "string") return null;
  return decode(raw);
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  (req as Request & { session: SessionPayload }).session = session;
  next();
}

export type AuthedRequest = Request & { session: SessionPayload };
