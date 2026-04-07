export const ROUTE_RETRY_DISPOSITIONS = [
  "wait_for_completion",
  "do_not_retry",
  "retry_immediately",
  "retry_after_user_action",
  "retry_after_operator_action",
] as const;

export type RouteRelayRetryDisposition =
  (typeof ROUTE_RETRY_DISPOSITIONS)[number];

export const ROUTE_FAILURE_CATEGORIES = [
  "policy_blocked",
  "user_action_required",
  "operator_action_required",
  "infrastructure_error",
  "execution_failure",
  "unknown_failure",
] as const;

export type RouteRelayFailureCategory =
  (typeof ROUTE_FAILURE_CATEGORIES)[number];

export const ROUTE_ALERT_STATUSES = [
  "not_applicable",
  "pending",
  "suppressed",
  "not_configured",
  "sent",
  "delivery_failed",
] as const;

export type RouteRelayAlertStatus = (typeof ROUTE_ALERT_STATUSES)[number];

export const ROUTE_ALERT_SEVERITIES = ["warning", "critical"] as const;

export type RouteRelayAlertSeverity = (typeof ROUTE_ALERT_SEVERITIES)[number];

export interface RouteRelayFailureMetadata {
  failureCategory: RouteRelayFailureCategory;
  retryDisposition: RouteRelayRetryDisposition;
  operatorAction: string;
  shouldAlert: boolean;
  alertSeverity: RouteRelayAlertSeverity;
}

export interface RouteRelayAlertOutcome {
  operatorAlertStatus: RouteRelayAlertStatus;
  operatorAlertedAt: string | null;
  operatorAlertError: string | null;
}

export interface RouteRelayAlertPayload {
  requestId: string | null;
  status: string;
  userAddress: string | null;
  intent: string | null;
  tokenSymbol: string | null;
  amountRequested: string | null;
  amountSubmitted: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  statusUrl: string | null;
}

const ALERT_WEBHOOK_URL =
  process.env.AI_ORACLE_RELAY_ALERT_WEBHOOK_URL?.trim() ?? "";
const ALERT_WEBHOOK_AUTH_TOKEN =
  process.env.AI_ORACLE_ALERT_WEBHOOK_AUTH_TOKEN?.trim() ?? "";
const ALERT_SOURCE =
  process.env.AI_ORACLE_ALERT_SOURCE?.trim() ?? "aegis-route-relay";
const ALERT_TIMEOUT_MS = (() => {
  const configured = process.env.AI_ORACLE_ALERT_TIMEOUT_MS?.trim();
  if (!configured) {
    return 3_000;
  }

  if (!/^\d+$/.test(configured)) {
    return 3_000;
  }

  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 3_000;
})();

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  const serialized = JSON.stringify(error);
  return serialized ?? String(error);
}

function getAlertEnvironment(): string {
  return (
    process.env.AI_ORACLE_RELAY_ALERT_ENVIRONMENT?.trim() ||
    process.env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "unknown"
  );
}

