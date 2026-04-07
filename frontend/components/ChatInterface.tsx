"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { EXPERIMENTAL_ROUTING_ENABLED } from "@/lib/feature-flags";
import { buildRouteAuthorizationMessage } from "@/lib/relay-authorization";
import { createClientRequestKey } from "@/lib/request-keys";
import { getRouteRelayErrorDetails } from "@/lib/route-relay-response";
import { useHydrated } from "@/lib/use-hydrated";
import { SUPPORTED_TOKENS } from "@/lib/contracts";
import {
  getProductEventRiskBucket,
  type ProductEventBlockReason,
} from "@/lib/product-events";
import { trackProductEvent } from "@/lib/product-instrumentation";
import { RouteRequestStatusPanel } from "@/components/RouteRequestStatusPanel";
import { useRecentRouteRequests } from "@/lib/useRecentRouteRequests";
import {
  getRouteRequestStatusLabel,
  getRouteRequestStatusSummary,
} from "@/lib/route-request-status";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";
import { useRouteSubmissionReadiness } from "@/lib/useRouteSubmissionReadiness";

interface Message {
  id: string;
  type: "user" | "ai" | "system";
  content: string;
  timestamp: Date;
  data?: {
    parachainId?: number;
    riskScore?: number;
    safeToRoute?: boolean;
    scoringMethod?: string;
    intent?: string;
  };
}

interface RiskOracleResponse {
  parachainId: number;
  riskScore: number;
  safeToRoute: boolean;
  scoringMethod?: string;
}

function createWelcomeMessage(): Message {
  return {
    id: "welcome",
    type: "ai",
    content:
      EXPERIMENTAL_ROUTING_ENABLED
        ? `Hello. I am Aegis, your beta routing assistant. Describe what you want to do with ${routeAssetSymbol} and I will return a prototype risk assessment for the current evaluation workflow.`
        : `Hello. I am Aegis, your beta routing assistant. Describe what you want to do with ${routeAssetSymbol} and I will return a prototype risk assessment for the current vault-only beta.`,
    timestamp: new Date(),
  };
}

