import { createHash, randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  TransactionReceiptNotFoundError,
  verifyMessage,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AEGIS_VAULT_ABI,
  CONTRACT_ADDRESSES,
  SUPPORTED_TOKENS,
} from "@/lib/contracts";
import { AssetType, encodeAssetDataForXCM } from "@/lib/xcm-encoder";
import {
  classifyRouteRelayFailure,
  getInitialRouteRelayAlertStatus,
  queueRouteRelayFailureAlert,
  type RouteRelayAlertStatus,
  type RouteRelayAlertPayload,
  type RouteRelayFailureCategory,
  type RouteRelayRetryDisposition,
} from "@/lib/server/route-relay-ops";
import { ROUTE_RELAY_ENABLED } from "@/lib/server/route-relay-flags";
import {
  getRouteRelayStoreBackend,
  getRouteRelayStoredRecordByIdempotencyKey,
  getRouteRelayStoredRecordByRequestId,
  claimRouteRelayRequestedRecord,
  persistRouteRelayRecord,
} from "@/lib/server/route-relay-store";
import {
  assessRouteIntent,
  type RiskScoringMethod,
} from "@/lib/server/risk-oracle";
import { buildRouteAuthorizationMessage } from "@/lib/relay-authorization";

const PAS_RPC_URL =
  process.env.NEXT_PUBLIC_PASEO_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ROUTE_AUTH_MAX_AGE_MS = 5 * 60 * 1000;
const RECENT_REQUEST_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_CROSS_CHAIN_PROOF_WARNING =
  "Paseo route submissions record source-chain contract activity only; they do not prove cross-chain delivery.";
const PUBLIC_PERSISTENCE_DEGRADED_WARNING =
  "Route submission was broadcast, but relay persistence degraded after broadcast. Inspect the tx hash before retrying.";
const PUBLIC_RECEIPT_REFRESH_WARNING =
  "Source-chain receipt confirmation is temporarily unavailable; route status may refresh on a later check.";

const paseoTestnet = {
  id: 420420417,
  name: "Paseo Testnet",
  network: "paseo-testnet",
  nativeCurrency: { decimals: 18, name: "Paseo", symbol: "PAS" },
  rpcUrls: {
    default: { http: [PAS_RPC_URL] },
    public: { http: [PAS_RPC_URL] },
  },
} as const;

export const ROUTE_REQUEST_STATUSES = [
  "requested",
  "validated",
  "submitted",
  "source_confirmed",
  "failed",
] as const;

export type RouteRequestStatus = (typeof ROUTE_REQUEST_STATUSES)[number];

export interface RouteRelayRecord {
  requestId: string;
  requestDigest: string;
  idempotencyKey: string;
  responseStatusCode: number;
  status: RouteRequestStatus;
  userAddress: Hex;
  intent: string;
  amountRequested: string | null;
  amountSubmitted: string | null;
  depositedBalanceAtSubmission: string | null;
  destParachainId: number | null;
  tokenAddress: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  assetType: AssetType | null;
  assetId: number | null;
  assetData: Hex | null;
  feeAssetItem: number;
  weightLimit: string;
  riskScore: number | null;
  scoringMethod: RiskScoringMethod | null;
  authorizationIssuedAt: string | null;
  oracleAddress: Hex | null;
  txHash: Hex | null;
  txReceiptStatus: "success" | "reverted" | null;
  txReceiptBlockNumber: string | null;
  warnings: string[];
  error: string | null;
  failureCategory: RouteRelayFailureCategory | null;
  retryDisposition: RouteRelayRetryDisposition;
  operatorAction: string | null;
  operatorAlertStatus: RouteRelayAlertStatus;
  operatorAlertedAt: string | null;
  operatorAlertError: string | null;
  executionMode: "experimental_paseo";
  createdAt: string;
  updatedAt: string;
}

interface SubmitRouteRequestResult {
  record: RouteRelayRecord;
  duplicate: boolean;
}

interface RouteRequestInput {
  userAddress: Hex;
  intent: string;
  amountRequested: string | null;
  authorizationIssuedAt: string;
  authorizationSignature: Hex;
}

interface RouteTokenConfig {
  address: Hex;
  symbol: string;
  decimals: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isHexAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isConfiguredAddress(value: string): value is Hex {
  return isHexAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  const serializedError = JSON.stringify(error);
  return serializedError ?? String(error);
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new RouteRelayHttpError(500, {
      error: "XCM_WRAPPER_ASSET_ID must be a base-10 integer",
    });
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new RouteRelayHttpError(500, {
      error: "XCM_WRAPPER_ASSET_ID must be a positive safe integer",
    });
  }

  return parsedValue;
}

function normalizeAmountInput(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalizedValue =
    typeof value === "number" ? value.toString() : String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(normalizedValue)) {
    throw new RouteRelayHttpError(400, {
      error: "amount must be a base-10 number string",
      detail: "Use a string such as \"12.5\" or omit amount to route the full deposited balance.",
    });
  }

  return normalizedValue;
}

