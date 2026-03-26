"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

interface Message {
  id: string;
  type: "user" | "ai" | "system";
  content: string;
  timestamp: Date;
  data?: {
    parachainId?: number;
    riskScore?: number;
    safeToRoute?: boolean;
  };
}

interface RiskOracleResponse {
  parachainId: number;
  riskScore: number;
  safeToRoute: boolean;
}

export function ChatInterface() {
  const { address, isConnected } = useAccount();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "ai",
      content:
        "Hello. I am Aegis, your AI-guarded yield assistant. Describe what you want to do with your test-USDC and I will assess the route before execution.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingRoute, setIsExecutingRoute] = useState(false);
  const [dismissedConfirmations, setDismissedConfirmations] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      const riskData = await callRiskOracle(userMessage.content);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: `Intent analyzed.\n\n• Parachain: **${getParachainName(riskData.parachainId)}**\n• Risk Score: **${riskData.riskScore}/100**\n• Status: **${riskData.safeToRoute ? "Safe to proceed" : "Transaction blocked (High Risk)"}**`,
        timestamp: new Date(),
        data: riskData,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (riskData.safeToRoute) {
        const transactionMessage: Message = {
          id: (Date.now() + 2).toString(),
          type: "system",
          content:
            "This route passed the risk gate. Confirm if you want to execute the transaction.",
          timestamp: new Date(),
          data: riskData,
        };
        setMessages((prev) => [...prev, transactionMessage]);
      }
    } catch {
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
    setIsExecutingRoute(true);

    try {
      const resp = await fetch("/api/execute-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          // risk gate is enforced again server-side; passing it speeds up orchestration.
          riskScore: message.data.riskScore,
          intent: message.content,
        }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        throw new Error(json?.error ?? "Execute route failed");
      }

      setDismissedConfirmations((prev) => [...prev, message.id]);
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-submitted`,
          type: "ai",
          content: `Route execution submitted.\nTx: ${json.txHash}\nCheck Activity for ` +
            `\`Deposit\` / \`YieldRoutedViaXCM\` events.`,
          timestamp: new Date(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${message.id}-error`,
          type: "ai",
          content:
            "Route execution could not be performed in this environment. " +
            "Ensure the oracle/relay signing key is configured and that you have a non-zero deposited test-USDC balance.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsExecutingRoute(false);
    }
  };

  const handleCancelTransaction = (message: Message) => {
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

  if (!isConnected) {
    return (
      <div className="aegis-panel p-12 text-center flex flex-col items-center justify-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-4xl animate-pulse">
          🤖
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">AI Assistant Offline</h2>
          <p className="text-muted-foreground max-w-sm">Connect your wallet to establish a secure intent channel with the Aegis AI Assistant.</p>
        </div>
        <button className="aegis-button aegis-button-primary px-8">Connect Wallet</button>
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
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active Channel</span>
            </div>
          </div>
        </div>
        <button className="text-xs font-medium text-muted-foreground hover:text-foreground">Clear Chat</button>
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
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => handleConfirmTransaction(message)}
                          data-testid="confirm-transaction"
                          disabled={isExecutingRoute}
                          className="aegis-button bg-emerald-600 text-white hover:bg-emerald-700 w-full text-xs py-1.5 h-auto rounded-lg"
                        >
                          {isExecutingRoute ? "Executing..." : "Execute Route"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelTransaction(message)}
                          data-testid="cancel-transaction"
                          className="aegis-button bg-white text-zinc-900 border hover:bg-zinc-50 w-full text-xs py-1.5 h-auto rounded-lg"
                        >
                          Decline
                        </button>
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-2">Analyzing Route</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-background border-t">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your DeFi intent..."
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
          Aegis AI may block routes that exceed your risk parameters.
        </p>
      </div>
    </section>
  );
}
