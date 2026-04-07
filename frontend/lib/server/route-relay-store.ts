import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { RouteRelayRecord } from "@/lib/server/route-relay";

interface RouteRelayFileStore {
  requestsById: Record<string, RouteRelayRecord>;
  requestIdsByIdempotencyKey: Record<string, string>;
}

export type RouteRelayStoreBackend = "file" | "postgres";

type RouteRelayClaimResult = {
  record: RouteRelayRecord;
  inserted: boolean;
  duplicateReason: "idempotency" | "digest" | null;
};

interface RouteRelayMonitoringQuery {
  recentWindowMinutes: number;
  staleSubmittedMinutes: number;
  limit?: number;
}

const RELAY_STORE_PATH =
  process.env.AI_ORACLE_RELAY_STORE_PATH ??
  path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".aegis-relay",
    "requests.json"
  );

const RELAY_DATABASE_URL =
  process.env.AI_ORACLE_RELAY_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  null;

const ROUTE_RELAY_REQUESTS_TABLE = "ai_oracle_relay_requests";
const ROUTE_RELAY_DIGEST_INDEX =
  "ai_oracle_relay_requests_request_digest_updated_at_idx";

let fileStoreLock: Promise<void> = Promise.resolve();
let postgresPool: Pool | null = null;
let postgresSchemaPromise: Promise<void> | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRouteRelayRecord(value: unknown): value is RouteRelayRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.requestId === "string" &&
    typeof value.requestDigest === "string" &&
    typeof value.idempotencyKey === "string" &&
    typeof value.responseStatusCode === "number" &&
    typeof value.status === "string" &&
    typeof value.userAddress === "string" &&
    typeof value.intent === "string" &&
    Array.isArray(value.warnings) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function createEmptyStore(): RouteRelayFileStore {
  return {
    requestsById: {},
    requestIdsByIdempotencyKey: {},
  };
}

function parseStoredRecord(value: unknown): RouteRelayRecord | null {
  if (!isRouteRelayRecord(value)) {
    return null;
  }

  return value;
}

function getRouteRelayStoreBackendInternal(): RouteRelayStoreBackend {
  return RELAY_DATABASE_URL ? "postgres" : "file";
}

function getPostgresPool(): Pool {
  if (!RELAY_DATABASE_URL) {
    throw new Error(
      "AI_ORACLE_RELAY_DATABASE_URL (or DATABASE_URL) is required for postgres-backed relay storage."
    );
  }

  if (!postgresPool) {
    postgresPool = new Pool({ connectionString: RELAY_DATABASE_URL });
  }

  return postgresPool;
}

