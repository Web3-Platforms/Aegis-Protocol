import { expect, test } from "@playwright/test";

test("canceling a routed chat action does not submit a transaction", async ({ page }) => {
  const rpcMethods: string[] = [];

  page.on("request", (request) => {
    const payload = request.postData();
    if (!payload) return;

    try {
      const parsed = JSON.parse(payload);
      if (parsed?.method) {
        rpcMethods.push(parsed.method);
      }
    } catch {
      // Ignore non-JSON requests.
    }
  });

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

  await page.goto("/chat?e2eMockWallet=1");

  const connectButton = page.getByRole("button", { name: "Connect Wallet" });
  if (await connectButton.count()) {
    await connectButton.click();
  }

  await page.getByTestId("chat-intent-input").fill("Earn yield on Acala");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByText(/passed the current prototype risk gate/i)).toBeVisible();

  await page.getByTestId("cancel-transaction").click();

  await expect(
    page.getByText("Transaction cancelled. No transaction was sent.")
  ).toBeVisible();
  await expect(page.getByTestId("confirm-transaction")).toHaveCount(0);

  expect(rpcMethods).not.toContain("eth_sendTransaction");
  expect(rpcMethods).not.toContain("eth_sendRawTransaction");
  expect(rpcMethods).not.toContain("wallet_sendCalls");
});