function formatScoringMethod(value?: string): string {
  if (!value) {
    return "Not Reported";
  }

  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const routeAssetSymbol =
  SUPPORTED_TOKENS.find((token) => token.symbol === "USDC")?.symbol ??
  SUPPORTED_TOKENS[0]?.symbol ??
  "the configured route asset";

function truncateIdentifier(value: string, startLength = 12, endLength = 8): string {
  if (value.length <= startLength + endLength + 3) {
    return value;
  }

  return `${value.slice(0, startLength)}...${value.slice(-endLength)}`;
}

export function ChatInterface() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const hasMounted = useHydrated();
  const [messages, setMessages] = useState<Message[]>([createWelcomeMessage()]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingRoute, setIsExecutingRoute] = useState(false);
  const [dismissedConfirmations, setDismissedConfirmations] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    requests: recentRouteRequests,
    errorMessage: routeRequestErrorMessage,
    isRefreshing: isRefreshingRouteRequests,
    rememberRequest,
    refresh,
    dismissRequest,
  } = useRecentRouteRequests(address);
  const {
    connectedChainId,
    isWrongNetwork,
    routeAssetBalanceDisplay,
    hasDepositedRouteBalance,
    isPortfolioLoading,
    portfolioErrorMessage,
    refreshPortfolio,
    activeRequest,
    isActiveRequestStale,
    latestFailedRequest,
    latestFailedFailureCategory,
    latestFailedRetryDisposition,
  } = useRouteSubmissionReadiness(recentRouteRequests);
  const isConnectedToWrongNetwork = isConnected && isWrongNetwork;
  const canSubmitExperimentalRoute =
    isConnected &&
    !isExecutingRoute &&
    !isConnectedToWrongNetwork &&
    !isPortfolioLoading &&
    !portfolioErrorMessage &&
    !activeRequest &&
    !latestFailedRequest &&
    hasDepositedRouteBalance;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recentRouteRequests.length]);

  const handleConnectWallet = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
  };

  const handleClearChat = () => {
    setMessages([createWelcomeMessage()]);
    setInputValue("");
    setDismissedConfirmations([]);
  };

  const callRiskOracle = async (intent: string): Promise<RiskOracleResponse> => {
    const response = await fetch("/api/risk-oracle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ intent }),
    });

    if (!response.ok) {
      throw new Error("Failed to get risk assessment");
    }

    return response.json();
  };

  const getParachainName = (parachainId: number): string => {
    const parachains: Record<number, string> = {
      1000: "Paseo Asset Hub",
      2000: "Acala",
      2001: "Astar",
      2004: "Moonbeam",
      2012: "Parallel",
      2085: "Heiko",
      2087: "Picasso",
      2092: "Bifrost",
      2101: "Composable Finance",
    };
    return parachains[parachainId] || `Parachain ${parachainId}`;
  };

  const trackChatRouteBlocked = (blockReason: ProductEventBlockReason) => {
    void trackProductEvent({
      eventName: "route_submission_blocked",
      surface: "chat",
      metadata: {
        routeSource: "chat",
        blockReason,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      void trackProductEvent({
        eventName: "route_assessment_requested",
        surface: "chat",
      });

      const riskData = await callRiskOracle(userMessage.content);

      void trackProductEvent({
        eventName: "route_assessment_returned",
        surface: "chat",
        metadata: {
          safeToRoute: riskData.safeToRoute,
          riskBucket: getProductEventRiskBucket(riskData.riskScore),
          scoringMethod:
            riskData.scoringMethod?.trim().toLowerCase().replace(/\s+/g, "_") ??
            "not_reported",
        },
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          "Intent assessed for the current beta route policy.\n\n" +
          `• Policy target: **${getParachainName(riskData.parachainId)}**\n` +
          `• Risk Score: **${riskData.riskScore}/100**\n` +
          `• Status: **${riskData.safeToRoute ? "Below prototype risk gate" : "Blocked by prototype risk gate"}**\n` +
          `• Scoring: **${formatScoringMethod(riskData.scoringMethod)}**`,
        timestamp: new Date(),
        data: riskData,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (riskData.safeToRoute) {
        const transactionMessage: Message = {
          id: (Date.now() + 2).toString(),
          type: "system",
          content: EXPERIMENTAL_ROUTING_ENABLED
            ? "This intent passed the current prototype risk gate. You can review an experimental route submission, but this is not a live launch feature or proof of production-safe XCM execution."
            : "This intent passed the current prototype risk gate. Experimental route submission is disabled in the default vault-only beta and is only enabled in explicit pilot environments.",
          timestamp: new Date(),
          data: EXPERIMENTAL_ROUTING_ENABLED
            ? { ...riskData, intent: userMessage.content }
            : undefined,
        };
        setMessages((prev) => [...prev, transactionMessage]);
      }
    } catch {
      void trackProductEvent({
        eventName: "route_assessment_failed",
        surface: "chat",
      });

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: "I could not analyze that request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTransaction = async (message: Message) => {
    if (!message.data || !isConnected || !address) return;

    if (isConnectedToWrongNetwork) {
      trackChatRouteBlocked("wrong_network");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-wrong-network`,
          type: "ai",
          content: `Experimental route submission is blocked until your wallet is switched to ${AEGIS_RUNTIME.chainName}. Connected chain ID: ${connectedChainId ?? "unknown"}.`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (portfolioErrorMessage) {
      trackChatRouteBlocked("portfolio_unavailable");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-portfolio-unavailable`,
          type: "ai",
          content: `Experimental route submission is paused because the deposited-balance snapshot is unavailable: ${portfolioErrorMessage}`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (isPortfolioLoading) {
      trackChatRouteBlocked("portfolio_loading");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-portfolio-loading`,
          type: "ai",
          content: `Aegis is still checking your deposited ${routeAssetSymbol} balance. Wait for the balance snapshot to load, then try again.`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (activeRequest) {
      trackChatRouteBlocked("active_request");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-active-request`,
          type: "ai",
          content: `Request ${activeRequest.requestId} is still ${getRouteRequestStatusLabel(activeRequest.status).toLowerCase()}. Refresh Recent Route Requests before sending another experimental route.`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (!hasDepositedRouteBalance) {
      trackChatRouteBlocked("no_deposited_route_balance");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-no-deposit`,
          type: "ai",
          content: `Experimental route submission requires a non-zero deposited ${routeAssetSymbol} balance in the beta vault. Current deposited balance snapshot: ${routeAssetBalanceDisplay} ${routeAssetSymbol}.`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (latestFailedRequest) {
      trackChatRouteBlocked("latest_failed_request");
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-failed-request`,
          type: "ai",
          content: `Review or dismiss failed request ${latestFailedRequest.requestId} before sending another experimental route from this wallet.`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    setIsExecutingRoute(true);

    try {
      const routeIntent = message.data.intent?.trim();
      if (!routeIntent) {
        throw new Error("Missing original route intent for authorization.");
      }

      const idempotencyKey = createClientRequestKey("chat-route");
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildRouteAuthorizationMessage({
          userAddress: address,
          intent: routeIntent,
          amountRequested: null,
          idempotencyKey,
          issuedAt,
        }),
      });

      const resp = await fetch("/api/execute-route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          userAddress: address,
          intent: routeIntent,
          authorization: {
            issuedAt,
            signature,
          },
        }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        rememberRequest(json, "chat");
        const details = getRouteRelayErrorDetails(json);
        const lines = [details.message];

        if (details.failureCategory) {
          lines.push(`Failure category: ${details.failureCategory}`);
        }

        if (details.retryDisposition) {
          lines.push(`Retry guidance: ${details.retryDisposition}`);
        }

        if (details.requestId) {
          lines.push(`Request: ${details.requestId}`);
        }

        throw new Error(lines.join("\n"));
      }

      rememberRequest(json, "chat");
      setDismissedConfirmations((prev) => [...prev, message.id]);
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-submitted`,
          type: "ai",
          content:
            "Experimental route relay accepted for evaluation.\n" +
            `Request: ${json.requestId}\n` +
            `Status: ${json.status}\n` +
            `Tx: ${json.txHash ?? "pending"}\n` +
            "Track lifecycle updates and source-chain proof in Recent Route Requests below.",
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? ` ${error.message}`
          : ` Ensure the relay signer is configured and that you have a non-zero deposited ${routeAssetSymbol} balance.`;
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-error`,
          type: "ai",
          content:
            "Experimental route submission could not be performed in this environment. " +
            detail,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsExecutingRoute(false);
    }
  };

  const handleCancelTransaction = (message: Message) => {
    void trackProductEvent({
      eventName: "route_submission_cancelled",
      surface: "chat",
      metadata: {
        routeSource: "chat",
      },
    });

    setDismissedConfirmations((prev) => [...prev, message.id]);
    setMessages((prev) => [
      ...prev,
      {
        id: `${message.id}-cancelled`,
        type: "ai",
        content: "Transaction cancelled. No transaction was sent.",
        timestamp: new Date(),
      },
    ]);
  };

  if (!hasMounted) {
    return (
      <div className="aegis-panel p-12 text-center flex flex-col items-center justify-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-4xl animate-pulse">
          🤖
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Loading Beta Session</h2>
          <p className="text-muted-foreground max-w-sm">
            Preparing wallet-aware beta controls for this session.
          </p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="aegis-panel p-12 text-center flex flex-col items-center justify-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-4xl animate-pulse">
          🤖
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Beta Assistant Offline</h2>
          <p className="text-muted-foreground max-w-sm">Connect your wallet to review intents and experimental route submissions in the Aegis beta environment.</p>
        </div>
        <button
          type="button"
          onClick={handleConnectWallet}
          className="aegis-button aegis-button-primary px-8"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <section className="aegis-panel h-[600px] flex flex-col overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between bg-secondary/20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            AE
          </div>
          <div>
            <h2 className="text-sm font-bold">Aegis Assistant</h2>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Beta Session</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Clear Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-background to-secondary/10">
        {messages.map((message) => {
          const isUser = message.type === "user";
          const isSystem = message.type === "system";

          return (
            <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] space-y-2 ${isUser ? "flex flex-col items-end" : "flex flex-col items-start"}`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground shadow-md rounded-tr-none"
                      : isSystem
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 rounded-tl-none"
                      : "bg-white dark:bg-zinc-900 border shadow-sm rounded-tl-none"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>

                  {message.data &&
                    message.type === "system" &&
                    !dismissedConfirmations.includes(message.id) && (
                      <div className="mt-4 space-y-3">
                        {isConnectedToWrongNetwork ? (
                          <div className="rounded-xl border border-amber-300/40 bg-amber-100/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
                            <p className="font-semibold">Wrong network for route submission</p>
                            <p className="mt-1 leading-relaxed opacity-90">
                              Connected chain ID {connectedChainId ?? "unknown"} does not match{" "}
                              {AEGIS_RUNTIME.chainName}. Switch networks before submitting.
                            </p>
                          </div>
                        ) : portfolioErrorMessage ? (
                          <div className="rounded-xl border border-red-300/40 bg-red-100/70 px-3 py-2 text-xs text-red-950 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-100">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">Route eligibility unavailable</p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  The deposited-balance snapshot failed, so route submission is paused.
                                </p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  {portfolioErrorMessage}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => refreshPortfolio()}
                                className="rounded-full border border-current/20 px-3 py-1 text-[11px] font-medium transition hover:border-current/40"
                              >
                                Refresh balance
                              </button>
                            </div>
                          </div>
                        ) : isPortfolioLoading ? (
                          <div className="rounded-xl border border-slate-300/40 bg-slate-100/80 px-3 py-2 text-xs text-slate-900 dark:border-slate-700/50 dark:bg-slate-950/30 dark:text-slate-100">
                            <p className="font-semibold">Checking deposited balance</p>
                            <p className="mt-1 leading-relaxed opacity-90">
                              Aegis is loading your deposited {routeAssetSymbol} balance before allowing a new submission.
                            </p>
                          </div>
                        ) : activeRequest ? (
                          <div className="rounded-xl border border-cyan-300/40 bg-cyan-100/70 px-3 py-2 text-xs text-cyan-950 dark:border-cyan-700/50 dark:bg-cyan-950/30 dark:text-cyan-100">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">
                                  {isActiveRequestStale
                                    ? "Existing route request needs review"
                                    : "Existing route request still in progress"}
                                </p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  Request {truncateIdentifier(activeRequest.requestId)} is{" "}
                                  {getRouteRequestStatusLabel(activeRequest.status).toLowerCase()}.{" "}
                                  {getRouteRequestStatusSummary(activeRequest.status)}
                                </p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  {isActiveRequestStale
                                    ? "This request has not updated for more than 10 minutes. Refresh status and inspect the proof before retrying."
                                    : "Refresh the tracked request below before trying another submission."}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void refresh();
                                }}
                                className="rounded-full border border-current/20 px-3 py-1 text-[11px] font-medium transition hover:border-current/40"
                              >
                                Refresh status
                              </button>
                            </div>
                          </div>
                        ) : !hasDepositedRouteBalance ? (
                          <div className="rounded-xl border border-amber-300/40 bg-amber-100/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">Deposit required before routing</p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  Experimental route submission is only available after this wallet has a non-zero deposited {routeAssetSymbol} balance in the beta vault.
                                </p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  Current deposited balance snapshot: {routeAssetBalanceDisplay} {routeAssetSymbol}.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => refreshPortfolio()}
                                className="rounded-full border border-current/20 px-3 py-1 text-[11px] font-medium transition hover:border-current/40"
                              >
                                Refresh balance
                              </button>
                            </div>
                          </div>
                        ) : latestFailedRequest ? (
                          <div className="rounded-xl border border-red-300/40 bg-red-100/70 px-3 py-2 text-xs text-red-950 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-100">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">Latest route request failed</p>
                                <p className="mt-1 leading-relaxed opacity-90">
                                  Request {truncateIdentifier(latestFailedRequest.requestId)} failed. Review the tracked failure guidance below, then dismiss it to unlock another submission.
                                </p>
                                <div className="mt-1 space-y-1 leading-relaxed opacity-90">
                                  {latestFailedRequest.error ? (
                                    <p>{latestFailedRequest.error}</p>
                                  ) : null}
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
                                className="rounded-full border border-current/20 px-3 py-1 text-[11px] font-medium transition hover:border-current/40"
                              >
                                Dismiss failed request
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            onClick={() => handleConfirmTransaction(message)}
                            data-testid="confirm-transaction"
                            disabled={!canSubmitExperimentalRoute}
                            className="aegis-button bg-emerald-600 text-white hover:bg-emerald-700 w-full text-xs py-1.5 h-auto rounded-lg disabled:opacity-50 disabled:hover:bg-emerald-600"
                          >
                            {isExecutingRoute
                              ? "Submitting..."
                              : isConnectedToWrongNetwork
                                ? `Switch to ${AEGIS_RUNTIME.chainName}`
                                : portfolioErrorMessage
                                  ? "Route Eligibility Unavailable"
                                  : isPortfolioLoading
                                    ? "Checking Deposited Balance..."
                                    : activeRequest
                                      ? `Route ${getRouteRequestStatusLabel(activeRequest.status)}`
                                      : latestFailedRequest
                                        ? "Review Failed Request"
                                      : !hasDepositedRouteBalance
                                        ? `Deposit ${routeAssetSymbol} Before Routing`
                                        : "Submit Experimental Route"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelTransaction(message)}
                            data-testid="cancel-transaction"
                            className="aegis-button bg-white text-zinc-900 border hover:bg-zinc-50 w-full text-xs py-1.5 h-auto rounded-lg"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                  )}
                </div>
                <span className="text-[10px] font-medium text-muted-foreground px-1 uppercase tracking-tighter">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-zinc-900 border px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 bg-primary/40 rounded-full animate-bounce" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-2">Assessing Intent</span>
              </div>
            </div>
          </div>
        )}

        <RouteRequestStatusPanel
          requests={recentRouteRequests}
          errorMessage={routeRequestErrorMessage}
          isRefreshing={isRefreshingRouteRequests}
          onRefresh={() => {
            void refresh();
          }}
          onDismiss={dismissRequest}
          description="Recent experimental route requests submitted from chat. Proof links only cover current source-chain submission."
        />

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-background border-t">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Describe a ${routeAssetSymbol} routing idea...`}
            data-testid="chat-intent-input"
            className="aegis-input w-full pr-24 h-12 rounded-xl focus-visible:ring-primary/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            data-testid="chat-send-button"
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 bg-primary text-primary-foreground rounded-lg font-bold text-xs shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            Send
          </button>
        </form>
        <p className="mt-3 text-center text-[10px] text-muted-foreground uppercase tracking-tighter font-medium">
          {EXPERIMENTAL_ROUTING_ENABLED
            ? "Beta assistant: scores reflect the current prototype risk gate and may not match live chain conditions."
            : "Vault-only beta: assessments stay available, but route submission is disabled by default."}
        </p>
      </div>
    </section>
  );
}
