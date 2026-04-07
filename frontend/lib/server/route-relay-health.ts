import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AEGIS_VAULT_ABI, CONTRACT_ADDRESSES } from "@/lib/contracts";
import { EXPERIMENTAL_ROUTING_ENABLED } from "@/lib/feature-flags";
import {
  AEGIS_RUNTIME_ENV,
  isConfiguredAddress,
} from "@/lib/runtime/environment";
import { fetchVaultActivityData } from "@/lib/server/activity-indexer";
import { fetchVaultPortfolioSnapshot } from "@/lib/server/portfolio-snapshot";
import { ROUTE_RELAY_ENABLED } from "@/lib/server/route-relay-flags";
import type { RouteRelayRecord } from "@/lib/server/route-relay";
import {
  getRouteRelayStoreBackend,
  listRouteRelayStoredRecordsForMonitoring,
  type RouteRelayStoreBackend,
} from "@/lib/server/route-relay-store";

const PAS_CHAIN_ID = 420420417;
const DEFAULT_RECENT_WINDOW_MINUTES = 60;
const DEFAULT_STALE_SUBMITTED_MINUTES = 20;
const PAS_RPC_URL =
  process.env.NEXT_PUBLIC_PASEO_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";

export type RouteRelayHealthStatus = "ok" | "degraded" | "failed" | "disabled";

interface RouteRelayStorageSnapshot {
  backend: RouteRelayStoreBackend;
  allowedForRuntime: boolean;
}

interface RouteRelaySignerSnapshot {
  configuredAddress: string | null;
  vaultOracleAddress: string | null;
  chainId: number | null;
}

interface RouteRelayAlertingSnapshot {
  webhookConfigured: boolean;
  source: string | null;
  environment: string | null;
}

interface RouteRelayReadCheckSnapshot {
  status: "ok" | "failed";
  detail: string;
  indexedThroughBlock?: string | null;
  fromBlock?: string | null;
  blockNumber?: string | null;
  observedAt?: string | null;
}

interface RouteRelayRecentActivitySnapshot {
  monitoringWindowMinutes: number;
  staleSubmittedMinutes: number;
  recentRecordCount: number;
  recentFailureCount: number;
  submittedCount: number;
  sourceConfirmedCount: number;
  staleSubmittedCount: number;
  pendingAlertCount: number;
  deliveryFailedAlertCount: number;
  failureCategoryCounts: Record<string, number>;
}

export interface RouteRelayHealthSnapshot {
  status: RouteRelayHealthStatus;
  generatedAt: string;
  runtime: {
    appEnv: string;
    hostRuntime: "local" | "railway" | "vercel";
    relayEnabled: boolean;
    experimentalRoutingEnabled: boolean;
  };
  storage: RouteRelayStorageSnapshot;
  signer: RouteRelaySignerSnapshot;
  alerting: RouteRelayAlertingSnapshot;
  readChecks: {
    activity: RouteRelayReadCheckSnapshot;
    portfolio: RouteRelayReadCheckSnapshot;
  };
  recentActivity: RouteRelayRecentActivitySnapshot;
  issues: string[];
  warnings: string[];
}

function detectHostRuntime(): "local" | "railway" | "vercel" {
  if (
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_PROJECT_ID
  ) {
    return "railway";
  }

  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return "vercel";
  }

  return "local";
}

function formatAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isValidPrivateKey(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
}

function getAlertEnvironmentLabel(): string | null {
  return (
    process.env.AI_ORACLE_RELAY_ALERT_ENVIRONMENT?.trim() ||
    process.env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    null
  );
}

function buildEmptyRecentActivity(): RouteRelayRecentActivitySnapshot {
  return {
    monitoringWindowMinutes: DEFAULT_RECENT_WINDOW_MINUTES,
    staleSubmittedMinutes: DEFAULT_STALE_SUBMITTED_MINUTES,
    recentRecordCount: 0,
    recentFailureCount: 0,
    submittedCount: 0,
    sourceConfirmedCount: 0,
    staleSubmittedCount: 0,
    pendingAlertCount: 0,
    deliveryFailedAlertCount: 0,
    failureCategoryCounts: {},
  };
}