export function classifyRouteRelayFailure(input: {
  statusCode: number;
  error: string;
  detail?: string | null;
}): RouteRelayFailureMetadata {
  const combined = `${input.error} ${input.detail ?? ""}`.toLowerCase();

  if (
    combined.includes("risk gate") ||
    combined.includes("risk score") ||
    combined.includes("risk blocked") ||
    combined.includes("contract rejected the risk score")
  ) {
    return {
      failureCategory: "policy_blocked",
      retryDisposition: "do_not_retry",
      operatorAction:
        "Do not retry this route unchanged. Use a safer intent or keep the route blocked.",
      shouldAlert: false,
      alertSeverity: "warning",
    };
  }

  if (
    combined.includes("no deposited") ||
    combined.includes("requested amount exceeds") ||
    combined.includes("amount must be greater than zero") ||
    combined.includes("invalid amount") ||
    combined.includes("missing idempotency-key") ||
    combined.includes("missing or invalid useraddress") ||
    combined.includes("missing intent") ||
    combined.includes("missing route authorization") ||
    combined.includes("missing route authorization timestamp") ||
    combined.includes("missing or invalid route authorization signature") ||
    combined.includes("request body must be a json object") ||
    combined.includes("amount must be a base-10 number string") ||
    combined.includes("request body must be valid json") ||
    combined.includes("route authorization has expired") ||
    combined.includes("route authorization timestamp is invalid") ||
    combined.includes("signature is malformed") ||
    combined.includes("signature does not match") ||
    combined.includes("idempotency-key already used")
  ) {
    return {
      failureCategory: "user_action_required",
      retryDisposition: "retry_after_user_action",
      operatorAction:
        "Wait for the user to fix the request or deposit balance before retrying with a new idempotency key.",
      shouldAlert: false,
      alertSeverity: "warning",
    };
  }

  if (
    combined.includes("relay is disabled") ||
    combined.includes("storage is not configured") ||
    combined.includes("pinned to paseo") ||
    combined.includes("oracle address mismatch") ||
    combined.includes("xcm routing is paused") ||
    combined.includes("route cap exceeded") ||
    combined.includes("token not supported by vault") ||
    combined.includes("ai_oracle_private_key") ||
    combined.includes("xcm_wrapper_asset_id") ||
    combined.includes("server misconfiguration")
  ) {
    return {
      failureCategory: "operator_action_required",
      retryDisposition: "retry_after_operator_action",
      operatorAction:
        "Fix relay or vault configuration before retrying with a new idempotency key.",
      shouldAlert: true,
      alertSeverity: "critical",
    };
  }

  if (
    combined.includes("failed to read user deposit") ||
    combined.includes("failed to read aioracleaddress") ||
    combined.includes("failed to verify relay chain") ||
    combined.includes("failed to fetch route transaction receipt") ||
    combined.includes("failed to persist submitted route state") ||
    combined.includes("relay persistence failed after transaction broadcast")
  ) {
    return {
      failureCategory: "infrastructure_error",
      retryDisposition: "retry_after_operator_action",
      operatorAction:
        "Check RPC, database, and network dependencies. Inspect the request and tx hash before retrying.",
      shouldAlert: true,
      alertSeverity: "warning",
    };
  }

  if (
    combined.includes("transaction reverted on the source chain") ||
    combined.includes("routeyieldviaxcm transaction failed") ||
    combined.includes("insufficient vault balance for routing")
  ) {
    return {
      failureCategory: "execution_failure",
      retryDisposition: "retry_after_operator_action",
      operatorAction:
        "Inspect the request, vault state, and transaction details before retrying.",
      shouldAlert: true,
      alertSeverity: "critical",
    };
  }

  return {
    failureCategory: "unknown_failure",
    retryDisposition: input.statusCode >= 500
      ? "retry_after_operator_action"
      : "do_not_retry",
    operatorAction:
      "Inspect the relay error, request record, and server logs before retrying.",
    shouldAlert: input.statusCode >= 500,
    alertSeverity: input.statusCode >= 500 ? "critical" : "warning",
  };
}

export function getInitialRouteRelayAlertStatus(
  metadata: RouteRelayFailureMetadata
): RouteRelayAlertStatus {
  if (!metadata.shouldAlert) {
    return "suppressed";
  }

  if (!ALERT_WEBHOOK_URL) {
    return "not_configured";
  }

  return "pending";
}

async function dispatchRouteRelayFailureAlert(
  payload: RouteRelayAlertPayload,
  metadata: RouteRelayFailureMetadata
): Promise<RouteRelayAlertOutcome> {
  const initialStatus = getInitialRouteRelayAlertStatus(metadata);
  if (initialStatus !== "pending") {
    return {
      operatorAlertStatus: initialStatus,
      operatorAlertedAt: null,
      operatorAlertError: null,
    };
  }

  const environment = getAlertEnvironment();
  const summary =
    `[Aegis][${environment}] ${metadata.alertSeverity.toUpperCase()} ` +
    `route relay failure for ${payload.requestId ?? "preflight"}: ${payload.error ?? "unknown error"}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (ALERT_WEBHOOK_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${ALERT_WEBHOOK_AUTH_TOKEN}`;
    }

    const response = await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
      body: JSON.stringify({
        event: "aegis.route.failed",
        text: summary,
        content: summary,
        source: ALERT_SOURCE,
        environment,
        severity: metadata.alertSeverity,
        requestId: payload.requestId,
        status: payload.status,
        failureCategory: metadata.failureCategory,
        retryDisposition: metadata.retryDisposition,
        operatorAction: metadata.operatorAction,
        request: {
          userAddress: payload.userAddress,
          intent: payload.intent,
          tokenSymbol: payload.tokenSymbol,
          amountRequested: payload.amountRequested,
          amountSubmitted: payload.amountSubmitted,
          txHash: payload.txHash,
          statusUrl: payload.statusUrl,
          error: payload.error,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Alert webhook returned ${response.status} ${response.statusText}`
      );
    }

    return {
      operatorAlertStatus: "sent",
      operatorAlertedAt: new Date().toISOString(),
      operatorAlertError: null,
    };
  } catch (error) {
    return {
      operatorAlertStatus: "delivery_failed",
      operatorAlertedAt: null,
      operatorAlertError: formatUnknownError(error),
      };
  }
}

export function queueRouteRelayFailureAlert(input: {
  payload: RouteRelayAlertPayload;
  metadata: RouteRelayFailureMetadata;
  onOutcome?: (outcome: RouteRelayAlertOutcome) => Promise<void> | void;
}): void {
  if (getInitialRouteRelayAlertStatus(input.metadata) !== "pending") {
    return;
  }

  void (async () => {
    const outcome = await dispatchRouteRelayFailureAlert(
      input.payload,
      input.metadata
    );

    try {
      await input.onOutcome?.(outcome);
    } catch (error) {
      console.error("Failed to persist route relay alert outcome", error);
    }
  })();
}
