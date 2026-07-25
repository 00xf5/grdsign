import { Router } from "express";
import { env, googleScopes, microsoftScopes } from "../config/env.js";
import { randomUrlSafe } from "../lib/crypto.js";
import { asyncHandler } from "../lib/http.js";
import { rateLimit } from "../lib/rateLimit.js";
import type { GoogleOAuthClient } from "./google.oauth.client.js";
import type { MicrosoftOAuthClient } from "./microsoft.oauth.client.js";
import { verifyGoogleIdToken } from "./google.oidc.js";
import { fetchGraphMe, verifyMicrosoftIdToken } from "./microsoft.oidc.js";
import type { OAuthStateStore } from "./oauthStateStore.js";
import {
  clearSession,
  readSession,
  requireSession,
  setSession,
  type AuthedRequest,
} from "./session.js";
import type { UserRepository } from "../users/repository.js";
import type { GrantRepository } from "../tokens/grantRepository.js";
import type { TokenVault } from "../tokens/vault.js";

function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  if (!/^\/[A-Za-z0-9/_?\-=&%]*$/.test(raw)) {
    return "/";
  }
  return raw;
}

function hasGmailScope(scopes: string[]): boolean {
  return scopes.some((s) => s.includes("gmail"));
}

function hasOutlookMailScope(scopes: string[]): boolean {
  return scopes.some(
    (s) =>
      s.includes("Mail.Read") ||
      s.includes("Mail.ReadWrite") ||
      s.includes("Mail.Send") ||
      s.toLowerCase().includes("mail.read"),
  );
}

export type AuthDeps = {
  google: GoogleOAuthClient;
  microsoft: MicrosoftOAuthClient;
  stateStore: OAuthStateStore;
  users: UserRepository;
  grants: GrantRepository;
  vault: TokenVault;
};

