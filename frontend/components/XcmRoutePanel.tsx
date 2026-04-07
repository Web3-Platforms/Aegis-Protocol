"use client";

import { useState, useCallback } from "react";
import { parseUnits } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { useVaultActivityData } from "@/lib/useVaultActivityData";
import { EXPERIMENTAL_ROUTING_ENABLED } from "@/lib/feature-flags";
import { buildRouteAuthorizationMessage } from "@/lib/relay-authorization";
import { getRouteRelayErrorDetails } from "@/lib/route-relay-response";
import { createClientRequestKey } from "@/lib/request-keys";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";
import { RouteRequestStatusPanel } from "@/components/RouteRequestStatusPanel";
import {
  type ProductEventBlockReason,
} from "@/lib/product-events";
import { trackProductEvent } from "@/lib/product-instrumentation";
import { useRecentRouteRequests } from "@/lib/useRecentRouteRequests";
import {
  getRouteRequestStatusLabel,
  getRouteRequestStatusSummary,
} from "@/lib/route-request-status";
import { useRouteSubmissionReadiness } from "@/lib/useRouteSubmissionReadiness";

interface RouteFormData {
  amount: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  requestId?: string;
  txHash?: string;
  status?: string;
}

interface ValidationError {
  message: string;
  blockReason: ProductEventBlockReason;
}

function truncateIdentifier(value: string, startLength = 12, endLength = 8): string {
  if (value.length <= startLength + endLength + 3) {
    return value;
  }

  return `${value.slice(0, startLength)}...${value.slice(-endLength)}`;
}

