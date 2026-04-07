export function createClientRequestKey(prefix: string): string {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
