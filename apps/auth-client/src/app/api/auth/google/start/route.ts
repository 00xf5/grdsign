import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUrlSafe } from "@benchute/db";
import { getServices } from "@/lib/services";
import { decodeUserCookie, USER_COOKIE_NAME } from "@/lib/session";
import { env, googleScopes } from "@/lib/env";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userCookieRaw = cookieStore.get(USER_COOKIE_NAME)?.value ?? null;
    const linkUserId = userCookieRaw ? decodeUserCookie(userCookieRaw) : null;

    const state = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(64);

    const { pending, google } = await getServices();

    await pending.put({
      state,
      codeVerifier,
      returnTo: "/",
      provider: "google",
      linkUserId,
    });

    const url = google.buildAuthorizationUrl({
      state,
      codeVerifier,
      scopes: googleScopes(),
      prompt: "consent",
    });

    return NextResponse.redirect(url);
  } catch (err) {
    console.error("google_start_failed", err instanceof Error ? err.message : err);
    const dest = new URL("/error", env.APP_BASE_URL);
    dest.searchParams.set("reason", "start_failed");
    return NextResponse.redirect(dest);
  }
}