export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();

  const startLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    keyPrefix: "oauth_start",
  });

  router.get("/google/start", startLimiter, (req, res) => {
    const returnTo = safeReturnTo(req.query.return_to);
    const state = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(64);
    const session = readSession(req);

    deps.stateStore.put({
      state,
      codeVerifier,
      returnTo,
      provider: "google",
      linkUserId: session?.userId ?? null,
      createdAt: Date.now(),
    });

    const url = deps.google.buildAuthorizationUrl({
      state,
      codeVerifier,
      scopes: googleScopes(),
      prompt: "consent",
    });

    res.redirect(url);
  });

  router.get(
    "/google/callback",
    asyncHandler(async (req, res) => {
      const frontend = env.FRONTEND_ORIGIN;
      try {
        if (typeof req.query.error === "string") {
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", req.query.error);
          res.redirect(dest.toString());
          return;
        }

        const code = req.query.code;
        const state = req.query.state;
        if (typeof code !== "string" || typeof state !== "string") {
          res.status(400).send("Missing code/state");
          return;
        }

        const pending = deps.stateStore.take(state);
        if (!pending || pending.provider !== "google") {
          res.status(400).send("Invalid or expired state");
          return;
        }

        const tokens = await deps.google.exchangeCode(code, pending.codeVerifier);
        if (!tokens.id_token) throw new Error("Token response missing id_token");

        const claims = await verifyGoogleIdToken(tokens.id_token);
        if (!claims.email_verified) {
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "email_unverified");
          res.redirect(dest.toString());
          return;
        }

        const scopeList = (tokens.scope ?? googleScopes().join(" "))
          .split(/\s+/)
          .filter(Boolean);

        if (!hasGmailScope(scopeList)) {
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "gmail_scope_denied");
          res.redirect(dest.toString());
          return;
        }

        // Link extra Gmail mailbox to existing Benchute user when already signed in.
        let user =
          pending.linkUserId != null
            ? await deps.users.findById(pending.linkUserId)
            : null;
        if (!user) {
          user = await deps.users.upsertFromGoogle({
            googleSub: claims.sub,
            email: claims.email,
            emailVerified: claims.email_verified,
            name: claims.name ?? null,
            pictureUrl: claims.picture ?? null,
          });
        }

        const grant = await deps.vault.saveTokens({
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
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "missing_refresh_token");
          res.redirect(dest.toString());
          return;
        }

        await deps.users.setActiveGrant(user.id, grant.id, "google");
        setSession(res, { userId: user.id, email: user.email });
        const dest = new URL(pending.returnTo, frontend);
        dest.searchParams.set("auth", "ok");
        dest.searchParams.set("gmail", "connected");
        res.redirect(dest.toString());
      } catch (err) {
        console.error("oauth_google_callback_failed", err instanceof Error ? err.message : err);
        const dest = new URL("/auth/error", frontend);
        dest.searchParams.set("reason", "callback_failed");
        res.redirect(dest.toString());
      }
    }),
  );

  /** Connect / sign in with Microsoft (Outlook). Links to current session user when present. */
  router.get("/microsoft/start", startLimiter, (req, res) => {
    const returnTo = safeReturnTo(req.query.return_to);
    const state = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(64);
    const session = readSession(req);

    deps.stateStore.put({
      state,
      codeVerifier,
      returnTo,
      provider: "microsoft",
      linkUserId: session?.userId ?? null,
      createdAt: Date.now(),
    });

    // Reconnect / link from an existing session: force consent so Mail.* + offline_access
    // are actually re-granted (select_account alone often reuses a stale narrow grant).
    const url = deps.microsoft.buildAuthorizationUrl({
      state,
      codeVerifier,
      scopes: microsoftScopes(),
      prompt: session ? "consent" : "select_account",
    });

    res.redirect(url);
  });

  router.get(
    "/microsoft/callback",
    asyncHandler(async (req, res) => {
      const frontend = env.FRONTEND_ORIGIN;
      try {
        if (typeof req.query.error === "string") {
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", req.query.error);
          res.redirect(dest.toString());
          return;
        }

        const code = req.query.code;
        const state = req.query.state;
        if (typeof code !== "string" || typeof state !== "string") {
          res.status(400).send("Missing code/state");
          return;
        }

        const pending = deps.stateStore.take(state);
        if (!pending || pending.provider !== "microsoft") {
          res.status(400).send("Invalid or expired state");
          return;
        }

        const tokens = await deps.microsoft.exchangeCode(code, pending.codeVerifier);

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
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "email_missing");
          res.redirect(dest.toString());
          return;
        }

        const scopeList = (tokens.scope ?? microsoftScopes().join(" "))
          .split(/\s+/)
          .filter(Boolean);

        if (!hasOutlookMailScope(scopeList)) {
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "outlook_scope_denied");
          res.redirect(dest.toString());
          return;
        }

        // Link extra Outlook mailbox to existing Benchute user when already signed in.
        let user =
          pending.linkUserId != null
            ? await deps.users.findById(pending.linkUserId)
            : null;
        if (!user) {
          user = await deps.users.upsertFromMicrosoft({
            microsoftOid: oid,
            email,
            emailVerified: true,
            name,
            pictureUrl: null,
            linkUserId: null,
          });
        }

        const grant = await deps.vault.saveTokens({
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
          const dest = new URL("/auth/error", frontend);
          dest.searchParams.set("reason", "missing_refresh_token");
          res.redirect(dest.toString());
          return;
        }

        await deps.users.setActiveGrant(user.id, grant.id, "microsoft");
        setSession(res, { userId: user.id, email: user.email });
        const dest = new URL(pending.returnTo, frontend);
        dest.searchParams.set("auth", "ok");
        dest.searchParams.set("outlook", "connected");
        res.redirect(dest.toString());
      } catch (err) {
        console.error("oauth_microsoft_callback_failed", err instanceof Error ? err.message : err);
        const dest = new URL("/auth/error", frontend);
        dest.searchParams.set("reason", "callback_failed");
        res.redirect(dest.toString());
      }
    }),
  );

  router.post("/logout", (_req, res) => {
    // Session cookie only — oauth_grants stay in Turso for next login.
    clearSession(res);
    res.json({ ok: true });
  });

  router.post(
    "/active-provider",
    requireSession,
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const provider = req.body?.provider;
      if (provider !== "google" && provider !== "microsoft") {
        res.status(400).json({ error: "invalid_provider" });
        return;
      }
      const grant = await deps.grants.findPreferredActive(
        session.userId,
        provider,
        null,
      );
      if (!grant) {
        res.status(409).json({
          error: "provider_not_connected",
          message: `Connect ${provider === "google" ? "Gmail" : "Outlook"} first.`,
        });
        return;
      }
      const user = await deps.users.setActiveGrant(
        session.userId,
        grant.id,
        provider,
      );
      res.json({
        ok: true,
        activeMailProvider: user.activeMailProvider,
        activeGrantId: user.activeGrantId,
      });
    }),
  );

  router.post(
    "/active-account",
    requireSession,
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grantId = typeof req.body?.grantId === "string" ? req.body.grantId : "";
      if (!grantId) {
        res.status(400).json({ error: "invalid_grant_id" });
        return;
      }
      const grant = await deps.grants.findById(grantId);
      if (!grant || grant.userId !== session.userId || grant.revokedAt) {
        res.status(404).json({ error: "grant_not_found" });
        return;
      }
      const user = await deps.users.setActiveGrant(
        session.userId,
        grant.id,
        grant.provider,
      );
      res.json({
        ok: true,
        activeMailProvider: user.activeMailProvider,
        activeGrantId: user.activeGrantId,
        accountEmail: grant.accountEmail,
      });
    }),
  );

  router.post(
    "/google/disconnect",
    requireSession,
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grantId =
        typeof req.body?.grantId === "string" ? req.body.grantId : null;
      if (grantId) {
        const grant = await deps.grants.findById(grantId);
        if (grant && grant.userId === session.userId && grant.provider === "google") {
          const refresh = await deps.vault.readRefreshToken(grant);
          const access = await deps.vault.readAccessToken(grant);
          const token = refresh ?? access;
          if (token) await deps.google.revoke(token);
          await deps.grants.revokeById(grant.id);
        }
      } else {
        const grant = await deps.grants.findActiveByUserId(session.userId, "google");
        if (grant) {
          const refresh = await deps.vault.readRefreshToken(grant);
          const access = await deps.vault.readAccessToken(grant);
          const token = refresh ?? access;
          if (token) await deps.google.revoke(token);
          await deps.grants.revokeByUserId(session.userId, "google");
        }
      }
      res.json({ ok: true });
    }),
  );

  router.post(
    "/microsoft/disconnect",
    requireSession,
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grantId =
        typeof req.body?.grantId === "string" ? req.body.grantId : null;
      if (grantId) {
        const grant = await deps.grants.findById(grantId);
        if (
          grant &&
          grant.userId === session.userId &&
          grant.provider === "microsoft"
        ) {
          await deps.grants.revokeById(grant.id);
        }
      } else {
        await deps.grants.revokeByUserId(session.userId, "microsoft");
      }
      res.json({ ok: true });
    }),
  );

  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      const session = readSession(req);
      if (!session) {
        res.status(401).json({ authenticated: false });
        return;
      }
      const user = await deps.users.findById(session.userId);
      if (!user) {
        clearSession(res);
        res.status(401).json({ authenticated: false });
        return;
      }
      const grants = await deps.grants.listActiveByUserId(user.id);
      const gmailAccounts = grants
        .filter((g) => g.provider === "google" && hasGmailScope(g.scopes))
        .map((g) => ({
          grantId: g.id,
          email: g.accountEmail ?? "gmail",
          provider: "google" as const,
        }));
      const outlookAccounts = grants
        .filter((g) => g.provider === "microsoft" && hasOutlookMailScope(g.scopes))
        .map((g) => ({
          grantId: g.id,
          email: g.accountEmail ?? "outlook",
          provider: "microsoft" as const,
        }));

      const gmailConnected = gmailAccounts.length > 0;
      const outlookConnected = outlookAccounts.length > 0;

      let activeGrantId = user.activeGrantId;
      let active = user.activeMailProvider;
      const activeGrant = activeGrantId
        ? grants.find((g) => g.id === activeGrantId)
        : null;
      if (activeGrant) {
        active = activeGrant.provider;
      } else {
        activeGrantId = null;
        if (active === "google" && !gmailConnected && outlookConnected) {
          active = "microsoft";
          activeGrantId = outlookAccounts[0]?.grantId ?? null;
        } else if (active === "microsoft" && !outlookConnected && gmailConnected) {
          active = "google";
          activeGrantId = gmailAccounts[0]?.grantId ?? null;
        } else if (active === "google" && gmailConnected) {
          activeGrantId = gmailAccounts[0]?.grantId ?? null;
        } else if (active === "microsoft" && outlookConnected) {
          activeGrantId = outlookAccounts[0]?.grantId ?? null;
        }
      }

      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          pictureUrl: user.pictureUrl,
        },
        gmailConnected,
        outlookConnected,
        activeMailProvider: active,
        activeGrantId,
        gmailAccounts,
        outlookAccounts,
        connectedProviders: [
          ...(gmailConnected ? (["google"] as const) : []),
          ...(outlookConnected ? (["microsoft"] as const) : []),
        ],
        scopes: grants.flatMap((g) => g.scopes),
      });
    }),
  );

  return router;
}
