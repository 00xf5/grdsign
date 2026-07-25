import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_SCOPES: z.string().min(1),

  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_REDIRECT_URI: z.string().url(),
  /** Tenant GUID, or common / organizations / consumers */
  MICROSOFT_TENANT: z.string().min(1).default("common"),
  MICROSOFT_SCOPES: z.string().min(1),

  SESSION_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),

  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }

  const data = parsed.data;
  if (
    data.NODE_ENV === "production" &&
    (data.SESSION_SECRET.includes("change-me") ||
      data.TOKEN_ENCRYPTION_KEY.includes("change-me"))
  ) {
    throw new Error("Refusing to start: default secrets in production");
  }

  if (
    data.NODE_ENV === "production" &&
    data.TURSO_DATABASE_URL.startsWith("libsql://") &&
    !data.TURSO_AUTH_TOKEN
  ) {
    throw new Error("TURSO_AUTH_TOKEN is required for remote Turso in production");
  }

  return data;
}

export const env = loadEnv();

function parseScopeList(raw: string): string[] {
  return [...new Set(raw.split(/\s+/).map((s) => s.trim()).filter(Boolean))];
}

export function googleScopes(): string[] {
  return parseScopeList(env.GOOGLE_SCOPES);
}

export function microsoftScopes(): string[] {
  return parseScopeList(env.MICROSOFT_SCOPES);
}

export function microsoftAuthority(): string {
  return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}`;
}
