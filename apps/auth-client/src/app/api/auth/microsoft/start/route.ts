import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUrlSafe } from "@benchute/db";
import { getServices } from "@/lib/services";
import { decodeUserCookie, USER_COOKIE_NAME } from "@/lib/session";
import { env, microsoftScopes } from "@/lib/env";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userCookieRaw = cookieStore.get(USER_COOKIE_NAME)?.value ?? null;
    const linkUserId = userCookieRaw ? decodeUserCookie(userCookieRaw) : null;

    const state = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(64);

    const { pending, microsoft } = await getServices();

    await pending.put({
      state,
      codeVerifier,
      returnTo: "/",
      provider: "microsoft",
      linkUserId,
    });

    // Force consent when linking a second provider so Mail.* + offline_access are re-granted.
    const url = microsoft.buildAuthorizationUrl({
      state,
      codeVerifier,
      scopes: microsoftScopes(),
      prompt: linkUserId ? "consent" : "select_account",
    });

    return NextResponse.redirect(url);
  } catch (err) {
    console.error("microsoft_start_failed", err instanceof Error ? err.message : err);
    const dest = new URL("/error", env.APP_BASE_URL);
    dest.searchParams.set("reason", "start_failed");
    return NextResponse.redirect(dest);
  }
}