function normalizeRouteRequest(body: unknown): RouteRequestInput {
  if (!isObject(body)) {
    throw new RouteRelayHttpError(400, {
      error: "Request body must be a JSON object",
    });
  }

  const userAddress = String(body.userAddress ?? "").trim();
  if (!isHexAddress(userAddress)) {
    throw new RouteRelayHttpError(400, {
      error: "Missing or invalid userAddress",
      detail: "userAddress must be a 0x-prefixed EVM address.",
    });
  }

  const intent = String(body.intent ?? "").trim();
  if (!intent) {
    throw new RouteRelayHttpError(400, {
      error: "Missing intent",
      detail: "Provide the natural-language routing intent that should be scored and relayed.",
    });
  }

  const authorization = body.authorization;
  if (!isObject(authorization)) {
    throw new RouteRelayHttpError(401, {
      error: "Missing route authorization",
      detail: "Sign the relay request with the connected wallet before submitting it.",
    });
  }

  const authorizationIssuedAt = String(authorization.issuedAt ?? "").trim();
  if (!authorizationIssuedAt) {
    throw new RouteRelayHttpError(401, {
      error: "Missing route authorization timestamp",
    });
  }

  const authorizationSignature = String(authorization.signature ?? "").trim();
  if (!/^0x[0-9a-fA-F]{130}$/.test(authorizationSignature)) {
    throw new RouteRelayHttpError(401, {
      error: "Missing or invalid route authorization signature",
    });
  }

  return {
    userAddress,
    intent,
    amountRequested: normalizeAmountInput(body.amount),
    authorizationIssuedAt,
    authorizationSignature: authorizationSignature as Hex,
  };
}

function getRelayTokenConfig(): RouteTokenConfig {
  const usdcToken = SUPPORTED_TOKENS.find((token) => token.symbol === "USDC");

  if (!usdcToken || !isConfiguredAddress(usdcToken.address)) {
    throw new RouteRelayHttpError(500, {
      error: "Server misconfiguration: USDC token address is not configured",
      detail:
        "Set NEXT_PUBLIC_TEST_USDC_ADDRESS or NEXT_PUBLIC_USDC_TOKEN_ADDRESS in frontend/.env.local.",
    });
  }

  return {
    address: usdcToken.address,
    symbol: usdcToken.symbol,
    decimals: usdcToken.decimals,
  };
}

function getVaultAddress(): Hex {
  if (!isConfiguredAddress(CONTRACT_ADDRESSES.AEGIS_VAULT)) {
    throw new RouteRelayHttpError(500, {
      error: "Server misconfiguration: vault address is not configured",
      detail:
        "Set NEXT_PUBLIC_AEGIS_VAULT_ADDRESS in frontend/.env.local before using the relay service.",
    });
  }

  return CONTRACT_ADDRESSES.AEGIS_VAULT;
}

