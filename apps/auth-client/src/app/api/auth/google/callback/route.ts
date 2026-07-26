import { type NextRequest, NextResponse } from "next/server";
import { verifyGoogleIdToken } from "@/lib/google-oidc";
import { getServices } from "@/lib/services";
import { env, googleScopes } from "@/lib/env";
import { encodeUserCookie, USER_COOKIE_NAME, SESSION_MAX_AGE_S } from "@/lib/session";

function hasGmailScope(scopes: string[]): boolean {
  return scopes.some((s) => s.includes("gmail"));
}

export async function GET(req: NextRequest) {
  const appBase = env.APP_BASE_URL;

  try {
    const { searchParams } = req.nextUrl;

    const error = searchParams.get("error");
    if (error) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", error);
      return NextResponse.redirect(dest);
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "missing_code_state");
      return NextResponse.redirect(dest);
    }

    const { pending, google, users, vault } = await getServices();

    const pendingEntry = await pending.take(state);
    if (!pendingEntry || pendingEntry.provider !== "google") {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "invalid_state");
      return NextResponse.redirect(dest);
    }

    const tokens = await google.exchangeCode(code, pendingEntry.codeVerifier);
    if (!tokens.id_token) throw new Error("Token response missing id_token");

    const claims = await verifyGoogleIdToken(tokens.id_token);
    if (!claims.email_verified) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "email_unverified");
      return NextResponse.redirect(dest);
    }

    const scopeList = (tokens.scope ?? googleScopes().join(" "))
      .split(/\s+/)
      .filter(Boolean);

    if (!hasGmailScope(scopeList)) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "gmail_scope_denied");
      return NextResponse.redirect(dest);
    }

    let user =
      pendingEntry.linkUserId != null
        ? await users.findById(pendingEntry.linkUserId)
        : null;
    if (!user) {
      user = await users.upsertFromGoogle({
        googleSub: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified,
        name: claims.name ?? null,
        pictureUrl: claims.picture ?? null,
      });
    }

    const grant = await vault.saveTokens({
      userId: user.id,
      provider: "google",
      accountEmail: claims.email,
      providerSubject: claims.sub,
      scopes: scopeList,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      refreshToken: tokens.refresh_token ?? null,
    });

    if (!tokens.refresh_token && !grant.refreshTokenEnc) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "missing_refresh_token");
      return NextResponse.redirect(dest);
    }

    await users.setActiveGrant(user.id, grant.id, "google");

    const dest = new URL("/connected", appBase);
    dest.searchParams.set("provider", "google");

    const res = NextResponse.redirect(dest);
    res.cookies.set(USER_COOKIE_NAME, encodeUserCookie(user.id), {
      httpOnly: true,
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });
    return res;
  } catch (err) {
    console.error("oauth_google_callback_failed", err instanceof Error ? err.message : err);
    const dest = new URL("/error", appBase);
    dest.searchParams.set("reason", "callback_failed");
    return NextResponse.redirect(dest);
  }
}
