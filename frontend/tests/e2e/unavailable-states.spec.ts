import { expect, test } from "@playwright/test";

const ACTIVITY_ERROR = {
  error: "Activity data unavailable",
  detail: "Activity activity API failed in test",
};

const HISTORY_ERROR = {
  error: "History data unavailable",
  detail: "Recent wallet history API failed in test",
};

const EMPTY_PORTFOLIO = {
  snapshot: {
    chainId: 420420417,
    blockNumber: "123",
    observedAt: "2026-04-06T00:00:00.000Z",
  },
  userAddress: null,
  assets: [],
  summary: {
    supportedAssetCount: 0,
    userNonZeroAssetCount: 0,
    vaultNonZeroAssetCount: 0,
  },
  coverage: {
    source: "live_contract_snapshot",
    supportedAssetsOnly: true,
    limitations: [
      "No pricing, TVL, APY, realized yield, or PnL.",
      "Only configured supported assets are included.",
    ],
  },
};

test("activity page shows unavailable states instead of zero-like activity data", async ({ page }) => {
  await page.route("**/api/activity**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(ACTIVITY_ERROR),
    });
  });

  await page.goto("/activity");

  await expect(page.getByText("Activity data unavailable")).toBeVisible();
  await expect(
    page.getByText("Indexed window unavailable while the activity API is failing.")
  ).toBeVisible();
  await expect(
    page.getByText("Route event breakdown is unavailable until the activity API recovers.")
  ).toBeVisible();
  await expect(
    page.getByText("Recent ledger is unavailable until the activity API recovers.")
  ).toBeVisible();
  await expect(
    page.getByText("No on-chain activity found in the current indexed window.")
  ).toHaveCount(0);
  await expect(page.getByText("Current indexed window: blocks 0 to 0.")).toHaveCount(0);
});

test("vault page shows unavailable states instead of empty-success history or route stats", async ({ page }) => {
  await page.route("**/api/portfolio**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_PORTFOLIO),
    });
  });

  await page.route("**/api/activity**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(ACTIVITY_ERROR),
    });
  });

  await page.route("**/api/history**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(HISTORY_ERROR),
    });
  });

  await page.goto("/vault?e2eMockWallet=1");

  const connectButton = page.getByRole("button", { name: "Connect Wallet" });
  if (await connectButton.count()) {
    await connectButton.click();
  }

  await expect(page.getByText("Route event stats unavailable")).toBeVisible();
  await expect(page.getByText("Activity API unavailable")).toBeVisible();
  await expect(page.getByText("Recent wallet history unavailable")).toBeVisible();
  await expect(
    page.getByText("Recent wallet history is unavailable until the history API recovers.")
  ).toBeVisible();
  await expect(
    page.getByText("No recent wallet history found in the current indexed window.")
  ).toHaveCount(0);
  await expect(page.getByText("0 units")).toHaveCount(0);
});
