import { NextResponse } from "next/server";
import { randomUrlSafe } from "@benchute/db";
import { getServices } from "@/lib/services";
import { env, microsoftScopes } from "@/lib/env";
import { resolveLinkUserId } from "@/lib/linkUser";

export async function GET() {
  try {
    const linkUserId = await resolveLinkUserId();

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