function getOraclePrivateKey(): `0x${string}` {
  const aiOraclePrivateKey = process.env.AI_ORACLE_PRIVATE_KEY;

  if (!aiOraclePrivateKey) {
    throw new RouteRelayHttpError(501, {
      error: "AI_ORACLE_PRIVATE_KEY is not configured",
      detail:
        "Add AI_ORACLE_PRIVATE_KEY=0x<private-key> to frontend/.env.local for local work or set it as a Railway-managed server secret for operator deployments. " +
        "This must be the aiOracleAddress signer configured in the vault contract.",
    });
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(aiOraclePrivateKey)) {
    throw new RouteRelayHttpError(500, {
      error: "AI_ORACLE_PRIVATE_KEY format is invalid",
      detail: "The key must be a 0x-prefixed 32-byte hex string.",
    });
  }

  return aiOraclePrivateKey as `0x${string}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: paseoTestnet as Parameters<typeof createPublicClient>[0]["chain"],
    transport: http(PAS_RPC_URL),
  });
}

function getConfiguredOracleSigner() {
  const oraclePrivateKey = getOraclePrivateKey();
  const oracleAccount = privateKeyToAccount(oraclePrivateKey);

  return {
    oraclePrivateKey,
    oracleAccount,
  };
}

function getRequestDigest(input: RouteRequestInput, tokenAddress: Hex): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        userAddress: input.userAddress.toLowerCase(),
        intent: input.intent,
        amountRequested: input.amountRequested ?? null,
        tokenAddress: tokenAddress.toLowerCase(),
      })
    )
    .digest("hex");
}

function getIdempotencyKey(
  idempotencyKeyHeader: string | null,
  requestDigest: string
): string {
  const normalizedHeader = idempotencyKeyHeader?.trim();

  if (normalizedHeader) {
    return normalizedHeader;
  }

  throw new RouteRelayHttpError(400, {
    error: "Missing Idempotency-Key header",
    detail:
      `Replay-safe relay authorization requires an explicit Idempotency-Key. ` +
      `Derived key would have been ${requestDigest}.`,
  });
}

function createRequestedRecord(
  input: RouteRequestInput,
  token: RouteTokenConfig,
  idempotencyKey: string,
  requestDigest: string
): RouteRelayRecord {
  const timestamp = nowIso();

  return {
    requestId: `route-${randomUUID()}`,
    requestDigest,
    idempotencyKey,
    responseStatusCode: 202,
    status: "requested",
    userAddress: input.userAddress,
    intent: input.intent,
    amountRequested: input.amountRequested,
    amountSubmitted: null,
    depositedBalanceAtSubmission: null,
    destParachainId: null,
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    assetType: null,
    assetId: null,
    assetData: null,
    feeAssetItem: 0,
    weightLimit: "1000000",
    riskScore: null,
    scoringMethod: null,
    authorizationIssuedAt: input.authorizationIssuedAt,
    oracleAddress: null,
    txHash: null,
    txReceiptStatus: null,
    txReceiptBlockNumber: null,
    warnings: [
      "Paseo route submissions record source-chain contract activity only; they do not prove cross-chain delivery.",
    ],
    error: null,
    failureCategory: null,
    retryDisposition: "wait_for_completion",
    operatorAction: null,
    operatorAlertStatus: "not_applicable",
    operatorAlertedAt: null,
    operatorAlertError: null,
    executionMode: "experimental_paseo",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function updateRecord(
  record: RouteRelayRecord,
  updates: Partial<RouteRelayRecord>
): RouteRelayRecord {
  return {
    ...record,
    ...updates,
    updatedAt: nowIso(),
  };
}

function appendWarning(
  warnings: string[],
  warning: string
): string[] {
  return warnings.includes(warning) ? warnings : [...warnings, warning];
}

export function sanitizeRouteRelayWarningsForPublic(warnings: string[]): string[] {
  const sanitizedWarnings: string[] = [];

  for (const warning of warnings) {
    let sanitizedWarning: string | null = null;

    if (warning === PUBLIC_CROSS_CHAIN_PROOF_WARNING) {
      sanitizedWarning = PUBLIC_CROSS_CHAIN_PROOF_WARNING;
    } else if (
      warning.startsWith(
        "Relay state persistence failed after transaction broadcast."
      )
    ) {
      sanitizedWarning = PUBLIC_PERSISTENCE_DEGRADED_WARNING;
    } else if (
      warning.startsWith("Relay follow-up after transaction broadcast failed:") ||
      warning === "Route status could not be refreshed during this history lookup."
    ) {
      sanitizedWarning = PUBLIC_RECEIPT_REFRESH_WARNING;
    }

    if (sanitizedWarning && !sanitizedWarnings.includes(sanitizedWarning)) {
      sanitizedWarnings.push(sanitizedWarning);
    }
  }

  return sanitizedWarnings;
}

function buildAlertPayload(record: RouteRelayRecord): RouteRelayAlertPayload {
  return {
    requestId: record.requestId,
    status: record.status,
    userAddress: record.userAddress,
    intent: record.intent,
    tokenSymbol: record.tokenSymbol,
    amountRequested: record.amountRequested,
    amountSubmitted: record.amountSubmitted,
    txHash: record.txHash,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusUrl: `/api/execute-route?requestId=${record.requestId}`,
  };
}

function buildPreclaimAlertPayload(input: {
  normalizedRequest: RouteRequestInput | null;
  token: RouteTokenConfig | null;
  errorMessage: string;
}): RouteRelayAlertPayload {
  const timestamp = nowIso();

  return {
    requestId: null,
    status: "failed",
    userAddress: input.normalizedRequest?.userAddress ?? null,
    intent: input.normalizedRequest?.intent ?? null,
    tokenSymbol: input.token?.symbol ?? null,
    amountRequested: input.normalizedRequest?.amountRequested ?? null,
    amountSubmitted: null,
    txHash: null,
    error: input.errorMessage,
    createdAt: timestamp,
    updatedAt: timestamp,
    statusUrl: null,
  };
}

function buildPreclaimFailureError(
  error: RouteRelayHttpError,
  input: {
    normalizedRequest: RouteRequestInput | null;
    token: RouteTokenConfig | null;
  }
): RouteRelayHttpError {
  const failureMetadata = classifyRouteRelayFailure({
    statusCode: error.status,
    error: String(error.payload.error ?? error.message),
    detail:
      typeof error.payload.detail === "string" ? error.payload.detail : null,
  });
  const operatorAlertStatus = getInitialRouteRelayAlertStatus(failureMetadata);
  const errorMessage = String(
    error.payload.detail ?? error.payload.error ?? error.message
  );

  if (operatorAlertStatus === "pending") {
    queueRouteRelayFailureAlert({
      payload: buildPreclaimAlertPayload({
        normalizedRequest: input.normalizedRequest,
        token: input.token,
        errorMessage,
      }),
      metadata: failureMetadata,
    });
  }

  return new RouteRelayHttpError(error.status, {
    ...error.payload,
    success: false,
    failureCategory: failureMetadata.failureCategory,
    retryDisposition: failureMetadata.retryDisposition,
    operatorAction: failureMetadata.operatorAction,
    operatorAlertStatus,
    operatorAlertedAt: null,
    operatorAlertError: null,
  });
}

function buildRouteResponse(record: RouteRelayRecord, duplicate: boolean) {
  return {
    success: record.status !== "failed",
    duplicate,
    requestId: record.requestId,
    idempotencyKey: record.idempotencyKey,
    status: record.status,
    txHash: record.txHash,
    destParachainId: record.destParachainId,
    amountRequested: record.amountRequested,
    amountSubmitted: record.amountSubmitted,
    depositedBalanceAtSubmission: record.depositedBalanceAtSubmission,
    riskScore: record.riskScore,
    scoringMethod: record.scoringMethod,
    tokenAddress: record.tokenAddress,
    tokenSymbol: record.tokenSymbol,
    tokenDecimals: record.tokenDecimals,
    assetType: record.assetType,
    assetId: record.assetId,
    assetData: record.assetData,
    feeAssetItem: record.feeAssetItem,
    weightLimit: record.weightLimit,
    oracleAddress: record.oracleAddress,
    warnings: sanitizeRouteRelayWarningsForPublic(record.warnings),
    error: record.error,
    failureCategory: record.failureCategory,
    retryDisposition: record.retryDisposition,
    operatorAction: record.operatorAction,
    operatorAlertStatus: record.operatorAlertStatus,
    operatorAlertedAt: record.operatorAlertedAt,
    operatorAlertError: record.operatorAlertError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusUrl: buildRouteStatusUrl(record),
    note:
      "The relay service pins XCM asset-data construction on the server and only proves source-chain submission in the current Paseo environment.",
  };
}

function buildRouteStatusUrl(record: Pick<RouteRelayRecord, "requestId" | "userAddress">) {
  const searchParams = new URLSearchParams({
    requestId: record.requestId,
    userAddress: record.userAddress.toLowerCase(),
  });

  return `/api/execute-route?${searchParams.toString()}`;
}

function buildStoredRouteStatusResponse(record: RouteRelayRecord) {
  return {
    success: record.status !== "failed",
    requestId: record.requestId,
    status: record.status,
    txHash: record.txHash,
    tokenSymbol: record.tokenSymbol,
    amountRequested: record.amountRequested,
    amountSubmitted: record.amountSubmitted,
    failureCategory: record.failureCategory,
    retryDisposition: record.retryDisposition,
    warnings: sanitizeRouteRelayWarningsForPublic(record.warnings),
    error: getStoredRouteStatusError(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusUrl: buildRouteStatusUrl(record),
    note:
      "The relay service only proves source-chain submission in the current Paseo environment and does not expose full internal relay records through this status endpoint.",
  };
}

function getStoredRouteStatusError(record: RouteRelayRecord): string | null {
  if (!record.error || record.status === "source_confirmed") {
    return null;
  }

  switch (record.failureCategory) {
    case "policy_blocked":
      return "Route request is blocked by the current policy or risk guard.";
    case "user_action_required":
      return "Route request needs updated user input or authorization before it can continue.";
    case "operator_action_required":
      return "Route request needs operator configuration changes before it can continue.";
    case "infrastructure_error":
      return "Route request hit a relay or RPC dependency issue and needs operator follow-up.";
    case "execution_failure":
      return "Route submission failed on the source chain and needs operator review before retry.";
    case "unknown_failure":
      return "Route request failed and needs operator review before retry.";
    default:
      return record.status === "submitted"
        ? "Route submission is still awaiting source-chain confirmation."
        : "Route request needs operator follow-up.";
  }
}

async function verifyRouteAuthorization(
  input: RouteRequestInput,
  idempotencyKey: string
): Promise<void> {
  const issuedAtMs = Date.parse(input.authorizationIssuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    throw new RouteRelayHttpError(401, {
      error: "Route authorization timestamp is invalid",
    });
  }

  const now = Date.now();
  if (issuedAtMs > now + 60_000 || now - issuedAtMs > ROUTE_AUTH_MAX_AGE_MS) {
    throw new RouteRelayHttpError(401, {
      error: "Route authorization has expired",
      detail: "Sign and submit the route request within five minutes.",
    });
  }

  let isValid = false;

  try {
    isValid = await verifyMessage({
      address: input.userAddress,
      message: buildRouteAuthorizationMessage({
        userAddress: input.userAddress,
        intent: input.intent,
        amountRequested: input.amountRequested,
        idempotencyKey,
        issuedAt: input.authorizationIssuedAt,
      }),
      signature: input.authorizationSignature,
    });
  } catch {
    throw new RouteRelayHttpError(401, {
      error: "Route authorization signature is malformed",
    });
  }

  if (!isValid) {
    throw new RouteRelayHttpError(403, {
      error: "Route authorization signature does not match userAddress",
    });
  }
}

function getAmountToSubmit(
  amountRequested: string | null,
  depositedBalance: bigint,
  tokenDecimals: number
): bigint {
  if (amountRequested === null) {
    return depositedBalance;
  }

  let parsedAmount: bigint;
  try {
    parsedAmount = parseUnits(amountRequested, tokenDecimals);
  } catch (error) {
    throw new RouteRelayHttpError(400, {
      error: "Invalid amount",
      detail: formatUnknownError(error),
    });
  }

  if (parsedAmount <= 0n) {
    throw new RouteRelayHttpError(400, {
      error: "Amount must be greater than zero",
    });
  }

  if (parsedAmount > depositedBalance) {
    throw new RouteRelayHttpError(400, {
      error: "Requested amount exceeds deposited balance",
      detail: `Requested ${amountRequested}, but only ${depositedBalance.toString()} base units are deposited.`,
    });
  }

  return parsedAmount;
}

function mapSubmissionError(
  error: unknown,
  oracleAddress: Hex,
  tokenAddress: Hex,
  amount: bigint
): RouteRelayHttpError {
  const message = formatUnknownError(error);

  if (message.includes("OnlyAIOracle")) {
    return new RouteRelayHttpError(403, {
      error: "Oracle address mismatch",
      detail:
        `The configured relay signer resolves to ${oracleAddress}, but the vault expects a different aiOracleAddress.`,
    });
  }

  if (message.includes("RiskScoreTooHigh")) {
    return new RouteRelayHttpError(403, {
      error: "Contract rejected the risk score",
      detail: message,
    });
  }

  if (message.includes("TokenNotSupported")) {
    return new RouteRelayHttpError(400, {
      error: "Token not supported by vault",
      detail: `${tokenAddress} is not in the vault's supported-token list.`,
      tokenAddress,
    });
  }

  if (message.includes("XCMRoutingPaused")) {
    return new RouteRelayHttpError(503, {
      error: "XCM routing is paused",
      detail: "Call vault.toggleXcmRoute() from the owner wallet to unpause routing.",
    });
  }

  if (message.includes("RouteCapExceeded")) {
    return new RouteRelayHttpError(503, {
      error: "Route cap exceeded",
      detail:
        "The current route or asset-type cap would be exceeded by this submission. Adjust the route caps before retrying.",
    });
  }

  if (message.includes("InsufficientRoutedBalance")) {
    return new RouteRelayHttpError(400, {
      error: "Insufficient vault balance for routing",
      detail: "The vault does not hold enough token balance to route the requested amount.",
      amount: amount.toString(),
    });
  }

  return new RouteRelayHttpError(500, {
    error: "routeYieldViaXCM transaction failed",
    detail: message,
  });
}

