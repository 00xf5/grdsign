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

export const env = schema.parse(process.env);
