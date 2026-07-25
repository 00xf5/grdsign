import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@benchute/db", "@benchute/mail"],
};

export default nextConfig;
