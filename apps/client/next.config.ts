import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// `next dev` from apps/client only loads apps/client/.env*. Pull the monorepo
// root file so AUTH_SECRET / API_URL match `cp .env.example .env`.
loadEnvConfig(resolve(import.meta.dirname, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@shedflow/ui"],
};

export default nextConfig;
