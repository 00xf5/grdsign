import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@benchute/db", "@benchute/mail"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