export function XcmRoutePanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const {
    stats,
    isLoading: isStatsLoading,
    errorMessage: statsErrorMessage,
  } = useVaultActivityData();

  const [formData, setFormData] = useState<RouteFormData>({
    amount: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAssetDetails, setShowAssetDetails] = useState(false);
  const {
    requests,
    errorMessage: routeRequestErrorMessage,
    isRefreshing: isRefreshingRouteRequests,
    rememberRequest,
    refresh,
    dismissRequest,
  } = useRecentRouteRequests(address);
  const {
    routeAsset,
    connectedChainId,
    isWrongNetwork,
    routeAssetBalanceDisplay,
    depositedBalanceRaw,
    hasDepositedRouteBalance,
    isPortfolioLoading,
    portfolioErrorMessage,
    refreshPortfolio,
    activeRequest,
    isActiveRequestStale,
    latestFailedRequest,
    latestFailedFailureCategory,
    latestFailedRetryDisposition,
  } = useRouteSubmissionReadiness(requests);

  const isConnectedToWrongNetwork = isConnected && isWrongNetwork;
  const canSubmitRoute =
    isConnected &&
    !isSubmitting &&
    !isConnectedToWrongNetwork &&
    !isPortfolioLoading &&
    !portfolioErrorMessage &&
    !activeRequest &&
    !latestFailedRequest &&
    hasDepositedRouteBalance;

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleInputChange = (field: keyof RouteFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const trackPanelRouteBlocked = (blockReason: ProductEventBlockReason) => {
    void trackProductEvent({
      eventName: "route_submission_blocked",
      surface: "vault",
      metadata: {
        routeSource: "panel",
        blockReason,
      },
    });
  };

  const validateForm = (): ValidationError | null => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      return {
        message: "Please enter a valid amount",
        blockReason: "invalid_amount",
      };
    }

    try {
      const requestedAmount = parseUnits(formData.amount, routeAsset.decimals);
      if (requestedAmount > depositedBalanceRaw) {
        return {
          message: `Enter an amount less than or equal to your deposited ${routeAsset.symbol} balance (${routeAssetBalanceDisplay} ${routeAsset.symbol}).`,
          blockReason: "insufficient_deposited_balance",
        };
      }
    } catch {
      return {
        message: "Please enter a valid amount",
        blockReason: "invalid_amount",
      };
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !address) {
      trackPanelRouteBlocked("wallet_disconnected");
      addToast({ type: "error", message: "Please connect your wallet first" });
      return;
    }

    if (isConnectedToWrongNetwork) {
      trackPanelRouteBlocked("wrong_network");
      addToast({
        type: "error",
        message: `Switch your wallet to ${AEGIS_RUNTIME.chainName} before submitting an experimental route.`,
      });
      return;
    }

    if (portfolioErrorMessage) {
      trackPanelRouteBlocked("portfolio_unavailable");
      addToast({
        type: "error",
        message: `Route eligibility is unavailable until the portfolio snapshot recovers: ${portfolioErrorMessage}`,
      });
      return;
    }

    if (isPortfolioLoading) {
      trackPanelRouteBlocked("portfolio_loading");
      addToast({
        type: "info",
        message: `Checking your deposited ${routeAsset.symbol} balance. Please wait a moment and try again.`,
      });
      return;
    }

    if (activeRequest) {
      trackPanelRouteBlocked("active_request");
      addToast({
        type: "info",
        message: `Recent route request ${truncateIdentifier(activeRequest.requestId)} is still ${getRouteRequestStatusLabel(activeRequest.status).toLowerCase()}. Refresh Recent Route Requests before submitting another route.`,
        requestId: activeRequest.requestId,
        status: activeRequest.status,
      });
      return;
    }

    if (!hasDepositedRouteBalance) {
      trackPanelRouteBlocked("no_deposited_route_balance");
      addToast({
        type: "error",
        message: `Deposit a non-zero ${routeAsset.symbol} balance into the beta vault before submitting an experimental route.`,
      });
      return;
    }

    if (latestFailedRequest) {
      trackPanelRouteBlocked("latest_failed_request");
      addToast({
        type: "info",
        message: `Review or dismiss failed request ${truncateIdentifier(latestFailedRequest.requestId)} before submitting another experimental route.`,
        requestId: latestFailedRequest.requestId,
        status: latestFailedRequest.status,
      });
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      trackPanelRouteBlocked(validationError.blockReason);
      addToast({ type: "error", message: validationError.message });
      return;
    }

    setIsSubmitting(true);

    try {
      const idempotencyKey = createClientRequestKey("panel-route");
      const amount = formData.amount.trim();
      const intent = `Evaluate experimental routing of ${amount} ${routeAsset.symbol} to Asset Hub`;
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildRouteAuthorizationMessage({
          userAddress: address,
          intent,
          amountRequested: amount,
          idempotencyKey,
          issuedAt,
        }),
      });

      const response = await fetch("/api/execute-route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          userAddress: address,
          intent,
          amount,
          authorization: {
            issuedAt,
            signature,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        rememberRequest(result, "panel");
        const details = getRouteRelayErrorDetails(result);
        addToast({
          type: "error",
          message: `Experimental route failed: ${details.message}`,
          requestId: details.requestId ?? undefined,
          status: details.status ?? undefined,
        });
        return;
      }

      rememberRequest(result, "panel");
      addToast({
        type: "success",
        message: "Experimental route relay accepted. Track lifecycle in Recent Route Requests.",
        requestId: result.requestId,
        txHash: result.txHash,
        status: result.status,
      });

      setFormData({
        amount: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      addToast({ type: "error", message: `Experimental route failed: ${message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  if (!EXPERIMENTAL_ROUTING_ENABLED) {
    return (
      <div className="aegis-panel p-6 md:p-8 space-y-4 border border-dashed">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Experimental Routing Workflow</h2>
          <p className="text-sm text-muted-foreground">
            Route submission is disabled in the default vault-only beta.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="text-sm font-semibold">Not part of the public beta launch surface</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Enable experimental routing only for operator-assisted pilot environments where the current source-chain execution path and route-event limitations are understood.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aegis-panel p-6 md:p-8 space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border/50">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Experimental Routing Workflow</h2>
          <p className="text-sm text-muted-foreground">
            Prototype environment form for evaluating route submissions; not a live launch feature.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-secondary/50 rounded-xl p-3">
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Route Event Amount
            </p>
            <p className="text-lg font-bold tabular-nums">
              {isStatsLoading ? (
                <span className="inline-block w-16 h-5 bg-muted animate-pulse rounded" />
              ) : statsErrorMessage ? (
                "Unavailable"
              ) : (
                `${formatNumber(stats.totalRouteEventAmount)} units`
              )}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {statsErrorMessage ? "Activity API unavailable" : "Event-derived beta display"}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
        <p className="text-sm font-semibold">Experimental testnet workflow</p>
        <p className="mt-1 text-xs leading-relaxed opacity-90">
          Current {AEGIS_RUNTIME.chainName} deployments can emit route-related events without dispatching a production-safe cross-chain message. The relay now builds the XCM payload server-side and keeps a request record for each submission.
        </p>
      </div>

      {statsErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
          <p className="text-sm font-semibold">Route event stats unavailable</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">{statsErrorMessage}</p>
        </div>
      ) : null}

      {!isConnected ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-slate-900 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-100">
          <p className="text-sm font-semibold">Connect wallet to review routes</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Aegis needs your wallet connection before it can load deposited balance
            eligibility and recent route-request state for this route form.
          </p>
        </div>
      ) : isConnectedToWrongNetwork ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="text-sm font-semibold">Wrong network for route review</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Connected wallet chain ID {connectedChainId ?? "unknown"} does not match{" "}
            {AEGIS_RUNTIME.chainName}. Switch networks before submitting an
            experimental route.
          </p>
        </div>
      ) : portfolioErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Route eligibility unavailable</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                The deposited-balance snapshot is unavailable, so route submission is
                paused until the portfolio API recovers.
              </p>
              <p className="mt-2 text-xs leading-relaxed opacity-90">
                {portfolioErrorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshPortfolio()}
              className="rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium transition hover:border-current/40"
            >
              Refresh balance
            </button>
          </div>
        </div>
      ) : isPortfolioLoading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-slate-900 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-100">
          <p className="text-sm font-semibold">Checking deposited balance</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Aegis is loading your deposited {routeAsset.symbol} balance before allowing
            a new experimental route submission.
          </p>
        </div>
      ) : activeRequest ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {isActiveRequestStale
                  ? "Existing route request needs review"
                  : "Existing route request still in progress"}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Request {truncateIdentifier(activeRequest.requestId)} is{" "}
                {getRouteRequestStatusLabel(activeRequest.status).toLowerCase()}.{" "}
                {getRouteRequestStatusSummary(activeRequest.status)}
              </p>
              <p className="mt-2 text-xs leading-relaxed opacity-90">
                {isActiveRequestStale
                  ? "This request has not updated for more than 10 minutes. Refresh the tracked request below and inspect the source-chain proof before trying again."
                  : "Refresh the tracked request below before sending another experimental route from this wallet."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className="rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium transition hover:border-current/40"
            >
              Refresh status
            </button>
          </div>
        </div>
      ) : !hasDepositedRouteBalance ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Deposit required before routing</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Experimental route submission is only available after this wallet has a
                non-zero deposited {routeAsset.symbol} balance in the beta vault.
              </p>
              <p className="mt-2 text-xs leading-relaxed opacity-90">
                Current deposited balance snapshot: {routeAssetBalanceDisplay}{" "}
                {routeAsset.symbol}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshPortfolio()}
              className="rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium transition hover:border-current/40"
            >
              Refresh balance
            </button>
          </div>
        </div>
      ) : latestFailedRequest ? (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Latest route request failed</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Request {truncateIdentifier(latestFailedRequest.requestId)} failed.
                Review the failure guidance below, then dismiss it to unlock another
                submission from this wallet.
              </p>
              <div className="mt-2 space-y-1 text-xs leading-relaxed opacity-90">
                {latestFailedRequest.error ? <p>{latestFailedRequest.error}</p> : null}
                {latestFailedFailureCategory ? (
                  <p>Category: {latestFailedFailureCategory}</p>
                ) : null}
                {latestFailedRetryDisposition ? (
                  <p>Retry: {latestFailedRetryDisposition}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissRequest(latestFailedRequest.requestId)}
              className="rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium transition hover:border-current/40"
            >
              Dismiss failed request
            </button>
          </div>
        </div>
      ) : null}

      {/* Route Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Destination
            </p>
            <p className="mt-1 font-semibold">Asset Hub</p>
            <p className="text-xs text-muted-foreground">Pinned by the server risk/route policy</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Asset
            </p>
            <p className="mt-1 font-semibold">{routeAsset.symbol}</p>
            <p className="text-xs text-muted-foreground">
              Manual ABI/address metadata: {routeAsset.decimals} decimals
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Submission mode
            </p>
            <p className="mt-1 font-semibold">Operator-signed relay</p>
            <p className="text-xs text-muted-foreground">Request ID + tx hash returned on submit</p>
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="amount" className="text-sm font-semibold text-foreground">
              Amount ({routeAsset.symbol})
            </label>
            <span className="text-xs text-muted-foreground">
              Deposited balance snapshot: {routeAssetBalanceDisplay} {routeAsset.symbol}
            </span>
          </div>
          <div className="relative">
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => handleInputChange("amount", e.target.value)}
              className="w-full h-12 px-4 pr-16 rounded-xl border border-input bg-background text-foreground font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {routeAsset.symbol}
              </span>
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAssetDetails(!showAssetDetails)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showAssetDetails ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Prototype Route Details
          </button>
          
          {showAssetDetails && (
            <div className="mt-4 p-4 bg-secondary/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Route payload owner</span>
                <span className="font-medium">Server-only relay</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Idempotency</span>
                <span className="font-medium">Header-backed request key</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tracked states</span>
                <span className="font-medium">requested → validated → submitted → source_confirmed / failed</span>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          data-testid="vault-route-submit"
          disabled={!canSubmitRoute}
          className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
               <span>Submitting...</span>
            </>
          ) : !isConnected ? (
            <span>Connect Wallet to Review Route</span>
          ) : isConnectedToWrongNetwork ? (
            <span>Switch to {AEGIS_RUNTIME.chainName}</span>
          ) : portfolioErrorMessage ? (
            <span>Route Eligibility Unavailable</span>
          ) : isPortfolioLoading ? (
            <span>Checking Deposited Balance...</span>
          ) : activeRequest ? (
            <span>
              Route {getRouteRequestStatusLabel(activeRequest.status)}
            </span>
          ) : latestFailedRequest ? (
            <span>Review Failed Request</span>
          ) : !hasDepositedRouteBalance ? (
            <span>Deposit {routeAsset.symbol} Before Routing</span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>Submit Experimental Route</span>
            </>
          )}
        </button>

        {!isConnected && (
          <p className="text-center text-sm text-muted-foreground">
            Connect your wallet to review experimental route submissions
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Beta note: a successful submission may record route-related events without proving live XCM delivery on {AEGIS_RUNTIME.chainName}.
        </p>
      </form>

      <RouteRequestStatusPanel
        requests={requests}
        errorMessage={routeRequestErrorMessage}
        isRefreshing={isRefreshingRouteRequests}
        onRefresh={() => {
          void refresh();
        }}
        onDismiss={dismissRequest}
        description="Recent experimental route requests submitted from the vault panel. Proof links only cover current source-chain submission."
      />

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl animate-in slide-in-from-right duration-300 ${
              toast.type === "success"
                ? "bg-green-500 text-white"
                : toast.type === "error"
                ? "bg-red-500 text-white"
                : "bg-blue-500 text-white"
            }`}
          >
            <div className="flex-1">
              <p className="font-medium text-sm">{toast.message}</p>
              {toast.requestId && (
                <p className="mt-1 text-xs opacity-90">Request: {toast.requestId}</p>
              )}
              {toast.status && (
                <p className="text-xs opacity-90">Status: {toast.status}</p>
              )}
              {toast.txHash && (
                <p className="text-xs opacity-90 break-all">Tx: {toast.txHash}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
