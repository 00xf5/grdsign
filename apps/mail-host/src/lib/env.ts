import { z } from "zod";

const schema = z.object({
  INBOX_USER: z.string().min(1),
  INBOX_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  AUTH_CLIENT_URL: z.string().url(),
  INBOX_OWNER_USER_ID: z.string().optional(),
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_TENANT: z.string().default("common"),
});

export type MailHostEnv = z.infer<typeof schema>;

let cached: MailHostEnv | null = null;

export function getEnv(): MailHostEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment:\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const env: MailHostEnv = new Proxy({} as MailHostEnv, {
  get(_t, prop: string | symbol) {
    return getEnv()[prop as keyof MailHostEnv];
  },
});