async function ensurePostgresSchema(): Promise<void> {
  if (getRouteRelayStoreBackendInternal() !== "postgres") {
    return;
  }

  if (!postgresSchemaPromise) {
    const pool = getPostgresPool();

    postgresSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${ROUTE_RELAY_REQUESTS_TABLE} (
          request_id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          request_digest TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          record JSONB NOT NULL
        );
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${ROUTE_RELAY_DIGEST_INDEX}
        ON ${ROUTE_RELAY_REQUESTS_TABLE} (request_digest, updated_at DESC);
      `);
    })().catch((error) => {
      postgresSchemaPromise = null;
      throw error;
    });
  }

  await postgresSchemaPromise;
}

async function withFileStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const previousLock = fileStoreLock;
  let releaseLock = () => {};

  fileStoreLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;

  try {
    return await operation();
  } finally {
    releaseLock();
  }
}

async function ensureStoreFile(): Promise<void> {
  const directory = path.dirname(RELAY_STORE_PATH);
  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.access(RELAY_STORE_PATH);
  } catch {
    await writeStoreDirect(createEmptyStore());
  }
}

async function readStoreDirect(): Promise<RouteRelayFileStore> {
  await ensureStoreFile();

  const rawStore = await fs.readFile(RELAY_STORE_PATH, "utf8");
  if (!rawStore.trim()) {
    return createEmptyStore();
  }

  const parsedStore = JSON.parse(rawStore) as Partial<RouteRelayFileStore>;
  if (
    !isObject(parsedStore.requestsById) ||
    !isObject(parsedStore.requestIdsByIdempotencyKey)
  ) {
    return createEmptyStore();
  }

  return {
    requestsById: parsedStore.requestsById as Record<string, RouteRelayRecord>,
    requestIdsByIdempotencyKey:
      parsedStore.requestIdsByIdempotencyKey as Record<string, string>,
  };
}

async function writeStoreDirect(store: RouteRelayFileStore): Promise<void> {
  const tempPath = `${RELAY_STORE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
  await fs.rename(tempPath, RELAY_STORE_PATH);
}

export function getRouteRelayStoreBackend(): RouteRelayStoreBackend {
  return getRouteRelayStoreBackendInternal();
}

export async function getRouteRelayStoredRecordByIdempotencyKey(
  idempotencyKey: string
): Promise<RouteRelayRecord | null> {
  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const result = await getPostgresPool().query<{ record: unknown }>(
      `SELECT record FROM ${ROUTE_RELAY_REQUESTS_TABLE} WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );

    return parseStoredRecord(result.rows[0]?.record);
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();
    const requestId = store.requestIdsByIdempotencyKey[idempotencyKey];
    return requestId ? store.requestsById[requestId] ?? null : null;
  });
}

export async function getRouteRelayStoredRecordByRequestId(
  requestId: string
): Promise<RouteRelayRecord | null> {
  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const result = await getPostgresPool().query<{ record: unknown }>(
      `SELECT record FROM ${ROUTE_RELAY_REQUESTS_TABLE} WHERE request_id = $1 LIMIT 1`,
      [requestId]
    );

    return parseStoredRecord(result.rows[0]?.record);
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();
    return store.requestsById[requestId] ?? null;
  });
}

export async function listRouteRelayStoredRecordsByUserAddress(
  userAddress: string,
  limit: number
): Promise<RouteRelayRecord[]> {
  const normalizedUserAddress = userAddress.toLowerCase();
  const boundedLimit = Math.max(1, Math.min(limit, 50));

  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const result = await getPostgresPool().query<{ record: unknown }>(
      `
        SELECT record
        FROM ${ROUTE_RELAY_REQUESTS_TABLE}
        WHERE lower(record->>'userAddress') = $1
        ORDER BY updated_at DESC
        LIMIT $2
      `,
      [normalizedUserAddress, boundedLimit]
    );

    return result.rows
      .map((row) => parseStoredRecord(row.record))
      .filter((record): record is RouteRelayRecord => record !== null);
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();

    return Object.values(store.requestsById)
      .filter(
        (record) => record.userAddress.toLowerCase() === normalizedUserAddress
      )
      .sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
      .slice(0, boundedLimit);
  });
}

export async function getRouteRelayRecentRecordByDigest(
  requestDigest: string,
  dedupeWindowMs: number
): Promise<RouteRelayRecord | null> {
  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const createdAfter = new Date(Date.now() - dedupeWindowMs).toISOString();
    const result = await getPostgresPool().query<{ record: unknown }>(
      `
        SELECT record
        FROM ${ROUTE_RELAY_REQUESTS_TABLE}
        WHERE request_digest = $1
          AND status != 'failed'
          AND created_at >= $2::timestamptz
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [requestDigest, createdAfter]
    );

    return parseStoredRecord(result.rows[0]?.record);
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();

    const newestMatchingRecord = Object.values(store.requestsById)
      .filter((record) => {
        if (record.requestDigest !== requestDigest || record.status === "failed") {
          return false;
        }

        const createdAtMs = Date.parse(record.createdAt);
        return (
          Number.isFinite(createdAtMs) &&
          Date.now() - createdAtMs <= dedupeWindowMs
        );
      })
      .sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )[0];

    return newestMatchingRecord ?? null;
  });
}

