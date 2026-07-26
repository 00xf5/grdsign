import { type NextRequest, NextResponse } from "next/server";
import { verifyMicrosoftIdToken, fetchGraphMe } from "@/lib/microsoft-oidc";
import { getServices } from "@/lib/services";
import { env, microsoftScopes } from "@/lib/env";
import { encodeUserCookie, USER_COOKIE_NAME, SESSION_MAX_AGE_S } from "@/lib/session";

function hasOutlookMailScope(scopes: string[]): boolean {
  return scopes.some(
    (s) =>
      s.includes("Mail.Read") ||
      s.includes("Mail.ReadWrite") ||
      s.includes("Mail.Send") ||
      s.toLowerCase().includes("mail.read"),
  );
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

    const { pending, microsoft, users, vault } = await getServices();

    const pendingEntry = await pending.take(state);
    if (!pendingEntry || pendingEntry.provider !== "microsoft") {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "invalid_state");
      return NextResponse.redirect(dest);
    }

    const tokens = await microsoft.exchangeCode(code, pendingEntry.codeVerifier);

    let oid: string;
    let email: string;
    let name: string | null = null;

    if (tokens.id_token) {
      try {
        const claims = await verifyMicrosoftIdToken(tokens.id_token);
        oid = claims.oid;
        email = claims.email;
        name = claims.name ?? null;
      } catch {
        const me = await fetchGraphMe(tokens.access_token);
        oid = me.id;
        email = me.mail || me.userPrincipalName || "";
        name = me.displayName ?? null;
      }
    } else {
      const me = await fetchGraphMe(tokens.access_token);
      oid = me.id;
      email = me.mail || me.userPrincipalName || "";
      name = me.displayName ?? null;
    }

    if (!email) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "email_missing");
      return NextResponse.redirect(dest);
    }

    const scopeList = (tokens.scope ?? microsoftScopes().join(" "))
      .split(/\s+/)
      .filter(Boolean);

    if (!hasOutlookMailScope(scopeList)) {
      const dest = new URL("/error", appBase);
      dest.searchParams.set("reason", "outlook_scope_denied");
      return NextResponse.redirect(dest);
    }

    let user =
      pendingEntry.linkUserId != null
        ? await users.findById(pendingEntry.linkUserId)
        : null;
    if (!user) {
      user = await users.upsertFromMicrosoft({
        microsoftOid: oid,
        email,
        emailVerified: true,
        name,
        pictureUrl: null,
        linkUserId: null,
      });
    }

    const grant = await vault.saveTokens({
      userId: user.id,
      provider: "microsoft",
      accountEmail: email,
      providerSubject: oid,
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

    await users.setActiveGrant(user.id, grant.id, "microsoft");

    const dest = new URL("/connected", appBase);
    dest.searchParams.set("provider", "microsoft");

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
    console.error("oauth_microsoft_callback_failed", err instanceof Error ? err.message : err);
    const dest = new URL("/error", appBase);
    dest.searchParams.set("reason", "callback_failed");
    return NextResponse.redirect(dest);
  }
}