async function markRecordFailed(
  record: RouteRelayRecord,
  statusCode: number,
  message: string,
  failureMetadata: ReturnType<typeof classifyRouteRelayFailure>,
  updates: Partial<RouteRelayRecord> = {}
): Promise<RouteRelayRecord> {
  const initialAlertStatus = getInitialRouteRelayAlertStatus(failureMetadata);
  const failedRecord = updateRecord(record, {
    status: "failed",
    responseStatusCode: statusCode,
    error: message,
    failureCategory: failureMetadata.failureCategory,
    retryDisposition: failureMetadata.retryDisposition,
    operatorAction: failureMetadata.operatorAction,
    operatorAlertStatus: initialAlertStatus,
    operatorAlertedAt: null,
    operatorAlertError: null,
    ...updates,
  });

  const persistedRecord = await persistRouteRelayRecord(failedRecord);

  if (initialAlertStatus !== "pending") {
    return persistedRecord;
  }

  queueRouteRelayFailureAlert({
    payload: buildAlertPayload(persistedRecord),
    metadata: failureMetadata,
    onOutcome: async (alertOutcome) => {
      try {
        await persistRouteRelayRecord(
          updateRecord(persistedRecord, {
            operatorAlertStatus: alertOutcome.operatorAlertStatus,
            operatorAlertedAt: alertOutcome.operatorAlertedAt,
            operatorAlertError: alertOutcome.operatorAlertError,
          })
        );
      } catch (error) {
        console.error("Failed to persist route relay alert outcome", error);
      }
    },
  });

  return persistedRecord;
}

