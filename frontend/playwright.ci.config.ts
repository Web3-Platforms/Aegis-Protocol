import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3110",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING=true npm run start -- --hostname 127.0.0.1 --port 3110",
    url: "http://127.0.0.1:3110",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
