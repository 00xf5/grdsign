import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { env } from "./config/env.js";
import { getDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { GoogleOAuthClient } from "./auth/google.oauth.client.js";
import { MicrosoftOAuthClient } from "./auth/microsoft.oauth.client.js";
import { OAuthStateStore } from "./auth/oauthStateStore.js";
import { createAuthRouter } from "./auth/routes.js";
import { TursoUserRepository } from "./users/tursoUserRepository.js";
import { TursoGrantRepository } from "./tokens/tursoGrantRepository.js";
import { TokenVault } from "./tokens/vault.js";
import { TokenRefresher } from "./tokens/refresher.js";
import { GmailClient } from "./gmail/client.js";
import { createGmailRouter } from "./gmail/routes.js";
import { OutlookClient } from "./outlook/client.js";
import { createOutlookRouter } from "./outlook/routes.js";
import { errorHandler, notFoundHandler, securityHeaders } from "./lib/http.js";

function assertRedirectAligned(): void {
  const app = new URL(env.APP_BASE_URL);
  for (const [name, uri] of [
    ["GOOGLE_REDIRECT_URI", env.GOOGLE_REDIRECT_URI],
    ["MICROSOFT_REDIRECT_URI", env.MICROSOFT_REDIRECT_URI],
  ] as const) {
    const redirect = new URL(uri);
    if (app.origin !== redirect.origin) {
      throw new Error(`${name} origin (${redirect.origin}) must match APP_BASE_URL (${app.origin})`);
    }
  }
}

export async function createApp() {
  assertRedirectAligned();

  const db = getDb();
  await migrate(db);

  const users = new TursoUserRepository(db);
  const grants = new TursoGrantRepository(db);
  const vault = new TokenVault(grants);
  const google = new GoogleOAuthClient();
  const microsoft = new MicrosoftOAuthClient();
  const stateStore = new OAuthStateStore();
  const refresher = new TokenRefresher(grants, vault, google, microsoft, users);
  const gmail = new GmailClient(refresher);
  const outlook = new OutlookClient(refresher);

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "benchute-mail-backend",
      persistence: "turso",
      providers: ["google", "microsoft"],
    });
  });

  app.use(
    "/auth",
    createAuthRouter({ google, microsoft, stateStore, users, grants, vault }),
  );
  app.use("/api/gmail", createGmailRouter({ gmail, grants }));
  app.use("/api/outlook", createOutlookRouter({ outlook, grants }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
