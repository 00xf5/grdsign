import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience only — production uses absolute VITE_API_BASE_URL.
      "/auth": "http://localhost:4000",
      "/api": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
});
