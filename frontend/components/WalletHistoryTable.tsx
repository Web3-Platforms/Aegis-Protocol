"use client";

import { useMemo, useState } from "react";
import type { WalletHistoryItem } from "@/lib/history";
import { getAegisExplorerTxUrl } from "@/lib/runtime/environment";

const PAGE_SIZE = 10;
type FilterType = "all" | "deposit" | "withdrawal";

interface WalletHistoryTableProps {
  items?: WalletHistoryItem[];
  isLoading?: boolean;
  userAddress?: string | null;
  errorMessage?: string | null;
}

function formatStatusLabel(status: WalletHistoryItem["status"]): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function WalletHistoryTable({
  items = [],
  isLoading = false,
  userAddress = null,
  errorMessage = null,
}: WalletHistoryTableProps) {
  const [{ filter, page }, setView] = useState<{ filter: FilterType; page: number }>({
    filter: "all",
    page: 0,
  });

  const setFilter = (nextFilter: FilterType) =>
    setView({ filter: nextFilter, page: 0 });
  const setPage = (nextPage: number) =>
    setView((current) => ({ ...current, page: nextPage }));

  const filteredItems = useMemo(
    () =>
      filter === "all" ? items : items.filter((item) => item.kind === filter),
    [filter, items]
  );
  const availableFilters = useMemo(
    () => ["all", "deposit", "withdrawal"] as const,
    []
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageSlice = filteredItems.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  function exportCSV() {
    const header = "Kind,Status,ObservedAt,Amount,Token,TxHash";
    const rows = filteredItems.map((item) =>
      [
        item.kind,
        item.status,
        new Date(item.observedAt).toISOString(),
        item.amount.display ?? "",
        item.token?.symbol ?? "",
        item.txHash ?? "",
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aegis-wallet-history-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function kindLabel(kind: WalletHistoryItem["kind"]) {
    if (kind === "deposit") {
      return "Deposit";
    }

    return "Withdrawal";
  }

  function statusBadge(status: WalletHistoryItem["status"]) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
        {formatStatusLabel(status)}
      </span>
    );
  }

  function truncate(value: string) {
    return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  }

  function subscanUrl(hash: string) {
    return getAegisExplorerTxUrl(hash);
  }

  function renderAmount(item: WalletHistoryItem) {
    const prefix = item.kind === "deposit" ? "+" : "−";
    const value = item.amount.display ?? "Pending";
    const tokenSymbol = item.token?.symbol ? ` ${item.token.symbol}` : "";

    return `${prefix}${value}${tokenSymbol}`;
  }

  if (isLoading) {
    return (
      <div className="aegis-panel p-12 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <section className="space-y-6">
        <div className="aegis-panel py-16 text-center">
          <p className="text-muted-foreground font-medium">
            Recent wallet history is unavailable until the history API recovers.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Recent Wallet History</h2>
          <p className="text-sm text-muted-foreground">
            Recent deposits and withdrawals for the connected wallet.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex p-1 bg-secondary/50 rounded-xl border w-fit">
            {availableFilters.map(
              (id) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    filter === id
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {id === "all"
                    ? "All"
                    : `${id.charAt(0).toUpperCase()}${id.slice(1)}s`}
                </button>
              )
            )}
          </div>

          <button
            onClick={exportCSV}
            disabled={filteredItems.length === 0}
            className="h-8 px-4 rounded-xl border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {pageSlice.length === 0 ? (
        <div className="aegis-panel py-16 text-center">
          <p className="text-muted-foreground font-medium">
            {!userAddress
              ? "Connect your wallet to load recent wallet history."
              : items.length === 0
              ? "No recent wallet history found in the current indexed window."
              : "No history rows match this filter."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30 border-b">
                  {["Type", "Status", "Date", "Amount", "Reference"].map((header) => (
                    <th
                      key={header}
                      className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground${
                        header === "Reference" ? " text-right" : ""
                      }`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageSlice.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-sm">
                            {item.kind === "deposit"
                              ? "📥"
                              : "📤"}
                          </span>
                          <div>
                            <span className="font-bold text-sm">{kindLabel(item.kind)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{statusBadge(item.status)}</td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-muted-foreground font-medium">
                          {new Date(item.observedAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-sm font-bold ${
                            item.kind === "withdrawal"
                              ? "text-foreground"
                              : "text-primary"
                          }`}
                        >
                          {renderAmount(item)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {item.txHash ? (
                            <a
                              href={subscanUrl(item.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-primary hover:underline bg-secondary/30 px-2 py-1 rounded"
                              title={item.txHash}
                            >
                              {truncate(item.txHash)}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">No hash yet</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-medium text-muted-foreground">
          Showing{" "}
          <span className="text-foreground font-bold">
            {filteredItems.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, filteredItems.length)}
          </span>{" "}
          of{" "}
          <span className="text-foreground font-bold">{filteredItems.length}</span>{" "}
          history rows
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="h-8 px-3 flex items-center text-xs font-bold text-muted-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className="h-8 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
