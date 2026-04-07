import { expect, test } from "@playwright/test";
import { AEGIS_RUNTIME_ENV } from "../../lib/runtime/environment";

const MOCK_WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

const ZERO_DEPOSIT_PORTFOLIO = {
  snapshot: {
    chainId: 420420417,
    blockNumber: "123",
    observedAt: "2026-04-06T00:00:00.000Z",
  },
  userAddress: MOCK_WALLET_ADDRESS,
  assets: [
    {
      tokenAddress: "0x0000000000000000000000000000000000000011",
      symbol: "USDC",
      decimals: 6,
      userPosition: {
        raw: "0",
        display: "0.000000",
        shareBps: 0,
      },
      vaultPosition: {
        raw: "25000000",
        display: "25.000000",
      },
    },
  ],
  summary: {
    supportedAssetCount: 1,
    userNonZeroAssetCount: 0,
    vaultNonZeroAssetCount: 1,
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

const POSITIVE_DEPOSIT_PORTFOLIO = {
  ...ZERO_DEPOSIT_PORTFOLIO,
  assets: [
    {
      tokenAddress: "0x0000000000000000000000000000000000000011",
      symbol: "USDC",
      decimals: 6,
      userPosition: {
        raw: "10000000",
        display: "10.000000",
        shareBps: 4000,
      },
      vaultPosition: {
        raw: "25000000",
        display: "25.000000",
      },
    },
  ],
  summary: {
    supportedAssetCount: 1,
    userNonZeroAssetCount: 1,
    vaultNonZeroAssetCount: 1,
  },
};

const EMPTY_ACTIVITY = {
  transactions: [],
  routeGroups: [],
  stats: {
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalRouteEventAmount: 0,
    transactionCount: 0,
    routeGroupCount: 0,
    averageRiskScore: 0,
  },
  indexedThroughBlock: "123",
  fromBlock: "100",
};

const EMPTY_HISTORY = {
  userAddress: MOCK_WALLET_ADDRESS,
  items: [],
  summary: {
    returnedItemCount: 0,
    limit: 25,
  },
  coverage: {
    onChainWindow: {
      fromBlock: "100",
      indexedThroughBlock: "123",
      windowLimited: true,
    },
    relayRequests: {
      source: "server_store",
      available: false,
      backend: null,
      limitations: [
        "Private relay-request history is not exposed through this wallet-history API.",
        "Use direct route responses and request-status lookups for operator follow-up instead.",
      ],
    },
    limitations: [
      "This is recent wallet history, not a full archival ledger.",
      "Wallet history does not include per-user XcmRouted outcomes because those logs are not wallet-attributed.",
      "Wallet history intentionally excludes private relay-request records.",
    ],
  },
};

const PORTFOLIO_ERROR = {
  error: "Portfolio snapshot unavailable",
  detail: "Portfolio API failed in test",
};

test("chat blocks experimental route submission when no deposited route balance exists", async ({
  page,
}) => {
  await page.route("**/api/risk-oracle", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parachainId: 2000,
        riskScore: 42,
        safeToRoute: true,
      }),
    });
  });

  await page.route("**/api/portfolio**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ZERO_DEPOSIT_PORTFOLIO),
    });
  });

  await page.goto("/chat?e2eMockWallet=1");

  await page.getByTestId("chat-intent-input").fill("Earn yield on Acala");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByText("Deposit required before routing")).toBeVisible();
  await expect(page.getByTestId("confirm-transaction")).toBeDisabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Deposit USDC Before Routing"
  );
});

test("chat pauses route submission when the portfolio API is unavailable", async ({
  page,
}) => {
  await page.route("**/api/risk-oracle", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parachainId: 2000,
        riskScore: 42,
        safeToRoute: true,
      }),
    });
  });

  await page.route("**/api/portfolio**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(PORTFOLIO_ERROR),
    });
  });

  await page.goto("/chat?e2eMockWallet=1");

  await page.getByTestId("chat-intent-input").fill("Earn yield on Acala");
  await page.getByTestId("chat-send-button").click();

  await expect(
    page.getByText("Route eligibility unavailable", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("confirm-transaction")).toBeDisabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Route Eligibility Unavailable"
  );
});