async function fetchDepositedBalance(
  userAddress: Hex,
  tokenAddress: Hex
): Promise<bigint> {
  try {
    return (await getPublicClient().readContract({
      address: getVaultAddress(),
      abi: AEGIS_VAULT_ABI,
      functionName: "getUserDeposit",
      args: [userAddress, tokenAddress],
    })) as bigint;
  } catch (error) {
    throw new RouteRelayHttpError(502, {
      error: "Failed to read user deposit from the vault",
      detail: formatUnknownError(error),
    });
  }
}

export async function refreshRouteRelayRecord(
  record: RouteRelayRecord
): Promise<RouteRelayRecord> {
  if (record.status !== "submitted" || !record.txHash) {
    return record;
  }

  try {
    const receipt = await getPublicClient().getTransactionReceipt({
      hash: record.txHash,
    });

    if (receipt.status === "success") {
      const nextRecord = updateRecord(record, {
        status: "source_confirmed",
        responseStatusCode: 200,
        txReceiptStatus: receipt.status,
        txReceiptBlockNumber: receipt.blockNumber.toString(),
        error: record.error,
        failureCategory: null,
        retryDisposition: "do_not_retry",
        operatorAction: null,
      });

      return persistRouteRelayRecord(nextRecord);
    }

    const failureMetadata = classifyRouteRelayFailure({
      statusCode: 500,
      error: "Transaction reverted on the source chain.",
      detail: record.error ?? undefined,
    });

    return markRecordFailed(
      record,
      500,
      record.error ?? "Transaction reverted on the source chain.",
      failureMetadata,
      {
        txReceiptStatus: receipt.status,
        txReceiptBlockNumber: receipt.blockNumber.toString(),
      }
    );
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return record;
    }

    throw new RouteRelayHttpError(502, {
      error: "Failed to fetch route transaction receipt",
      detail: formatUnknownError(error),
      requestId: record.requestId,
    });
  }
}

