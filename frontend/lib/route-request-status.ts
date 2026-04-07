"use client";

import type { AegisRuntimeEnv } from "@/lib/runtime/environment";

export const ROUTE_REQUEST_STATUSES = [
  "requested",
  "validated",
  "submitted",
  "source_confirmed",
  "failed",
] as const;

export type RouteRequestStatus = (typeof ROUTE_REQUEST_STATUSES)[number];

export type RouteRequestSource = "chat" | "panel";

export interface PublicRouteRequestStatus {
  requestId: string;
  status: RouteRequestStatus;
  txHash: string | null;
  tokenSymbol: string | null;
  amountRequested: string | null;
  amountSubmitted: string | null;
  failureCategory: string | null;
  retryDisposition: string | null;
  warnings: string[];
  error: string | null;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  statusUrl: string;
}

export interface RecentRouteRequest extends PublicRouteRequestStatus {
  source: RouteRequestSource;
  runtimeEnv: AegisRuntimeEnv;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  );
}

function asRouteRequestStatus(value: unknown): RouteRequestStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  return ROUTE_REQUEST_STATUSES.includes(value as RouteRequestStatus)
    ? (value as RouteRequestStatus)
    : null;
}

export function buildRouteRequestStatusUrl(
  requestId: string,
  userAddress?: string | null
): string {
  const searchParams = new URLSearchParams({
    requestId,
  });

  const normalizedUserAddress = userAddress?.trim().toLowerCase();
  if (normalizedUserAddress) {
    searchParams.set("userAddress", normalizedUserAddress);
  }

  return `/api/execute-route?${searchParams.toString()}`;
}

export function parsePublicRouteRequestStatus(
  payload: unknown,
  userAddress?: string | null
): PublicRouteRequestStatus | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const requestId = asString(record.requestId);
  const status = asRouteRequestStatus(record.status);

  if (!requestId || !status) {
    return null;
  }

  return {
    requestId,
    status,
    txHash: asString(record.txHash),
    tokenSymbol: asString(record.tokenSymbol),
    amountRequested: asString(record.amountRequested),
    amountSubmitted: asString(record.amountSubmitted),
    failureCategory: asString(record.failureCategory),
    retryDisposition: asString(record.retryDisposition),
    warnings: asStringArray(record.warnings),
    error: asString(record.error),
    note: asString(record.note),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    statusUrl: buildRouteRequestStatusUrl(requestId, userAddress),
  };
}

export function isTerminalRouteRequestStatus(status: RouteRequestStatus): boolean {
  return status === "source_confirmed" || status === "failed";
}

export function getRouteRequestStatusLabel(status: RouteRequestStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "validated":
      return "Validated";
    case "submitted":
      return "Submitted";
    case "source_confirmed":
      return "Source Confirmed";
    case "failed":
      return "Failed";
  }
}

export function getRouteRequestStatusSummary(status: RouteRequestStatus): string {
  switch (status) {
    case "requested":
      return "Awaiting operator validation and route preparation.";
    case "validated":
      return "Validated and ready for relay submission.";
    case "submitted":
      return "Submitted to the source chain. Waiting for onchain confirmation.";
    case "source_confirmed":
      return "Confirmed on the source chain. Use the proof link for evidence.";
    case "failed":
      return "Execution stopped. Review the sanitized failure guidance below.";
  }
}

export function humanizeRouteRelayValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