export async function listRouteRelayStoredRecordsForMonitoring(
  query: RouteRelayMonitoringQuery
): Promise<RouteRelayRecord[]> {
  const boundedLimit = Math.max(10, Math.min(query.limit ?? 200, 2000));
  const recentWindowStartIso = new Date(
    Date.now() - query.recentWindowMinutes * 60_000
  ).toISOString();
  const staleSubmittedBeforeIso = new Date(
    Date.now() - query.staleSubmittedMinutes * 60_000
  ).toISOString();
  const recentWindowStartMs = Date.parse(recentWindowStartIso);
  const staleSubmittedBeforeMs = Date.parse(staleSubmittedBeforeIso);

  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const result = await getPostgresPool().query<{ record: unknown }>(
      `
        SELECT record
        FROM ${ROUTE_RELAY_REQUESTS_TABLE}
        WHERE updated_at >= $1::timestamptz
          OR (status = 'submitted' AND created_at <= $2::timestamptz)
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [recentWindowStartIso, staleSubmittedBeforeIso, boundedLimit]
    );

    return result.rows
      .map((row) => parseStoredRecord(row.record))
      .filter((record): record is RouteRelayRecord => record !== null);
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();

    return Object.values(store.requestsById)
      .filter((record) => {
        const updatedAtMs = Date.parse(record.updatedAt);
        const createdAtMs = Date.parse(record.createdAt);
        const updatedRecently =
          Number.isFinite(updatedAtMs) && updatedAtMs >= recentWindowStartMs;
        const staleSubmitted =
          record.status === "submitted" &&
          Number.isFinite(createdAtMs) &&
          createdAtMs <= staleSubmittedBeforeMs;

        return updatedRecently || staleSubmitted;
      })
      .sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
      .slice(0, boundedLimit);
  });
}

export async function claimRouteRelayRequestedRecord(
  record: RouteRelayRecord
  ,
  dedupeWindowMs: number
): Promise<RouteRelayClaimResult> {
  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    const client = await getPostgresPool().connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        record.requestDigest,
      ]);

      const existingIdempotencyResult = await client.query<{ record: unknown }>(
        `SELECT record FROM ${ROUTE_RELAY_REQUESTS_TABLE} WHERE idempotency_key = $1 LIMIT 1`,
        [record.idempotencyKey]
      );

      const existingIdempotencyRecord = parseStoredRecord(
        existingIdempotencyResult.rows[0]?.record
      );
      if (existingIdempotencyRecord) {
        await client.query("COMMIT");
        return {
          record: existingIdempotencyRecord,
          inserted: false,
          duplicateReason: "idempotency",
        };
      }

      const createdAfter = new Date(Date.now() - dedupeWindowMs).toISOString();
      const recentDigestResult = await client.query<{ record: unknown }>(
        `
          SELECT record
          FROM ${ROUTE_RELAY_REQUESTS_TABLE}
          WHERE request_digest = $1
            AND status != 'failed'
            AND created_at >= $2::timestamptz
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [record.requestDigest, createdAfter]
      );

      const recentDigestRecord = parseStoredRecord(
        recentDigestResult.rows[0]?.record
      );
      if (recentDigestRecord) {
        await client.query("COMMIT");
        return {
          record: recentDigestRecord,
          inserted: false,
          duplicateReason: "digest",
        };
      }

      const insertedResult = await client.query<{ record: unknown }>(
        `
          INSERT INTO ${ROUTE_RELAY_REQUESTS_TABLE} (
            request_id,
            idempotency_key,
            request_digest,
            status,
            created_at,
            updated_at,
            record
          )
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::jsonb)
          RETURNING record
        `,
        [
          record.requestId,
          record.idempotencyKey,
          record.requestDigest,
          record.status,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ]
      );

      await client.query("COMMIT");

      return {
        record: parseStoredRecord(insertedResult.rows[0]?.record) ?? record,
        inserted: true,
        duplicateReason: null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();
    const existingRequestId = store.requestIdsByIdempotencyKey[record.idempotencyKey];
    if (existingRequestId) {
      const existingRecord = store.requestsById[existingRequestId];
      if (!existingRecord) {
        throw new Error(
          "Relay store is corrupted: idempotency key points to a missing request."
        );
      }

      return {
        record: existingRecord,
        inserted: false,
        duplicateReason: "idempotency",
      };
    }

    const recentMatchingRecord = Object.values(store.requestsById)
      .filter((storedRecord) => {
        if (
          storedRecord.requestDigest !== record.requestDigest ||
          storedRecord.status === "failed"
        ) {
          return false;
        }

        const createdAtMs = Date.parse(storedRecord.createdAt);
        return (
          Number.isFinite(createdAtMs) &&
          Date.now() - createdAtMs <= dedupeWindowMs
        );
      })
      .sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )[0];

    if (recentMatchingRecord) {
      return {
        record: recentMatchingRecord,
        inserted: false,
        duplicateReason: "digest",
      };
    }

    store.requestsById[record.requestId] = record;
    store.requestIdsByIdempotencyKey[record.idempotencyKey] = record.requestId;
    await writeStoreDirect(store);

    return {
      record,
      inserted: true,
      duplicateReason: null,
    };
  });
}

export async function persistRouteRelayRecord(
  record: RouteRelayRecord
): Promise<RouteRelayRecord> {
  if (getRouteRelayStoreBackendInternal() === "postgres") {
    await ensurePostgresSchema();

    await getPostgresPool().query(
      `
        INSERT INTO ${ROUTE_RELAY_REQUESTS_TABLE} (
          request_id,
          idempotency_key,
          request_digest,
          status,
          created_at,
          updated_at,
          record
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::jsonb)
        ON CONFLICT (request_id) DO UPDATE SET
          idempotency_key = EXCLUDED.idempotency_key,
          request_digest = EXCLUDED.request_digest,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        record.requestId,
        record.idempotencyKey,
        record.requestDigest,
        record.status,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ]
    );

    return record;
  }

  return withFileStoreLock(async () => {
    const store = await readStoreDirect();
    store.requestsById[record.requestId] = record;
    store.requestIdsByIdempotencyKey[record.idempotencyKey] = record.requestId;
    await writeStoreDirect(store);
    return record;
  });
}
