"use client";

import { TransactionHistory } from "@/components/TransactionHistory";
import { RouteEventStatistics } from "@/components/RouteEventStatistics";
import { useVaultActivityData } from "@/lib/useVaultActivityData";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

export default function ActivityPage() {
  const {
    isLoading,
    errorMessage,
    stats,
    routeGroups,
    transactions,
    indexedThroughBlock,
    fromBlock,
  } = useVaultActivityData();

  const depositEventCount = transactions.filter((tx) => tx.type === "deposit").length;
  const withdrawalEventCount = transactions.filter((tx) => tx.type === "withdrawal").length;
  const routeEventCount = transactions.filter((tx) => tx.type === "route_event").length;

  const statCards = [
    { label: "Total Transactions", value: `${stats.transactionCount}`, note: "On-chain logs loaded", icon: "📊" },
    { label: "Deposit Events", value: `${depositEventCount}`, note: "Observed deposit logs", icon: "📥" },
    { label: "Withdrawal Events", value: `${withdrawalEventCount}`, note: "Observed withdrawal logs", icon: "📤" },
    { label: "Route Events", value: `${routeEventCount}`, note: "Observed indexed XcmRouted logs", icon: "📈" },
  ];

  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              Activity & event data
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Vault <span className="text-primary">Activity</span>.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Overview of vault deposits, withdrawals, and emitted route events on {AEGIS_RUNTIME.chainName}. This page does not report realized yield, APY, or live cross-chain performance yet.
            </p>
            <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Data source: normalized source-chain activity from the server activity API.
            </p>
            {errorMessage ? (
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium max-w-2xl leading-relaxed">
                Indexed window unavailable while the activity API is failing.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
                Current indexed window: blocks {fromBlock} to {indexedThroughBlock}.
              </p>
            )}
          </div>
        </div>
      </div>

        <div className="aegis-shell space-y-12">
        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
            <p className="text-sm font-semibold">Activity data unavailable</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{errorMessage}</p>
          </div>
        )}

        {!isLoading && !errorMessage && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="aegis-panel p-6 group hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl">{card.icon}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{card.label}</span>
                </div>
                <p className="text-3xl font-black tracking-tight">{card.value}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">{card.note}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Route Event Breakdown</h2>
          <RouteEventStatistics
            routeGroups={routeGroups}
            stats={stats}
            isLoading={isLoading}
            errorMessage={errorMessage}
          />
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Recent Ledger</h2>
          <TransactionHistory
            transactions={transactions}
            isLoading={isLoading}
            errorMessage={errorMessage}
          />
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="aegis-panel p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl">
                ℹ️
              </div>
              <h3 className="font-bold">Metric Notes</h3>
            </div>
            <ul className="space-y-4">
              {[
                 "Summary cards count events instead of estimating mixed-asset portfolio value across the beta vault.",
                 "Route totals reflect indexed source-chain route outcome amounts, not realized yield or PnL.",
                 "Route breakdown groups are derived from indexed source-chain route events by destination and asset.",
                 "When a wallet is connected, deposit and withdrawal rows are wallet-scoped while route outcomes remain vault-wide beta events.",
                 "Risk score reflects the current prototype policy gate."
               ].map((item, i) => (
                <li key={i} className="flex gap-3 text-sm font-medium text-muted-foreground leading-relaxed">
                  <span className="text-primary font-bold">{i+1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="aegis-panel p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 text-xl">
                💡
              </div>
              <h3 className="font-bold">Beta Guidance</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Use this page to inspect beta vault activity and route-related events.",
                "Use the assistant to assess intents before any experimental route submission.",
                "Treat routing and rebalancing as deferred from the first real-money vault-only launch contract."
              ].map((item, i) => (
                <li key={i} className="flex gap-3 text-sm font-medium text-muted-foreground leading-relaxed">
                  <span className="text-indigo-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
