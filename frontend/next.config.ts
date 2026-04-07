import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: frontendRoot,
  turbopack: {
    root: frontendRoot,
  },
  images: {
    unoptimized: true,
  },
};

export default config;