async function assertRelayChainIsPaseo(): Promise<void> {
  try {
    const chainId = await getPublicClient().getChainId();
    if (chainId !== paseoTestnet.id) {
      throw new RouteRelayHttpError(503, {
        error: "Route relay is pinned to Paseo only",
        detail:
          `Configured RPC resolved to chain ID ${chainId}. Keep AI_ORACLE_RELAY_ENABLED=false outside explicit Paseo operator deployments.`,
      });
    }
  } catch (error) {
    if (error instanceof RouteRelayHttpError) {
      throw error;
    }

    throw new RouteRelayHttpError(502, {
      error: "Failed to verify relay chain",
      detail: formatUnknownError(error),
    });
  }
}

async function assertConfiguredOracleMatchesVault(
  oracleAddress: Hex
): Promise<void> {
  try {
    const configuredOracleAddress = (await getPublicClient().readContract({
      address: getVaultAddress(),
      abi: AEGIS_VAULT_ABI,
      functionName: "aiOracleAddress",
    })) as Hex;

    if (configuredOracleAddress.toLowerCase() !== oracleAddress.toLowerCase()) {
      throw new RouteRelayHttpError(403, {
        error: "Oracle address mismatch",
        detail:
          `The configured relay signer resolves to ${oracleAddress}, but the vault expects ${configuredOracleAddress}.`,
        oracleAddress,
        expectedOracleAddress: configuredOracleAddress,
      });
    }
  } catch (error) {
    if (error instanceof RouteRelayHttpError) {
      throw error;
    }

    throw new RouteRelayHttpError(502, {
      error: "Failed to read aiOracleAddress from the vault",
      detail: formatUnknownError(error),
    });
  }
}

async function assertRelayRuntimeReady(): Promise<void> {
  if (!ROUTE_RELAY_ENABLED) {
    throw new RouteRelayHttpError(503, {
      error: "Experimental route relay is disabled for this deployment",
      detail:
        "Set AI_ORACLE_RELAY_ENABLED=true only for explicit operator-controlled Paseo deployments. NEXT_PUBLIC_ENABLE_EXPERIMENTAL_ROUTING does not enable server signing.",
    });
  }

  if (
    getRouteRelayStoreBackend() !== "postgres" &&
    process.env.AI_ORACLE_RELAY_ALLOW_FILE_STORE !== "true"
  ) {
    throw new RouteRelayHttpError(503, {
      error: "Durable relay storage is not configured",
      detail:
        "Set AI_ORACLE_RELAY_DATABASE_URL (or DATABASE_URL) to Railway Postgres before enabling the relay, or set AI_ORACLE_RELAY_ALLOW_FILE_STORE=true only for single-instance local prototype work.",
    });
  }

  await assertRelayChainIsPaseo();
}

export class RouteRelayHttpError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.error ?? "Route relay request failed"));
    this.status = status;
    this.payload = payload;
  }
}

