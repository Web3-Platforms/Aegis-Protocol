"use client";

import { useMemo, useState } from "react";
import type { ActivityTransaction } from "@/lib/useVaultActivityData";

const PAGE_SIZE = 10;
type FilterType = "all" | "deposit" | "withdrawal" | "yield_routed";

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
  // Combine filter + page into one state so changing the filter atomically
  // resets the page — no setState-in-effect needed.
  const [{ filter, page }, setView] = useState<{ filter: FilterType; page: number }>({
    filter: "all",
    page: 0,
  });

  const setFilter = (f: FilterType) => setView({ filter: f, page: 0 });
  const setPage   = (p: number)     => setView((v) => ({ ...v, page: p }));

  const filteredTransactions = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((tx) => tx.type === filter),
    [filter, transactions]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pageSlice = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── CSV export ────────────────────────────────────────────────────────
  function exportCSV() {
    const header = "Type,Status,Date,Amount,Token,TxHash";
    const rows = filteredTransactions.map((tx) =>
      [
        tx.type,
        tx.status,
        new Date(tx.timestamp).toISOString(),
        tx.amount.toFixed(6),
        tx.token,
        tx.txHash,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-transactions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  const typeLabel = (type: string) => {
    if (type === "deposit") return "Deposit";
    if (type === "withdrawal") return "Withdrawal";
    if (type === "yield_routed") return "Yield Routed";
    return "Transaction";
  };

  const statusBadge = (status: string) => {
    if (status === "confirmed")
      return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Confirmed</span>;
    if (status === "pending")
      return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Pending</span>;
    if (status === "failed")
      return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Failed</span>;
    return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-700">{status}</span>;
  };

  const truncate = (hash: string) =>
    hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;

  const subscanUrl = (hash: string) =>
    `https://paseo.subscan.io/tx/${hash}`;

  if (isLoading) {
    return (
      <div className="aegis-panel p-12 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transaction History</h2>
          <p className="text-sm text-muted-foreground">
            On-chain <code className="text-xs bg-secondary px-1 rounded">Deposit</code>,{" "}
            <code className="text-xs bg-secondary px-1 rounded">Withdrawal</code>, and{" "}
            <code className="text-xs bg-secondary px-1 rounded">YieldRoutedViaXCM</code> events
          </p>
          {destinationVaultAddress && (
            <p className="text-xs text-muted-foreground mt-1">
              Route target: parachain {destinationParachainId} · vault{" "}
              {destinationVaultAddress.slice(0, 8)}…
            </p>
          )}
          {routedAssetAddress && (
            <p className="text-xs text-muted-foreground">
              Routed asset: {routedAssetAddress}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter tabs */}
          <div className="flex p-1 bg-secondary/50 rounded-xl border w-fit">
            {(["all", "deposit", "withdrawal", "yield_routed"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  filter === id
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {id === "all" ? "All" : id === "yield_routed" ? "Yields" : id.charAt(0).toUpperCase() + id.slice(1) + "s"}
              </button>
            ))}
          </div>

          {/* Export button */}
          <button
            onClick={exportCSV}
            disabled={filteredTransactions.length === 0}
            className="h-8 px-4 rounded-xl border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {pageSlice.length === 0 ? (
        <div className="aegis-panel py-16 text-center">
          <p className="text-muted-foreground font-medium">
            {transactions.length === 0
              ? "No on-chain transactions found. Deposit to get started."
              : "No transactions match this filter."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30 border-b">
                  {["Type", "Status", "Date", "Amount", "Hash"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground${i === 4 ? " text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageSlice.map((tx) => (
                  <tr key={tx.id} className="hover:bg-secondary/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-sm">
                          {tx.type === "deposit" ? "📥" : tx.type === "withdrawal" ? "📤" : "📈"}
                        </span>
                        <span className="font-bold text-sm">{typeLabel(tx.type)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{statusBadge(tx.status)}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground font-medium">
                        {new Date(tx.timestamp).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${tx.type === "withdrawal" ? "text-foreground" : "text-primary"}`}>
                        {tx.type === "withdrawal" ? "−" : "+"}
                        {tx.amount.toFixed(2)} {tx.token}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={subscanUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-primary hover:underline bg-secondary/30 px-2 py-1 rounded"
                        title={tx.txHash}
                      >
                        {truncate(tx.txHash)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-medium text-muted-foreground">
          Showing{" "}
          <span className="text-foreground font-bold">
            {filteredTransactions.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, filteredTransactions.length)}
          </span>{" "}
          of{" "}
          <span className="text-foreground font-bold">{filteredTransactions.length}</span>{" "}
          transactions
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="h-8 px-3 flex items-center text-xs font-bold text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
