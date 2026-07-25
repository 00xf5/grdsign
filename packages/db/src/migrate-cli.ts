import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../..");

// Prefer app/backend env files so `npm run db:migrate` works from monorepo root.
loadDotenv({ path: resolve(root, "apps/mail-host/.env.local") });
loadDotenv({ path: resolve(root, "apps/auth-client/.env.local") });
loadDotenv({ path: resolve(root, "backend/.env") });
loadDotenv(); // cwd .env fallback

const { getDb } = await import("./client");
const { migrate } = await import("./migrate");

async function main(): Promise<void> {
  console.log("Running migrations...");
  const db = getDb();
  await migrate(db);
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