export async function getRouteRelayHealthSnapshot(): Promise<RouteRelayHealthSnapshot> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const hostRuntime = detectHostRuntime();
  const storageBackend = getRouteRelayStoreBackend();
  const relayEnabled = ROUTE_RELAY_ENABLED;
  const experimentalRoutingEnabled = EXPERIMENTAL_ROUTING_ENABLED;

  const storage: RouteRelayStorageSnapshot = {
    backend: storageBackend,
    allowedForRuntime:
      storageBackend === "postgres" ||
      process.env.AI_ORACLE_RELAY_ALLOW_FILE_STORE === "true",
  };

  if (
    relayEnabled &&
    storageBackend !== "postgres" &&
    process.env.AI_ORACLE_RELAY_ALLOW_FILE_STORE !== "true"
  ) {
    issues.push(
      "Relay is enabled without Postgres-backed storage or explicit local file-store opt-in."
    );
  }

  if (
    relayEnabled &&
    storageBackend === "file" &&
    hostRuntime !== "local"
  ) {
    issues.push("Hosted relay monitoring detected file-store mode outside local runtime.");
  }

  if (relayEnabled && AEGIS_RUNTIME_ENV !== "paseo-beta") {
    issues.push(
      `Relay monitoring is running under ${AEGIS_RUNTIME_ENV}; hosted relay execution is only supported in paseo-beta.`
    );
  }

  let recentRecords: RouteRelayRecord[] = [];
  try {
    recentRecords = await listRouteRelayStoredRecordsForMonitoring({
      recentWindowMinutes: DEFAULT_RECENT_WINDOW_MINUTES,
      staleSubmittedMinutes: DEFAULT_STALE_SUBMITTED_MINUTES,
      limit: 200,
    });
  } catch (error) {
    issues.push(
      `Failed to read relay monitoring records: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const recentWindowStartMs =
    Date.now() - DEFAULT_RECENT_WINDOW_MINUTES * 60_000;
  const staleSubmittedBeforeMs =
    Date.now() - DEFAULT_STALE_SUBMITTED_MINUTES * 60_000;
  const recentActivity = buildEmptyRecentActivity();

  recentActivity.recentRecordCount = recentRecords.filter((record) => {
    const updatedAtMs = Date.parse(record.updatedAt);
    return Number.isFinite(updatedAtMs) && updatedAtMs >= recentWindowStartMs;
  }).length;
  recentActivity.recentFailureCount = recentRecords.filter((record) => {
    const updatedAtMs = Date.parse(record.updatedAt);
    return (
      record.status === "failed" &&
      Number.isFinite(updatedAtMs) &&
      updatedAtMs >= recentWindowStartMs
    );
  }).length;
  recentActivity.submittedCount = recentRecords.filter(
    (record) => record.status === "submitted"
  ).length;
  recentActivity.sourceConfirmedCount = recentRecords.filter(
    (record) => record.status === "source_confirmed"
  ).length;
  recentActivity.staleSubmittedCount = recentRecords.filter((record) => {
    const createdAtMs = Date.parse(record.createdAt);
    return (
      record.status === "submitted" &&
      Number.isFinite(createdAtMs) &&
      createdAtMs <= staleSubmittedBeforeMs
    );
  }).length;
  recentActivity.pendingAlertCount = recentRecords.filter(
    (record) => record.operatorAlertStatus === "pending"
  ).length;
  recentActivity.deliveryFailedAlertCount = recentRecords.filter(
    (record) => record.operatorAlertStatus === "delivery_failed"
  ).length;
  recentActivity.failureCategoryCounts = recentRecords.reduce<Record<string, number>>(
    (counts, record) => {
      if (!record.failureCategory) {
        return counts;
      }

      counts[record.failureCategory] = (counts[record.failureCategory] ?? 0) + 1;
      return counts;
    },
    {}
  );

  if (recentActivity.staleSubmittedCount > 0) {
    warnings.push(
      `${recentActivity.staleSubmittedCount} submitted relay request(s) are older than ${DEFAULT_STALE_SUBMITTED_MINUTES} minutes.`
    );
  }

  if (recentActivity.deliveryFailedAlertCount > 0) {
    warnings.push(
      `${recentActivity.deliveryFailedAlertCount} relay alert delivery attempt(s) failed in the monitoring window.`
    );
  }

  if (recentActivity.pendingAlertCount > 0) {
    warnings.push(
      `${recentActivity.pendingAlertCount} relay alert(s) are still marked pending in the monitoring window.`
    );
  }

  const alerting: RouteRelayAlertingSnapshot = {
    webhookConfigured: Boolean(process.env.AI_ORACLE_RELAY_ALERT_WEBHOOK_URL?.trim()),
    source: process.env.AI_ORACLE_ALERT_SOURCE?.trim() || "aegis-route-relay",
    environment: getAlertEnvironmentLabel(),
  };

  if (relayEnabled && hostRuntime !== "local" && !alerting.webhookConfigured) {
    warnings.push(
      "Relay is enabled in a hosted runtime without AI_ORACLE_RELAY_ALERT_WEBHOOK_URL."
    );
  }

  const signer: RouteRelaySignerSnapshot = {
    configuredAddress: null,
    vaultOracleAddress: null,
    chainId: null,
  };

  if (relayEnabled) {
    const oraclePrivateKey = process.env.AI_ORACLE_PRIVATE_KEY?.trim();
    const configuredOracleAddress = isValidPrivateKey(oraclePrivateKey)
      ? privateKeyToAccount(oraclePrivateKey).address
      : null;

    if (!isValidPrivateKey(oraclePrivateKey)) {
      issues.push("AI_ORACLE_PRIVATE_KEY is missing or invalid while the relay is enabled.");
    } else {
      signer.configuredAddress = formatAddress(configuredOracleAddress);
    }

    if (AEGIS_RUNTIME_ENV !== "paseo-beta") {
      warnings.push(
        "Skipped signer/vault Paseo preflight because the active runtime is not paseo-beta."
      );
    } else if (!isConfiguredAddress(CONTRACT_ADDRESSES.AEGIS_VAULT)) {
      issues.push("NEXT_PUBLIC_AEGIS_VAULT_ADDRESS is not configured for relay monitoring.");
    } else {
      try {
        const publicClient = createPublicClient({
          chain: {
            id: PAS_CHAIN_ID,
            name: "Paseo Testnet",
            network: "paseo-testnet",
            nativeCurrency: { decimals: 18, name: "Paseo", symbol: "PAS" },
            rpcUrls: {
              default: { http: [PAS_RPC_URL] },
              public: { http: [PAS_RPC_URL] },
            },
          },
          transport: http(PAS_RPC_URL),
        });

        const [chainId, vaultOracleAddress] = await Promise.all([
          publicClient.getChainId(),
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.AEGIS_VAULT,
            abi: AEGIS_VAULT_ABI,
            functionName: "aiOracleAddress",
          }) as Promise<`0x${string}`>,
        ]);

        signer.chainId = chainId;
        signer.vaultOracleAddress = formatAddress(vaultOracleAddress);

        if (chainId !== PAS_CHAIN_ID) {
          issues.push(`Relay monitoring resolved chain ID ${chainId}; expected ${PAS_CHAIN_ID}.`);
        }

        if (
          configuredOracleAddress &&
          configuredOracleAddress.toLowerCase() !== vaultOracleAddress.toLowerCase()
        ) {
          issues.push("Configured relay signer does not match the vault aiOracleAddress.");
        }
      } catch (error) {
        issues.push(
          `Unable to complete relay signer/vault preflight: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const readChecks: RouteRelayHealthSnapshot["readChecks"] = {
    activity: {
      status: "failed",
      detail: "Activity read check not started.",
    },
    portfolio: {
      status: "failed",
      detail: "Portfolio read check not started.",
    },
  };

  try {
    const payload = await fetchVaultActivityData(undefined, { includeGlobalRoutes: true });
    readChecks.activity = {
      status: "ok",
      detail: `Fetched ${payload.transactions.length} activity event(s).`,
      indexedThroughBlock: payload.indexedThroughBlock,
      fromBlock: payload.fromBlock,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    readChecks.activity = {
      status: "failed",
      detail,
    };
    issues.push(`Activity read check failed: ${detail}`);
  }

  try {
    const payload = await fetchVaultPortfolioSnapshot();
    readChecks.portfolio = {
      status: "ok",
      detail: `Fetched ${payload.assets.length} supported asset position(s).`,
      blockNumber: payload.snapshot.blockNumber,
      observedAt: payload.snapshot.observedAt,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    readChecks.portfolio = {
      status: "failed",
      detail,
    };
    issues.push(`Portfolio read check failed: ${detail}`);
  }

  const status: RouteRelayHealthStatus =
    issues.length > 0
      ? "failed"
      : !relayEnabled
        ? "disabled"
        : warnings.length > 0
          ? "degraded"
          : "ok";

  return {
    status,
    generatedAt: new Date().toISOString(),
    runtime: {
      appEnv: AEGIS_RUNTIME_ENV,
      hostRuntime,
      relayEnabled,
      experimentalRoutingEnabled,
    },
    storage,
    signer,
    alerting,
    readChecks,
    recentActivity,
    issues,
    warnings,
  };
}
