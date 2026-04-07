"use client";

import {
  ROUTE_REQUEST_STATUSES,
  getRouteRequestStatusLabel,
  getRouteRequestStatusSummary,
  humanizeRouteRelayValue,
  type RecentRouteRequest,
  type RouteRequestStatus,
} from "@/lib/route-request-status";
import { getAegisExplorerTxUrl } from "@/lib/runtime/environment";

interface RouteRequestStatusPanelProps {
  requests: RecentRouteRequest[];
  errorMessage?: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onDismiss?: (requestId: string) => void;
  title?: string;
  description?: string;
}

function truncateIdentifier(
  value: string,
  startLength = 12,
  endLength = 10
): string {
  if (value.length <= startLength + endLength + 3) {
    return value;
  }

  return `${value.slice(0, startLength)}...${value.slice(-endLength)}`;
}

function formatTimestamp(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const parsedTimestamp = Date.parse(timestamp);
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  return new Date(parsedTimestamp).toLocaleString();
}

function getStatusBadgeClasses(status: RouteRequestStatus): string {
  switch (status) {
    case "source_confirmed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "submitted":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "validated":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-200";
    case "requested":
      return "border-white/15 bg-white/5 text-slate-200";
  }
}

export function RouteRequestStatusPanel({
  requests,
  errorMessage = null,
  isRefreshing = false,
  onRefresh,
  onDismiss,
  title = "Recent Route Requests",
  description = "Proof links and sanitized lifecycle updates for recent experimental route requests tracked in this browser.",
}: RouteRequestStatusPanelProps) {
  if (requests.length === 0 && !errorMessage) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">{description}</p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-4">
        {requests.map((request) => {
          const updatedAt = formatTimestamp(request.updatedAt ?? request.createdAt);
          const requestedAmount = request.amountRequested
            ? `${request.amountRequested} ${request.tokenSymbol ?? ""}`.trim()
            : null;
          const submittedAmount = request.amountSubmitted
            ? `${request.amountSubmitted} ${request.tokenSymbol ?? ""}`.trim()
            : null;
          const failureCategory = humanizeRouteRelayValue(request.failureCategory);
          const retryDisposition = humanizeRouteRelayValue(request.retryDisposition);

          return (
            <article
              key={request.requestId}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {truncateIdentifier(request.requestId)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClasses(request.status)}`}
                    >
                      {getRouteRequestStatusLabel(request.status)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-300">
                      {request.source === "chat" ? "Chat" : "Vault Panel"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">
                    {getRouteRequestStatusSummary(request.status)}
                  </p>
                  {updatedAt ? (
                    <p className="text-xs text-slate-400">Updated {updatedAt}</p>
                  ) : null}
                </div>

                {onDismiss ? (
                  <button
                    type="button"
                    onClick={() => onDismiss(request.requestId)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {ROUTE_REQUEST_STATUSES.map((statusStep) => {
                  const isCurrent = statusStep === request.status;
                  const isSuccessfulTerminal =
                    request.status === "source_confirmed" && statusStep === "source_confirmed";
                  const isFailureTerminal =
                    request.status === "failed" && statusStep === "failed";

                  return (
                    <span
                      key={`${request.requestId}-${statusStep}`}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        isSuccessfulTerminal
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : isFailureTerminal
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : isCurrent
                              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                              : "border-white/10 bg-white/5 text-slate-400"
                      }`}
                    >
                      {getRouteRequestStatusLabel(statusStep)}
                    </span>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Request ID</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-200">
                    {request.requestId}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Source-chain proof</p>
                  {request.txHash ? (
                    <div className="mt-1 space-y-1">
                      <a
                        href={getAegisExplorerTxUrl(request.txHash, request.runtimeEnv)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-cyan-300 transition hover:text-cyan-200"
                      >
                        Open source transaction
                      </a>
                      <p className="break-all font-mono text-xs text-slate-300">
                        {request.txHash}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-400">
                      No source-chain transaction hash has been published yet.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Requested amount</p>
                  <p className="mt-1 text-slate-200">{requestedAmount ?? "Not captured"}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Submitted amount</p>
                  <p className="mt-1 text-slate-200">
                    {submittedAmount ?? "Not submitted onchain yet"}
                  </p>
                </div>
              </div>

              {request.note ? (
                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50">
                  {request.note}
                </div>
              ) : null}

              {request.warnings.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                  <p className="font-semibold text-amber-100">Warnings</p>
                  <ul className="mt-2 space-y-1">
                    {request.warnings.map((warning) => (
                      <li key={`${request.requestId}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {request.error || failureCategory || retryDisposition ? (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-50">
                  <p className="font-semibold text-red-100">Failure guidance</p>
                  <div className="mt-2 space-y-1">
                    {request.error ? <p>{request.error}</p> : null}
                    {failureCategory ? <p>Category: {failureCategory}</p> : null}
                    {retryDisposition ? <p>Retry: {retryDisposition}</p> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