export async function submitRouteRequest(
  body: unknown,
  idempotencyKeyHeader: string | null
): Promise<SubmitRouteRequestResult> {
  let token: RouteTokenConfig | null = null;
  let normalizedRequest: RouteRequestInput | null = null;
  let requestDigest: string | null = null;
  let idempotencyKey: string | null = null;
  let existingRecord: RouteRelayRecord | null = null;
  let oracleAccount: ReturnType<typeof getConfiguredOracleSigner>["oracleAccount"] | null =
    null;

  try {
    await assertRelayRuntimeReady();
    normalizedRequest = normalizeRouteRequest(body);
    token = getRelayTokenConfig();
    requestDigest = getRequestDigest(normalizedRequest, token.address);
    idempotencyKey = getIdempotencyKey(idempotencyKeyHeader, requestDigest);
    await verifyRouteAuthorization(normalizedRequest, idempotencyKey);

    existingRecord = await getRouteRelayStoredRecordByIdempotencyKey(
      idempotencyKey
    );
    if (existingRecord && existingRecord.requestDigest !== requestDigest) {
      throw new RouteRelayHttpError(409, {
        error: "Idempotency-Key already used for a different route request",
        requestId: existingRecord.requestId,
      });
    }

    if (!existingRecord) {
      ({ oracleAccount } = getConfiguredOracleSigner());
      await assertConfiguredOracleMatchesVault(oracleAccount.address);
    }
  } catch (error) {
    if (error instanceof RouteRelayHttpError) {
      throw buildPreclaimFailureError(error, {
        normalizedRequest,
        token,
      });
    }

    throw error;
  }

  if (existingRecord) {
    return {
      record: await refreshRouteRelayRecord(existingRecord),
      duplicate: true,
    };
  }

  if (!token || !normalizedRequest || !requestDigest || !idempotencyKey) {
    throw new Error("Route relay preflight did not complete");
  }

  const claimedRecord = await claimRouteRelayRequestedRecord(
    createRequestedRecord(normalizedRequest, token, idempotencyKey, requestDigest),
    RECENT_REQUEST_DEDUPE_WINDOW_MS
  );
  if (!claimedRecord.inserted) {
    if (
      claimedRecord.duplicateReason === "idempotency" &&
      claimedRecord.record.requestDigest !== requestDigest
    ) {
      throw buildPreclaimFailureError(
        new RouteRelayHttpError(409, {
          error: "Idempotency-Key already used for a different route request",
          requestId: claimedRecord.record.requestId,
        }),
        {
          normalizedRequest,
          token,
        }
      );
    }

    return {
        record: await refreshRouteRelayRecord(claimedRecord.record),
      duplicate: true,
    };
  }

  let record = claimedRecord.record;

  try {
    const routeAssessment = await assessRouteIntent(normalizedRequest.intent);
    record = updateRecord(record, {
      status: "validated",
      responseStatusCode: 202,
      destParachainId: routeAssessment.parachainId,
      riskScore: routeAssessment.riskScore,
      scoringMethod: routeAssessment.scoringMethod,
      assetType: AssetType.WRAPPER_MAPPED,
      assetId: parseOptionalPositiveInteger(process.env.XCM_WRAPPER_ASSET_ID) ?? null,
    });
    record = await persistRouteRelayRecord(record);

    if (!routeAssessment.safeToRoute) {
      throw new RouteRelayHttpError(403, {
        error: "Route blocked by risk gate",
        detail: `Risk score ${routeAssessment.riskScore} is at or above 75.`,
      });
    }

    const depositedBalance = await fetchDepositedBalance(
      normalizedRequest.userAddress,
      token.address
    );

    if (depositedBalance === 0n) {
      throw new RouteRelayHttpError(400, {
        error: "No deposited balance available for routing",
        detail: `${normalizedRequest.userAddress} has no deposited ${token.symbol} balance to route.`,
      });
    }

    const amountToSubmit = getAmountToSubmit(
      normalizedRequest.amountRequested,
      depositedBalance,
      token.decimals
    );

    record = updateRecord(record, {
      amountSubmitted: amountToSubmit.toString(),
      depositedBalanceAtSubmission: depositedBalance.toString(),
      assetData: encodeAssetDataForXCM(
        token.address,
        amountToSubmit,
        routeAssessment.parachainId,
        AssetType.WRAPPER_MAPPED,
        record.assetId ?? undefined
      ),
    });
    record = await persistRouteRelayRecord(record);

    if (!oracleAccount) {
      throw new Error("Route relay signer preflight did not complete");
    }

    const walletClient = createWalletClient({
      account: oracleAccount,
      chain: paseoTestnet as Parameters<typeof createWalletClient>[0]["chain"],
      transport: http(PAS_RPC_URL),
    });

    let txHash: Hex;
    try {
      txHash = await walletClient.writeContract({
        address: getVaultAddress(),
        abi: AEGIS_VAULT_ABI,
        functionName: "routeYieldViaXCM",
        args: [
          routeAssessment.parachainId,
          token.address,
          amountToSubmit,
          BigInt(routeAssessment.riskScore),
          record.assetData as Hex,
          record.feeAssetItem,
          BigInt(record.weightLimit),
          AssetType.WRAPPER_MAPPED,
        ],
        chain: paseoTestnet as Parameters<typeof walletClient.writeContract>[0]["chain"],
      });
    } catch (error) {
      const relayError = mapSubmissionError(
        error,
        oracleAccount.address,
        token.address,
        amountToSubmit
      );
      throw relayError;
    }

    record = updateRecord(record, {
      status: "submitted",
      responseStatusCode: 200,
      oracleAddress: oracleAccount.address,
      txHash,
      error: null,
      failureCategory: null,
      retryDisposition: "wait_for_completion",
      operatorAction: null,
      operatorAlertStatus: "not_applicable",
      operatorAlertedAt: null,
      operatorAlertError: null,
    });

    try {
      record = await persistRouteRelayRecord(record);
    } catch (error) {
      const failureMessage =
        "Route transaction was submitted, but the relay could not persist the submitted state. Do not submit the route again until the tx hash is checked manually.";
      const failureMetadata = classifyRouteRelayFailure({
        statusCode: 502,
        error: "Relay persistence failed after transaction broadcast",
        detail: formatUnknownError(error),
      });
      const operatorAlertStatus = getInitialRouteRelayAlertStatus(failureMetadata);
      const degradedRecord = updateRecord(record, {
        responseStatusCode: 200,
        error: failureMessage,
        failureCategory: failureMetadata.failureCategory,
        retryDisposition: "wait_for_completion",
        operatorAction:
          "Inspect the returned tx hash and request ID before any retry. Do not submit a new route while the broadcast transaction may still settle.",
        operatorAlertStatus,
        warnings: appendWarning(
          record.warnings,
          "Relay state persistence failed after transaction broadcast. Use the returned tx hash and request ID to investigate before retrying."
        ),
      });

      if (operatorAlertStatus === "pending") {
        queueRouteRelayFailureAlert({
          payload: buildAlertPayload(degradedRecord),
          metadata: failureMetadata,
        });
      }

      return {
        record: degradedRecord,
        duplicate: false,
      };
    }

    return {
      record,
      duplicate: false,
    };
  } catch (error) {
    if (record.txHash) {
      const failureMessage = formatUnknownError(error);
      const failureMetadata = classifyRouteRelayFailure({
        statusCode:
          error instanceof RouteRelayHttpError ? error.status : 502,
        error:
          error instanceof RouteRelayHttpError
            ? String(error.payload.error ?? error.message)
            : "Route relay degraded after transaction broadcast",
        detail: failureMessage,
      });
      const operatorAlertStatus = getInitialRouteRelayAlertStatus(failureMetadata);
      const degradedRecord = updateRecord(record, {
        responseStatusCode: 200,
        error:
          "Route transaction was already broadcast. Inspect the tx hash and request record before any retry.",
        failureCategory: failureMetadata.failureCategory,
        retryDisposition: "wait_for_completion",
        operatorAction:
          "Use the tx hash and request ID to inspect source-chain status before retrying. Do not submit a new route while this transaction may still settle.",
        operatorAlertStatus,
        warnings: appendWarning(
          record.warnings,
          `Relay follow-up after transaction broadcast failed: ${failureMessage}`
        ),
      });

      if (operatorAlertStatus === "pending") {
        queueRouteRelayFailureAlert({
          payload: buildAlertPayload(degradedRecord),
          metadata: failureMetadata,
        });
      }

      return {
        record: degradedRecord,
        duplicate: false,
      };
    }

    if (error instanceof RouteRelayHttpError) {
      const failureMetadata = classifyRouteRelayFailure({
        statusCode: error.status,
        error: String(error.payload.error ?? error.message),
        detail:
          typeof error.payload.detail === "string" ? error.payload.detail : null,
      });

      const failedRecord = await markRecordFailed(
        record,
        error.status,
        String(error.payload.detail ?? error.payload.error ?? error.message),
        failureMetadata
      );
      throw new RouteRelayHttpError(
        failedRecord.responseStatusCode,
        buildRouteResponse(failedRecord, false)
      );
    }

    const failureMessage = formatUnknownError(error);
    const failedRecord = await markRecordFailed(
      record,
      500,
      failureMessage,
      classifyRouteRelayFailure({
        statusCode: 500,
        error: "Unexpected route relay failure",
        detail: failureMessage,
      })
    );
    throw new RouteRelayHttpError(500, buildRouteResponse(failedRecord, false));
  }
}

