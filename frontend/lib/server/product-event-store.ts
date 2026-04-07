import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { StoredProductEvent } from "@/lib/product-events";
import { AEGIS_RUNTIME_ENV } from "@/lib/runtime/environment";

const PRODUCT_EVENTS_TABLE = "product_events";
const PRODUCT_EVENTS_OCCURRED_AT_INDEX = "product_events_occurred_at_idx";
const PRODUCT_EVENTS_NAME_INDEX = "product_events_event_name_idx";

const PRODUCT_EVENTS_DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  process.env.AI_ORACLE_RELAY_DATABASE_URL?.trim() ||
  null;

let postgresPool: Pool | null = null;
let postgresSchemaPromise: Promise<void> | null = null;

export interface ProductEventSummaryQuery {
  windowDays: number;
}

export interface ProductEventSummary {
  windowDays: number;
  windowStart: string;
  latestEventAt: string | null;
  totalEvents: number;
  distinctSessions: number;
  countsByEventName: Record<string, number>;
  surfaceViewCounts: Record<string, number>;
  routeBlockedCountsByReason: Record<string, number>;
  routeBlockedCountsBySource: Record<
    string,
    {
      total: number;
      byReason: Record<string, number>;
    }
  >;
  assessmentReturnedSummary: {
    total: number;
    safeToRouteTrue: number;
    safeToRouteFalse: number;
    riskBucketCounts: Record<string, number>;
    scoringMethodCounts: Record<string, number>;
  };
}

export function hasProductEventDatabase(): boolean {
  return Boolean(PRODUCT_EVENTS_DATABASE_URL);
}

function getPostgresPool(): Pool {
  if (!PRODUCT_EVENTS_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL (or AI_ORACLE_RELAY_DATABASE_URL) is required for product instrumentation storage."
    );
  }

  if (!postgresPool) {
    postgresPool = new Pool({ connectionString: PRODUCT_EVENTS_DATABASE_URL });
  }

  return postgresPool;
}

async function ensurePostgresSchema(): Promise<void> {
  if (!PRODUCT_EVENTS_DATABASE_URL) {
    return;
  }

  if (!postgresSchemaPromise) {
    const pool = getPostgresPool();

    postgresSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${PRODUCT_EVENTS_TABLE} (
          event_id TEXT PRIMARY KEY,
          event_name TEXT NOT NULL,
          surface TEXT NOT NULL,
          runtime_env TEXT NOT NULL,
          session_id TEXT NOT NULL,
          occurred_at TIMESTAMPTZ NOT NULL,
          metadata JSONB NOT NULL
        );
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${PRODUCT_EVENTS_OCCURRED_AT_INDEX}
        ON ${PRODUCT_EVENTS_TABLE} (occurred_at DESC);
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${PRODUCT_EVENTS_NAME_INDEX}
        ON ${PRODUCT_EVENTS_TABLE} (event_name, occurred_at DESC);
      `);
    })().catch((error) => {
      postgresSchemaPromise = null;
      throw error;
    });
  }

  await postgresSchemaPromise;
}

export async function recordProductEvent(
  event: StoredProductEvent
): Promise<void> {
  if (!PRODUCT_EVENTS_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL (or AI_ORACLE_RELAY_DATABASE_URL) is required for product instrumentation storage."
    );
  }

  await ensurePostgresSchema();

  await getPostgresPool().query(
    `
      INSERT INTO ${PRODUCT_EVENTS_TABLE} (
        event_id,
        event_name,
        surface,
        runtime_env,
        session_id,
        occurred_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      randomUUID(),
      event.eventName,
      event.surface,
      event.runtimeEnv,
      event.sessionId,
      event.occurredAt,
      JSON.stringify(event.metadata ?? {}),
    ]
  );
}

