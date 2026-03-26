"use client";

import { TransactionHistory } from "@/components/TransactionHistory";
import { YieldStatistics } from "@/components/YieldStatistics";
import { useVaultActivityData } from "@/lib/useVaultActivityData";

export default function ActivityPage() {
  const {
    isLoading,
    stats,
    yields,
    transactions,
    routedAssetAddress,
    destinationParachainId,
    destinationVaultAddress,
  } = useVaultActivityData();

  const statCards = [
    { label: "Total Transactions", value: `${stats.transactionCount}`, note: "On-chain logs loaded", icon: "📊" },
    { label: "Total Deposited", value: `${stats.totalDeposited.toFixed(2)} USDC`, note: "User deposit events", icon: "📥" },
    { label: "Total Withdrawn", value: `${stats.totalWithdrawn.toFixed(2)} USDC`, note: "User withdrawal events", icon: "📤" },
    { label: "Yield Routed", value: `${stats.totalYieldRouted.toFixed(2)} USDC`, note: "Route events emitted", icon: "📈" },
  ];

  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              Performance Analytics
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Protocol <span className="text-primary">Activity</span>.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Comprehensive overview of your vault's performance, transaction history, and active yield strategies across the Polkadot ecosystem.
            </p>
            <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Data source: live contract events from the configured AegisVault on Paseo.
            </p>
          </div>
        </div>
      </div>

      <div className="aegis-shell space-y-12">
        {!isLoading && (
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
          <h2 className="text-2xl font-bold tracking-tight">Yield Strategies</h2>
          <YieldStatistics yields={yields} stats={stats} isLoading={isLoading} />
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Recent Ledger</h2>
          <TransactionHistory
            transactions={transactions}
            isLoading={isLoading}
            routedAssetAddress={routedAssetAddress}
            destinationParachainId={destinationParachainId}
            destinationVaultAddress={destinationVaultAddress}
          />
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="aegis-panel p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl">
                ℹ️
              </div>
              <h3 className="font-bold">Understanding Metrics</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Total yield reflects cumulative gains across active parachain strategies.",
                "Average APY captures mean performance across current routes.",
                "Risk score remains the AI-derived safety metric used for gating."
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
              <h3 className="font-bold">Optimization Notes</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Diversify across supported routes for a broader return profile.",
                "Use the chat interface to evaluate new opportunities before routing.",
                "Rebalance through the vault surface when a strategy no longer fits."
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
