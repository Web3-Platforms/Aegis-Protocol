import type { ActivityTransaction, ActivityStats } from "@/lib/activity";
import { AEGIS_RUNTIME, AEGIS_RUNTIME_ENV } from "@/lib/runtime/environment";
import { fetchVaultActivityData } from "@/lib/server/activity-indexer";
import { EXPERIMENTAL_ROUTING_ENABLED } from "@/lib/feature-flags";
import { fetchVaultPortfolioSnapshot } from "@/lib/server/portfolio-snapshot";
import {
  getProductEventSummary,
  hasProductEventDatabase,
  type ProductEventSummary,
} from "@/lib/server/product-event-store";
import { ROUTE_RELAY_ENABLED } from "@/lib/server/route-relay-flags";
import type { RouteRelayRecord } from "@/lib/server/route-relay";
import { getRouteRelayHealthSnapshot } from "@/lib/server/route-relay-health";
import { listRouteRelayStoredRecordsForMonitoring } from "@/lib/server/route-relay-store";

const MAX_WINDOW_DAYS = 30;
const DEFAULT_WINDOW_DAYS = 7;
const STALE_SUBMITTED_MINUTES = 20;
const RELAY_SUMMARY_LIMIT = 2000;

export interface LaunchKpiDashboardSnapshot {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  runtime: {
    appEnv: typeof AEGIS_RUNTIME_ENV;
    chainName: string;
    postureLabel: string;
    relayEnabled: boolean;
    experimentalRoutingEnabled: boolean;
  };
  productEvents: {
    available: boolean;
    trustModel: "directional_client_reported";
    summary: ProductEventSummary | null;
    warnings: string[];
  };
  relay: {
    status: "ok" | "degraded" | "failed" | "disabled";
    healthGeneratedAt: string;
    recentWindowDays: number;
    recordsAvailable: boolean;
    recentRecordCount: number | null;
    recentFailureCount: number | null;
    requestedCount: number | null;
    validatedCount: number | null;
    submittedCount: number | null;
    sourceConfirmedCount: number | null;
    failedCount: number | null;
    staleSubmittedCount: number | null;
    pendingAlertCount: number | null;
    deliveryFailedAlertCount: number | null;
    failureCategoryCounts: Record<string, number>;
    truncated: boolean;
    issues: string[];
    warnings: string[];
  };
  betaActivity: {
    stats: {
      totalDeposited: number;
      totalWithdrawn: number;
      totalRouteEventAmount: number;
      transactionCount: number;
      routeGroupCount: number;
      averageRiskScore: number;
    } | null;
    portfolio: {
      supportedAssetCount: number;
      vaultNonZeroAssetCount: number;
    } | null;
    warnings: string[];
  };
  manualInputsRequired: string[];
  reviewCadence: {
    daily: string;
    weekly: string;
    monthly: string;
  };
}

function computeRelayWindowSummary(
  records: RouteRelayRecord[],
  windowStartMs: number,
  staleSubmittedBeforeMs: number
) {
  const recentRecords = records.filter((record) => {
    const updatedAtMs = Date.parse(record.updatedAt);
    return Number.isFinite(updatedAtMs) && updatedAtMs >= windowStartMs;
  });

  const statusCounts = recentRecords.reduce<Record<string, number>>((counts, record) => {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
    return counts;
  }, {});

  const failureCategoryCounts = recentRecords.reduce<Record<string, number>>(
    (counts, record) => {
      if (!record.failureCategory) {
        return counts;
      }

      counts[record.failureCategory] = (counts[record.failureCategory] ?? 0) + 1;
      return counts;
    },
    {}
  );

  return {
    recentRecordCount: recentRecords.length,
    recentFailureCount: recentRecords.filter((record) => record.status === "failed")
      .length,
    requestedCount: statusCounts.requested ?? 0,
    validatedCount: statusCounts.validated ?? 0,
    submittedCount: statusCounts.submitted ?? 0,
    sourceConfirmedCount: statusCounts.source_confirmed ?? 0,
    failedCount: statusCounts.failed ?? 0,
    staleSubmittedCount: records.filter((record) => {
      const createdAtMs = Date.parse(record.createdAt);
      return (
        record.status === "submitted" &&
        Number.isFinite(createdAtMs) &&
        createdAtMs <= staleSubmittedBeforeMs
      );
    }).length,
    pendingAlertCount: recentRecords.filter(
      (record) => record.operatorAlertStatus === "pending"
    ).length,
    deliveryFailedAlertCount: recentRecords.filter(
      (record) => record.operatorAlertStatus === "delivery_failed"
    ).length,
    failureCategoryCounts,
  };
}

