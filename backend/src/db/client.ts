import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = env.TURSO_DATABASE_URL;
  if (url.startsWith("file:")) {
    const filePath = url.replace(/^file:/, "");
    mkdirSync(dirname(filePath), { recursive: true });
  }

  client = createClient({
    url,
    authToken: env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}
