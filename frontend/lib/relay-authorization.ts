export interface RouteAuthorizationMessageInput {
  userAddress: string;
  intent: string;
  amountRequested: string | null;
  idempotencyKey: string;
  issuedAt: string;
}

export function buildRouteAuthorizationMessage(
  input: RouteAuthorizationMessageInput
): string {
  return [
    "Aegis experimental route request",
    "Authorize the Aegis relay to submit this prototype route request.",
    `Wallet: ${input.userAddress.toLowerCase()}`,
    `Intent: ${input.intent.trim()}`,
    `Amount: ${input.amountRequested?.trim() || "FULL_DEPOSIT"}`,
    `Idempotency-Key: ${input.idempotencyKey}`,
    `Issued-At: ${input.issuedAt}`,
  ].join("\n");
}
