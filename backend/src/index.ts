import dns from "node:dns";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

// Prefer IPv4 — avoids intermittent Node fetch failures on some Windows DNS setups.
dns.setDefaultResultOrder("ipv4first");

const app = await createApp();

app.listen(env.PORT, () => {
  console.log(`backend listening on ${env.APP_BASE_URL} (port ${env.PORT})`);
  console.log(`CORS origin: ${env.FRONTEND_ORIGIN}`);
  console.log(`DB: ${env.TURSO_DATABASE_URL.startsWith("file:") ? "local libsql file" : "turso"}`);
});