function computeWindowedActivityStats(
  transactions: ActivityTransaction[],
  windowStartMs: number
): ActivityStats {
  const windowedTransactions = transactions.filter((transaction) => {
    const timestampMs = Date.parse(transaction.timestamp);
    return Number.isFinite(timestampMs) && timestampMs >= windowStartMs;
  });

  const totalDeposited = windowedTransactions
    .filter((transaction) => transaction.type === "deposit")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalWithdrawn = windowedTransactions
    .filter((transaction) => transaction.type === "withdrawal")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const routeTransactions = windowedTransactions.filter(
    (transaction) => transaction.type === "route_event"
  );
  const routeGroupCount = new Set(
    routeTransactions.map(
      (transaction) =>
        `${transaction.parachainId ?? 0}:${transaction.tokenAddress.toLowerCase()}`
    )
  ).size;

  return {
    totalDeposited,
    totalWithdrawn,
    totalRouteEventAmount: routeTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    ),
    transactionCount: windowedTransactions.length,
    routeGroupCount,
    averageRiskScore:
      routeTransactions.length > 0
        ? routeTransactions.reduce(
            (sum, transaction) => sum + (transaction.riskScore ?? 0),
            0
          ) / routeTransactions.length
        : 0,
  };
}

export function parseLaunchKpiWindowDays(value: string | null | undefined): number {
  if (!value) {
    return DEFAULT_WINDOW_DAYS;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("days must be a positive integer.");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_WINDOW_DAYS) {
    throw new Error(`days must be between 1 and ${MAX_WINDOW_DAYS}.`);
  }

  return parsed;
}