export async function getProductEventSummary(
  query: ProductEventSummaryQuery
): Promise<ProductEventSummary> {
  if (!PRODUCT_EVENTS_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL (or AI_ORACLE_RELAY_DATABASE_URL) is required for product instrumentation storage."
    );
  }

  await ensurePostgresSchema();

  const boundedWindowDays = Math.max(1, Math.min(query.windowDays, 30));
  const windowStart = new Date(
    Date.now() - boundedWindowDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const pool = getPostgresPool();

  const [
    overallResult,
    eventCountsResult,
    surfaceViewsResult,
    routeBlockedResult,
    assessmentSummaryResult,
  ] = await Promise.all([
    pool.query<{
      total_events: string;
      distinct_sessions: string;
      latest_event_at: string | null;
    }>(
      `
        SELECT
          COUNT(*)::text AS total_events,
          COUNT(DISTINCT session_id)::text AS distinct_sessions,
          MAX(occurred_at)::text AS latest_event_at
        FROM ${PRODUCT_EVENTS_TABLE}
        WHERE occurred_at >= $1::timestamptz
          AND runtime_env = $2
      `,
      [windowStart, AEGIS_RUNTIME_ENV]
    ),
    pool.query<{ event_name: string; total: string }>(
      `
        SELECT event_name, COUNT(*)::text AS total
        FROM ${PRODUCT_EVENTS_TABLE}
        WHERE occurred_at >= $1::timestamptz
          AND runtime_env = $2
        GROUP BY event_name
      `,
      [windowStart, AEGIS_RUNTIME_ENV]
    ),
    pool.query<{ surface: string; total: string }>(
      `
        SELECT surface, COUNT(*)::text AS total
        FROM ${PRODUCT_EVENTS_TABLE}
        WHERE occurred_at >= $1::timestamptz
          AND event_name = 'surface_viewed'
          AND runtime_env = $2
        GROUP BY surface
      `,
      [windowStart, AEGIS_RUNTIME_ENV]
    ),
    pool.query<{ route_source: string | null; block_reason: string | null; total: string }>(
      `
        SELECT
          metadata->>'routeSource' AS route_source,
          metadata->>'blockReason' AS block_reason,
          COUNT(*)::text AS total
        FROM ${PRODUCT_EVENTS_TABLE}
        WHERE occurred_at >= $1::timestamptz
          AND event_name = 'route_submission_blocked'
          AND runtime_env = $2
        GROUP BY route_source, block_reason
      `,
      [windowStart, AEGIS_RUNTIME_ENV]
    ),
    pool.query<{
      safe_to_route: string | null;
      risk_bucket: string | null;
      scoring_method: string | null;
      total: string;
    }>(
      `
        SELECT
          metadata->>'safeToRoute' AS safe_to_route,
          metadata->>'riskBucket' AS risk_bucket,
          metadata->>'scoringMethod' AS scoring_method,
          COUNT(*)::text AS total
        FROM ${PRODUCT_EVENTS_TABLE}
        WHERE occurred_at >= $1::timestamptz
          AND event_name = 'route_assessment_returned'
          AND runtime_env = $2
        GROUP BY safe_to_route, risk_bucket, scoring_method
      `,
      [windowStart, AEGIS_RUNTIME_ENV]
    ),
  ]);

  const countsByEventName = eventCountsResult.rows.reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.event_name] = Number(row.total);
      return counts;
    },
    {}
  );

  const surfaceViewCounts = surfaceViewsResult.rows.reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.surface] = Number(row.total);
      return counts;
    },
    {}
  );

  const routeBlockedCountsByReason: Record<string, number> = {};
  const routeBlockedCountsBySource: ProductEventSummary["routeBlockedCountsBySource"] =
    {};

  for (const row of routeBlockedResult.rows) {
    const routeSource = row.route_source ?? "unknown";
    const blockReason = row.block_reason ?? "unknown";
    const total = Number(row.total);

    routeBlockedCountsByReason[blockReason] =
      (routeBlockedCountsByReason[blockReason] ?? 0) + total;

    if (!routeBlockedCountsBySource[routeSource]) {
      routeBlockedCountsBySource[routeSource] = {
        total: 0,
        byReason: {},
      };
    }

    routeBlockedCountsBySource[routeSource].total += total;
    routeBlockedCountsBySource[routeSource].byReason[blockReason] =
      (routeBlockedCountsBySource[routeSource].byReason[blockReason] ?? 0) +
      total;
  }

  const assessmentReturnedSummary: ProductEventSummary["assessmentReturnedSummary"] = {
    total: 0,
    safeToRouteTrue: 0,
    safeToRouteFalse: 0,
    riskBucketCounts: {},
    scoringMethodCounts: {},
  };

  for (const row of assessmentSummaryResult.rows) {
    const total = Number(row.total);
    assessmentReturnedSummary.total += total;

    if (row.safe_to_route === "true") {
      assessmentReturnedSummary.safeToRouteTrue += total;
    } else if (row.safe_to_route === "false") {
      assessmentReturnedSummary.safeToRouteFalse += total;
    }

    if (row.risk_bucket) {
      assessmentReturnedSummary.riskBucketCounts[row.risk_bucket] =
        (assessmentReturnedSummary.riskBucketCounts[row.risk_bucket] ?? 0) +
        total;
    }

    if (row.scoring_method) {
      assessmentReturnedSummary.scoringMethodCounts[row.scoring_method] =
        (assessmentReturnedSummary.scoringMethodCounts[row.scoring_method] ?? 0) +
        total;
    }
  }

  const overallRow = overallResult.rows[0];

  return {
    windowDays: boundedWindowDays,
    windowStart,
    latestEventAt: overallRow?.latest_event_at ?? null,
    totalEvents: Number(overallRow?.total_events ?? 0),
    distinctSessions: Number(overallRow?.distinct_sessions ?? 0),
    countsByEventName,
    surfaceViewCounts,
    routeBlockedCountsByReason,
    routeBlockedCountsBySource,
    assessmentReturnedSummary,
  };
}
