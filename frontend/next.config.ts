import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: frontendRoot,
  // turbopack.root anchors Turbopack's project root to frontend/ for local dev.
  // Production builds use --webpack (see package.json) to avoid Vercel's
  // routes-manifest-deterministic.json post-build check, which is Turbopack-only
  // and uses a hardcoded path that conflicts with rootDirectory: frontend.
  turbopack: {
    root: frontendRoot,
  },
  images: {
    unoptimized: true,
  },
};

export default config;
