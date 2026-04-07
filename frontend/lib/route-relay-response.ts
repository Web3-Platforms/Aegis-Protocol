"use client";

export interface RouteRelayErrorDetails {
  message: string;
  requestId: string | null;
  status: string | null;
  failureCategory: string | null;
  retryDisposition: string | null;
  operatorAction: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanizeLabel(value: string | null): string | null {
  return value ? value.replace(/_/g, " ") : null;
}

export function getRouteRelayErrorDetails(
  payload: unknown
): RouteRelayErrorDetails {
  const record = asRecord(payload);
  const error = asString(record?.error) ?? "Execute route failed";
  const detail = asString(record?.detail);
  const operatorAction = asString(record?.operatorAction);
  const requestId = asString(record?.requestId);
  const status = asString(record?.status);
  const failureCategory = humanizeLabel(asString(record?.failureCategory));
  const retryDisposition = humanizeLabel(asString(record?.retryDisposition));

  const messageParts = [error];

  if (detail && detail !== error) {
    messageParts.push(detail);
  }

  if (operatorAction) {
    messageParts.push(operatorAction);
  }

  return {
    message: messageParts.join(" "),
    requestId,
    status,
    failureCategory,
    retryDisposition,
    operatorAction,
  };
}
