import { z } from "zod";

const envSchema = z.object({
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().optional().default(""),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),
});

export type DbEnv = z.infer<typeof envSchema>;

function loadEnv(): DbEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

let cached: DbEnv | null = null;

/** Lazy — safe during `next build` until a route actually needs DB. */
export function getEnv(): DbEnv {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Back-compat accessor; does not validate until a property is read. */
export const env: DbEnv = new Proxy({} as DbEnv, {
  get(_t, prop: string | symbol) {
    return getEnv()[prop as keyof DbEnv];
  },
});
