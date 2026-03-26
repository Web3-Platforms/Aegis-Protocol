"use client";

import { useMemo, useState } from "react";
import type { ActivityTransaction } from "@/lib/useVaultActivityData";

interface TransactionHistoryProps {
  transactions?: ActivityTransaction[];
  isLoading?: boolean;
  routedAssetAddress?: string;
  destinationParachainId?: number;
  destinationVaultAddress?: string;
}

export function TransactionHistory({
  transactions = [],
  isLoading = false,
  routedAssetAddress = "",
  destinationParachainId = 1000,
  destinationVaultAddress = "",
}: TransactionHistoryProps) {
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "yield_routed">("all");

  const filteredTransactions = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((tx) => tx.type === filter),
    [filter, transactions]
  );

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "withdrawal":
        return "Withdrawal";
      case "yield_routed":
        return "Yield Routed";
      default:
        return "Transaction";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Confirmed</span>;
      case "pending":
        return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</span>;
      case "failed":
        return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">{status}</span>;
    }
  };

  const truncateTxHash = (hash: string) => (hash.length > 12 ? `${hash.slice(0, 10)}...` : hash);

  if (isLoading) {
    return (
      <div className="aegis-panel p-12 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transaction History</h2>
          <p className="text-sm text-muted-foreground">Detailed ledger of your vault activity</p>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Source: on-chain `Deposit`, `Withdrawal`, and `YieldRoutedViaXCM` logs.
          </p>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Route target: parachain {destinationParachainId} · vault {destinationVaultAddress.slice(0, 8)}...
          </p>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Routed asset address: {routedAssetAddress}
          </p>
        </div>

        <div className="flex p-1 bg-secondary/50 rounded-xl border w-fit">
          {[
            { id: "all", label: "All" },
            { id: "deposit", label: "Deposits" },
            { id: "withdrawal", label: "Withdrawals" },
            { id: "yield_routed", label: "Yields" }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id as typeof filter)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filter === item.id 
                  ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="aegis-panel py-16 text-center">
          <p className="text-muted-foreground font-medium">No transactions found for this filter.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30 border-b">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-secondary/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-sm">
                          {tx.type === 'deposit' ? '📥' : tx.type === 'withdrawal' ? '📤' : '📈'}
                        </span>
                        <span className="font-bold text-sm">{getTypeLabel(tx.type)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground font-medium">
                        {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${tx.type === 'withdrawal' ? 'text-foreground' : 'text-primary'}`}>
                        {tx.type === 'withdrawal' ? '-' : '+'}{tx.amount.toFixed(2)} {tx.token}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs font-mono text-muted-foreground bg-secondary/30 px-2 py-1 rounded">
                        {truncateTxHash(tx.txHash)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-medium text-muted-foreground">
          Showing <span className="text-foreground font-bold">{filteredTransactions.length}</span> of <span className="text-foreground font-bold">{transactions.length}</span> transactions
        </p>
        <div className="flex gap-2">
          <button className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors">Previous</button>
          <button className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors">Next</button>
        </div>
      </div>
    </section>
  );
}
