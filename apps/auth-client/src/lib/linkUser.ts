import { cookies } from "next/headers";
import { decodeUserCookie, USER_COOKIE_NAME } from "@/lib/session";
import { env } from "@/lib/env";

/**
 * Prefer pinned inbox owner (single-tenant host) so every Connect Gmail/Outlook
 * attaches to the same Turso user — even without an auth cookie.
 */
export async function resolveLinkUserId(): Promise<string | null> {
  const pinned = env.INBOX_OWNER_USER_ID?.trim();
  if (pinned) return pinned;

  const cookieStore = await cookies();
  const raw = cookieStore.get(USER_COOKIE_NAME)?.value ?? null;
  return raw ? decodeUserCookie(raw) : null;
}
