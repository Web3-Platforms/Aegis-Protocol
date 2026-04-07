import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true npm run build && " +
      "NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true npm run start -- --hostname 127.0.0.1 --port 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
