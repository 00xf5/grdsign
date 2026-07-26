import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@benchute/db", "@benchute/mail"],
  experimental: {
    // Ensure workspace packages resolve TypeScript sources
    externalDir: true,
  },
};

export default nextConfig;