test("chat requires dismissing the most recent failed route request before retrying", async ({
  page,
}) => {
  await page.addInitScript(
    (data: {
      address: string;
      runtimeEnv: string;
      request: Record<string, unknown>;
    }) => {
      const { address, runtimeEnv, request } = data;

      window.localStorage.setItem(
        `aegis:recent-route-requests:${runtimeEnv}:${address}`,
        JSON.stringify([request])
      );
    },
    {
      address: MOCK_WALLET_ADDRESS,
      runtimeEnv: AEGIS_RUNTIME_ENV,
      request: {
        requestId: "req_latest_failed_guard",
        status: "failed",
        txHash: "0x1234",
        tokenSymbol: "USDC",
        amountRequested: "10",
        amountSubmitted: null,
        failureCategory: "operator_review_required",
        retryDisposition: "review_before_retry",
        warnings: [],
        error: "Operator review required before retry.",
        note: null,
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        source: "chat",
        runtimeEnv: AEGIS_RUNTIME_ENV,
      },
    }
  );

  await page.route("**/api/risk-oracle", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parachainId: 2000,
        riskScore: 42,
        safeToRoute: true,
      }),
    });
  });

  await page.route("**/api/portfolio**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(POSITIVE_DEPOSIT_PORTFOLIO),
    });
  });

  await page.goto("/chat?e2eMockWallet=1");

  await page.getByTestId("chat-intent-input").fill("Earn yield on Acala");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByText("Latest route request failed")).toBeVisible();
  await expect(page.getByTestId("confirm-transaction")).toBeDisabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Review Failed Request"
  );

  await page.getByRole("button", { name: "Dismiss failed request" }).click();

  await expect(page.getByText("Latest route request failed")).toHaveCount(0);
  await expect(page.getByTestId("confirm-transaction")).toBeEnabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Submit Experimental Route"
  );
});

test("chat blocks routing again when a background portfolio refresh fails after an initial success", async ({
  page,
}) => {
  let portfolioRequestCount = 0;

  await page.route("**/api/risk-oracle", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parachainId: 2000,
        riskScore: 42,
        safeToRoute: true,
      }),
    });
  });

  await page.route("**/api/portfolio**", async (route) => {
    portfolioRequestCount += 1;

    if (portfolioRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(POSITIVE_DEPOSIT_PORTFOLIO),
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(PORTFOLIO_ERROR),
    });
  });

  await page.goto("/chat?e2eMockWallet=1");

  await page.getByTestId("chat-intent-input").fill("Earn yield on Acala");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByTestId("confirm-transaction")).toBeEnabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Submit Experimental Route"
  );

  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });

  await expect(
    page.getByText("Route eligibility unavailable", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("confirm-transaction")).toBeDisabled();
  await expect(page.getByTestId("confirm-transaction")).toContainText(
    "Route Eligibility Unavailable"
  );
});

test("vault route panel blocks duplicate submission while a recent route request is still open", async ({
  page,
}) => {
  await page.addInitScript(
    (data: {
      address: string;
      runtimeEnv: string;
      request: Record<string, unknown>;
    }) => {
      const { address, runtimeEnv, request } = data;

      window.localStorage.setItem(
        `aegis:recent-route-requests:${runtimeEnv}:${address}`,
        JSON.stringify([request])
      );
    },
    {
      address: MOCK_WALLET_ADDRESS,
      runtimeEnv: AEGIS_RUNTIME_ENV,
      request: {
        requestId: "req_pending_duplicate_guard",
        status: "validated",
        txHash: null,
        tokenSymbol: "USDC",
        amountRequested: "10",
        amountSubmitted: null,
        failureCategory: null,
        retryDisposition: null,
        warnings: [],
        error: null,
        note: null,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
        source: "panel",
        runtimeEnv: AEGIS_RUNTIME_ENV,
      },
    }
  );

  await page.route("**/api/portfolio**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(POSITIVE_DEPOSIT_PORTFOLIO),
    });
  });

  await page.route("**/api/activity**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_ACTIVITY),
    });
  });

  await page.route("**/api/history**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_HISTORY),
    });
  });

  await page.goto("/vault?e2eMockWallet=1");

  await expect(page.getByText("Existing route request needs review")).toBeVisible();
  await expect(page.getByTestId("vault-route-submit")).toBeDisabled();
  await expect(page.getByTestId("vault-route-submit")).toContainText(
    "Route Validated"
  );
});