export async function getRouteRequestStatus(
  requestId: string,
  userAddress: string
): Promise<RouteRelayRecord> {
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) {
    throw new RouteRelayHttpError(400, {
      error: "Missing requestId",
      detail: "Pass ?requestId=<route-request-id> to query relay status.",
    });
  }

  const normalizedUserAddress = userAddress.trim().toLowerCase();
  if (!isHexAddress(normalizedUserAddress)) {
    throw new RouteRelayHttpError(400, {
      error: "Missing or invalid userAddress",
      detail:
        "Pass ?userAddress=<connected-wallet-address> together with requestId to query relay status.",
    });
  }

  const storedRecord = await getRouteRelayStoredRecordByRequestId(
    normalizedRequestId
  );
  if (!storedRecord || storedRecord.userAddress.toLowerCase() !== normalizedUserAddress) {
    throw new RouteRelayHttpError(404, {
      error: "Route request not found",
      requestId: normalizedRequestId,
    });
  }

  return refreshRouteRelayRecord(storedRecord);
}

export function getRouteResponsePayload(
  result: SubmitRouteRequestResult
): Record<string, unknown> {
  return buildRouteResponse(result.record, result.duplicate);
}

export function getStoredRouteResponsePayload(
  record: RouteRelayRecord
): Record<string, unknown> {
  return buildStoredRouteStatusResponse(record);
}