export async function getLaunchKpiDashboardSnapshot(
  windowDays: number
): Promise<LaunchKpiDashboardSnapshot> {
  const boundedWindowDays = parseLaunchKpiWindowDays(String(windowDays));
  const generatedAt = new Date().toISOString();
  const windowStart = new Date(
    Date.now() - boundedWindowDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const windowStartMs = Date.parse(windowStart);
  const staleSubmittedBeforeMs =
    Date.now() - STALE_SUBMITTED_MINUTES * 60_000;

  const productEventsWarnings: string[] = [];
  let productEventSummary: ProductEventSummary | null = null;

  if (!hasProductEventDatabase()) {
    productEventsWarnings.push(
      "Product event storage is not configured; funnel metrics are unavailable for this snapshot."
    );
  } else {
    try {
      productEventSummary = await getProductEventSummary({
        windowDays: boundedWindowDays,
      });
    } catch (error) {
      productEventsWarnings.push(
        `Failed to summarize product events: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (productEventSummary) {
    productEventsWarnings.push(
      "Product-event funnel metrics are same-origin client-reported signals. Use them as directional product-interest data, not bot-proof revenue or partner-conversion proof."
    );
  }

  const [relayHealthSnapshot, relayRecordsResult, activityResult, portfolioResult] =
    await Promise.allSettled([
      getRouteRelayHealthSnapshot(),
      listRouteRelayStoredRecordsForMonitoring({
        recentWindowMinutes: boundedWindowDays * 24 * 60,
        staleSubmittedMinutes: STALE_SUBMITTED_MINUTES,
        limit: RELAY_SUMMARY_LIMIT,
      }),
      fetchVaultActivityData(undefined, { includeGlobalRoutes: true }),
      fetchVaultPortfolioSnapshot(),
    ]);

  const relaySnapshot =
    relayHealthSnapshot.status === "fulfilled"
      ? relayHealthSnapshot.value
      : {
          status: "failed" as const,
          generatedAt,
          issues: [
            relayHealthSnapshot.reason instanceof Error
              ? relayHealthSnapshot.reason.message
              : String(relayHealthSnapshot.reason),
          ],
          warnings: [] as string[],
        };

  const relayRecords =
    relayRecordsResult.status === "fulfilled" ? relayRecordsResult.value : [];
  const relayWarnings = [...relaySnapshot.warnings];
  const relayRecordsAvailable = relayRecordsResult.status === "fulfilled";
  if (relayRecordsResult.status === "rejected") {
    relayWarnings.push(
      `Failed to load relay records for the selected window: ${relayRecordsResult.reason instanceof Error ? relayRecordsResult.reason.message : String(relayRecordsResult.reason)}`
    );
  }
  const relayTruncated =
    relayRecordsAvailable && relayRecords.length >= RELAY_SUMMARY_LIMIT;
  if (relayTruncated) {
    relayWarnings.push(
      `Relay KPI counts reached the ${RELAY_SUMMARY_LIMIT}-record monitoring cap; widen storage-specific reporting if this beta exceeds the current bound.`
    );
  }
  const relaySummary = computeRelayWindowSummary(
    relayRecords,
    windowStartMs,
    staleSubmittedBeforeMs
  );

  const betaActivityWarnings: string[] = [];
  const activityStats =
    activityResult.status === "fulfilled"
      ? computeWindowedActivityStats(
          activityResult.value.transactions,
          windowStartMs
        )
      : null;
  if (activityResult.status === "rejected") {
    betaActivityWarnings.push(
      `Failed to load activity stats: ${activityResult.reason instanceof Error ? activityResult.reason.message : String(activityResult.reason)}`
    );
  }

  const portfolioSummary =
    portfolioResult.status === "fulfilled"
      ? {
          supportedAssetCount: portfolioResult.value.summary.supportedAssetCount,
          vaultNonZeroAssetCount: portfolioResult.value.summary.vaultNonZeroAssetCount,
        }
      : null;
  if (portfolioResult.status === "rejected") {
    betaActivityWarnings.push(
      `Failed to load portfolio summary: ${portfolioResult.reason instanceof Error ? portfolioResult.reason.message : String(portfolioResult.reason)}`
    );
  }

  return {
    generatedAt,
    windowDays: boundedWindowDays,
    windowStart,
    runtime: {
      appEnv: AEGIS_RUNTIME_ENV,
      chainName: AEGIS_RUNTIME.chainName,
      postureLabel: AEGIS_RUNTIME.postureLabel,
      relayEnabled: ROUTE_RELAY_ENABLED,
      experimentalRoutingEnabled: EXPERIMENTAL_ROUTING_ENABLED,
    },
    productEvents: {
      available: productEventSummary !== null,
      trustModel: "directional_client_reported",
      summary: productEventSummary,
      warnings: productEventsWarnings,
    },
    relay: {
      status: relaySnapshot.status,
      healthGeneratedAt: relaySnapshot.generatedAt,
      recentWindowDays: boundedWindowDays,
      recordsAvailable: relayRecordsAvailable,
      recentRecordCount: relayRecordsAvailable ? relaySummary.recentRecordCount : null,
      recentFailureCount: relayRecordsAvailable
        ? relaySummary.recentFailureCount
        : null,
      requestedCount: relayRecordsAvailable ? relaySummary.requestedCount : null,
      validatedCount: relayRecordsAvailable ? relaySummary.validatedCount : null,
      submittedCount: relayRecordsAvailable ? relaySummary.submittedCount : null,
      sourceConfirmedCount: relayRecordsAvailable
        ? relaySummary.sourceConfirmedCount
        : null,
      failedCount: relayRecordsAvailable ? relaySummary.failedCount : null,
      staleSubmittedCount: relayRecordsAvailable
        ? relaySummary.staleSubmittedCount
        : null,
      pendingAlertCount: relayRecordsAvailable
        ? relaySummary.pendingAlertCount
        : null,
      deliveryFailedAlertCount: relayRecordsAvailable
        ? relaySummary.deliveryFailedAlertCount
        : null,
      failureCategoryCounts: relayRecordsAvailable
        ? relaySummary.failureCategoryCounts
        : {},
      truncated: relayTruncated,
      issues: relaySnapshot.issues,
      warnings: relayWarnings,
    },
    betaActivity: {
      stats: activityStats,
      portfolio: portfolioSummary,
      warnings: betaActivityWarnings,
    },
    manualInputsRequired: [
      "Active accounts worked (CRM)",
      "Qualified conversations (CRM)",
      "Proposals sent (CRM)",
      "Pilots closed (CRM / signed artifacts)",
      "Highest-confidence next revenue step (founder judgement)",
      "Highest-risk blocker (workbook + launch report)",
    ],
    reviewCadence: {
      daily:
        "Review the 1-day snapshot for relay posture, recent failures, stale submitted requests, and route-block reasons before operator experiments.",
      weekly:
        "Review the 7-day snapshot alongside CRM, workbook status changes, and the AEGIS-901 report template every Friday.",
      monthly:
        "Review the 30-day snapshot alongside incidents, outreach results, and backlog movement before AEGIS-904 reprioritization.",
    },
  };
}

function formatCountsTable(
  counts: Record<string, number>,
  unavailable = false
): string[] {
  if (unavailable) {
    return ["- unavailable"];
  }

  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return ["- none"];
  }

  return entries.map(([key, value]) => `- ${key}: ${value}`);
}

function formatMaybeNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unavailable" : String(value);
}

export function formatLaunchKpiDashboardMarkdown(
  snapshot: LaunchKpiDashboardSnapshot
): string {
  const lines: string[] = [];

  lines.push("# Aegis Launch KPI Dashboard");
  lines.push("");
  lines.push(`- Generated at: ${snapshot.generatedAt}`);
  lines.push(`- Window: last ${snapshot.windowDays} day(s)`);
  lines.push(
    `- Runtime: ${snapshot.runtime.appEnv} / ${snapshot.runtime.chainName} / ${snapshot.runtime.postureLabel}`
  );
  lines.push("");
  lines.push("## Runtime posture");
  lines.push(`- Relay enabled: ${snapshot.runtime.relayEnabled}`);
  lines.push(
    `- Experimental routing UI enabled: ${snapshot.runtime.experimentalRoutingEnabled}`
  );
  lines.push(`- Relay health status: ${snapshot.relay.status}`);
  lines.push("");
  lines.push("## Automatic KPI snapshot");
  lines.push("");
  lines.push("| Metric | Value | Source |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Product events available | ${snapshot.productEvents.available} | product_events |`
  );
  lines.push(
    `| Sessions observed | ${formatMaybeNumber(snapshot.productEvents.summary?.distinctSessions)} | product_events |`
  );
  lines.push(
    `| Deposit attempts | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.deposit_attempted)} | product_events |`
  );
  lines.push(
    `| Deposit blocks | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.deposit_blocked)} | product_events |`
  );
  lines.push(
    `| Withdrawal attempts | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.withdrawal_attempted)} | product_events |`
  );
  lines.push(
    `| Withdrawal blocks | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.withdrawal_blocked)} | product_events |`
  );
  lines.push(
    `| Route assessments requested | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.route_assessment_requested)} | product_events |`
  );
  lines.push(
    `| Route assessments returned | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.route_assessment_returned)} | product_events |`
  );
  lines.push(
    `| Route assessments failed | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.route_assessment_failed)} | product_events |`
  );
  lines.push(
    `| Route submissions blocked | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.route_submission_blocked)} | product_events |`
  );
  lines.push(
    `| Route submissions cancelled | ${formatMaybeNumber(snapshot.productEvents.summary?.countsByEventName.route_submission_cancelled)} | product_events |`
  );
  lines.push(
    `| Relay recent failures | ${formatMaybeNumber(snapshot.relay.recentFailureCount)} | ai_oracle_relay_requests |`
  );
  lines.push(
    `| Relay source-confirmed count | ${formatMaybeNumber(snapshot.relay.sourceConfirmedCount)} | ai_oracle_relay_requests |`
  );
  lines.push(
    `| Relay stale submitted count | ${formatMaybeNumber(snapshot.relay.staleSubmittedCount)} | ai_oracle_relay_requests |`
  );
  lines.push(
    `| Total deposited (beta activity) | ${formatMaybeNumber(snapshot.betaActivity.stats?.totalDeposited)} | activity index |`
  );
  lines.push(
    `| Total withdrawn (beta activity) | ${formatMaybeNumber(snapshot.betaActivity.stats?.totalWithdrawn)} | activity index |`
  );
  lines.push(
    `| Total route event amount | ${formatMaybeNumber(snapshot.betaActivity.stats?.totalRouteEventAmount)} | activity index |`
  );
  lines.push(
    `| Supported assets in vault snapshot | ${formatMaybeNumber(snapshot.betaActivity.portfolio?.supportedAssetCount)} | portfolio snapshot |`
  );
  lines.push("");
  lines.push("## Surface views");
  lines.push(
    ...formatCountsTable(
      snapshot.productEvents.summary?.surfaceViewCounts ?? {},
      !snapshot.productEvents.available
    )
  );
  lines.push("");
  lines.push("## Route blocked reasons");
  lines.push(
    ...formatCountsTable(
      snapshot.productEvents.summary?.routeBlockedCountsByReason ?? {},
      !snapshot.productEvents.available
    )
  );
  lines.push("");
  lines.push("## Route blocked reasons by source");
  if (!snapshot.productEvents.available) {
    lines.push("- unavailable");
  } else {
    const bySourceEntries = Object.entries(
      snapshot.productEvents.summary?.routeBlockedCountsBySource ?? {}
    ).sort((left, right) => right[1].total - left[1].total);

    if (bySourceEntries.length === 0) {
      lines.push("- none");
    } else {
      for (const [source, value] of bySourceEntries) {
        lines.push(`- ${source}: ${value.total}`);
        lines.push(...formatCountsTable(value.byReason).map((line) => `  ${line}`));
      }
    }
  }
  lines.push("");
  lines.push("## Relay failure categories");
  lines.push(
    ...formatCountsTable(
      snapshot.relay.failureCategoryCounts,
      !snapshot.relay.recordsAvailable
    )
  );

  if (snapshot.productEvents.warnings.length > 0) {
    lines.push("");
    lines.push("## Product event warnings");
    lines.push(...snapshot.productEvents.warnings.map((warning) => `- ${warning}`));
  }

  if (snapshot.relay.issues.length > 0 || snapshot.relay.warnings.length > 0) {
    lines.push("");
    lines.push("## Relay issues and warnings");
    lines.push(...snapshot.relay.issues.map((issue) => `- issue: ${issue}`));
    lines.push(...snapshot.relay.warnings.map((warning) => `- warning: ${warning}`));
  }

  if (snapshot.betaActivity.warnings.length > 0) {
    lines.push("");
    lines.push("## Beta activity warnings");
    lines.push(...snapshot.betaActivity.warnings.map((warning) => `- ${warning}`));
  }

  lines.push("");
  lines.push("## Manual inputs still required");
  lines.push(...snapshot.manualInputsRequired.map((item) => `- ${item}`));
  lines.push("");
  lines.push("## Review cadence");
  lines.push(`- Daily: ${snapshot.reviewCadence.daily}`);
  lines.push(`- Weekly: ${snapshot.reviewCadence.weekly}`);
  lines.push(`- Monthly: ${snapshot.reviewCadence.monthly}`);

  return lines.join("\n");
}
