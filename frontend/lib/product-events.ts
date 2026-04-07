import {
  AEGIS_RUNTIME_ENV,
  type AegisRuntimeEnv,
} from "@/lib/runtime/environment";

export const PRODUCT_EVENT_NAMES = [
  "surface_viewed",
  "wallet_connected",
  "deposit_attempted",
  "deposit_blocked",
  "withdrawal_attempted",
  "withdrawal_blocked",
  "route_assessment_requested",
  "route_assessment_returned",
  "route_assessment_failed",
  "route_submission_blocked",
  "route_submission_cancelled",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_EVENT_SURFACES = [
  "dashboard",
  "vault",
  "chat",
  "activity",
  "global",
] as const;

export type ProductEventSurface = (typeof PRODUCT_EVENT_SURFACES)[number];

export const PRODUCT_EVENT_BLOCK_REASONS = [
  "wallet_disconnected",
  "missing_configuration",
  "invalid_amount",
  "insufficient_wallet_balance",
  "insufficient_deposited_balance",
  "wrong_network",
  "portfolio_unavailable",
  "portfolio_loading",
  "active_request",
  "latest_failed_request",
  "no_deposited_route_balance",
] as const;

export type ProductEventBlockReason =
  (typeof PRODUCT_EVENT_BLOCK_REASONS)[number];

export const PRODUCT_EVENT_ROUTE_SOURCES = ["chat", "panel"] as const;

export type ProductEventRouteSource =
  (typeof PRODUCT_EVENT_ROUTE_SOURCES)[number];

export const PRODUCT_EVENT_RISK_BUCKETS = [
  "0-24",
  "25-49",
  "50-74",
  "75+",
] as const;

export type ProductEventRiskBucket =
  (typeof PRODUCT_EVENT_RISK_BUCKETS)[number];

export interface ProductEventMetadata {
  tokenSymbol?: string;
  blockReason?: ProductEventBlockReason;
  routeSource?: ProductEventRouteSource;
  safeToRoute?: boolean;
  riskBucket?: ProductEventRiskBucket;
  scoringMethod?: string;
}

export interface ProductEventPayload {
  eventName: ProductEventName;
  surface: ProductEventSurface;
  sessionId: string;
  metadata?: ProductEventMetadata;
}

export interface StoredProductEvent extends ProductEventPayload {
  occurredAt: string;
  runtimeEnv: AegisRuntimeEnv;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnumValue<T extends readonly string[]>(
  values: T,
  value: unknown
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{16,128}$/i.test(value);
}

function isTokenSymbol(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,16}$/i.test(value);
}

function isScoringMethod(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{1,48}$/i.test(value);
}

export function getProductEventSurfaceFromPathname(
  pathname: string | null | undefined
): ProductEventSurface {
  switch (pathname) {
    case "/":
      return "dashboard";
    case "/vault":
      return "vault";
    case "/chat":
      return "chat";
    case "/activity":
      return "activity";
    default:
      return "global";
  }
}

export function getProductEventRiskBucket(score: number): ProductEventRiskBucket {
  if (score >= 75) {
    return "75+";
  }
  if (score >= 50) {
    return "50-74";
  }
  if (score >= 25) {
    return "25-49";
  }
  return "0-24";
}

function normalizeProductEventMetadata(
  value: unknown
): ProductEventMetadata | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    return null;
  }

  const metadata: ProductEventMetadata = {};

  if (value.tokenSymbol !== undefined) {
    if (!isTokenSymbol(value.tokenSymbol)) {
      return null;
    }
    metadata.tokenSymbol = value.tokenSymbol;
  }

  if (value.blockReason !== undefined) {
    if (!isEnumValue(PRODUCT_EVENT_BLOCK_REASONS, value.blockReason)) {
      return null;
    }
    metadata.blockReason = value.blockReason;
  }

  if (value.routeSource !== undefined) {
    if (!isEnumValue(PRODUCT_EVENT_ROUTE_SOURCES, value.routeSource)) {
      return null;
    }
    metadata.routeSource = value.routeSource;
  }

  if (value.safeToRoute !== undefined) {
    if (typeof value.safeToRoute !== "boolean") {
      return null;
    }
    metadata.safeToRoute = value.safeToRoute;
  }

  if (value.riskBucket !== undefined) {
    if (!isEnumValue(PRODUCT_EVENT_RISK_BUCKETS, value.riskBucket)) {
      return null;
    }
    metadata.riskBucket = value.riskBucket;
  }

  if (value.scoringMethod !== undefined) {
    if (!isScoringMethod(value.scoringMethod)) {
      return null;
    }
    metadata.scoringMethod = value.scoringMethod;
  }

  return metadata;
}

export function parseProductEventPayload(
  value: unknown
): ProductEventPayload | null {
  if (!isObject(value)) {
    return null;
  }

  if (!isEnumValue(PRODUCT_EVENT_NAMES, value.eventName)) {
    return null;
  }

  if (!isEnumValue(PRODUCT_EVENT_SURFACES, value.surface)) {
    return null;
  }

  if (!isSessionId(value.sessionId)) {
    return null;
  }

  const metadata = normalizeProductEventMetadata(value.metadata);
  if (metadata === null) {
    return null;
  }

  return {
    eventName: value.eventName,
    surface: value.surface,
    sessionId: value.sessionId,
    metadata,
  };
}

export function createStoredProductEvent(
  payload: ProductEventPayload
): StoredProductEvent {
  return {
    ...payload,
    occurredAt: new Date().toISOString(),
    runtimeEnv: AEGIS_RUNTIME_ENV,
  };
}
