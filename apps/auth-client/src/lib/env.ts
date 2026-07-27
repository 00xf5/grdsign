import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  MAIL_HOST_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_SCOPES: z.string().min(1),

  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_REDIRECT_URI: z.string().url(),
  MICROSOFT_TENANT: z.string().min(1).default("common"),
  MICROSOFT_SCOPES: z.string().min(1),

  SESSION_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),

  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().optional().default(""),

  /** When set, every OAuth connect attaches mailboxes to this Turso users.id */
  INBOX_OWNER_USER_ID: z.string().optional().default(""),
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
  return parsed.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string | symbol) {
    return getEnv()[prop as keyof Env];
  },
});

function parseScopeList(raw: string): string[] {
  return [...new Set(raw.split(/\s+/).map((s) => s.trim()).filter(Boolean))];
}

export function googleScopes(): string[] {
  return parseScopeList(getEnv().GOOGLE_SCOPES);
}

export function microsoftScopes(): string[] {
  return parseScopeList(getEnv().MICROSOFT_SCOPES);
}

export function microsoftAuthority(): string {
  return `https://login.microsoftonline.com/${getEnv().MICROSOFT_TENANT}`;
}
