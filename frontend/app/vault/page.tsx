"use client";

import Link from "next/link";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawalForm } from "@/components/WithdrawalForm";
import { VaultStats } from "@/components/VaultStats";
import { WalletHistoryTable } from "@/components/WalletHistoryTable";
import { XcmRoutePanel } from "@/components/XcmRoutePanel";
import { SUPPORTED_TOKENS } from "@/lib/contracts";
import { useWalletHistoryData } from "@/lib/useWalletHistoryData";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

const guides = [
  {
    title: "Deposit Flow",
    icon: "📥",
    steps: [
      "Choose a supported token.",
      "Enter amount to move into vault.",
      "Approve wallet transaction.",
      "Track position in history panel.",
    ],
  },
  {
    title: "Withdrawal Flow",
    icon: "📤",
    steps: [
      "Select the asset you want back.",
      "Enter a value or use max balance.",
      "Confirm request in your wallet.",
      "Vault balance refreshes instantly.",
    ],
  },
  {
    title: "Supported Assets",
    icon: "💎",
    steps: [
      ...SUPPORTED_TOKENS.map((token) => `${token.symbol} supported asset`),
      "Current token metadata is environment-scoped.",
    ],
  },
  {
    title: "Notes",
    icon: "📝",
    steps: [
      "Token approval is required.",
      "Verify network fees.",
      "On-chain beta balance updates.",
      "Any non-zero amount supported by the current beta contract.",
    ],
  },
];

export default function VaultPage() {
  const {
    isLoading: isHistoryLoading,
    errorMessage: historyErrorMessage,
    items,
    userAddress,
    coverage,
  } = useWalletHistoryData();

  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              {AEGIS_RUNTIME.postureLabel}
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Aegis <span className="text-primary">Vault</span> Console.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Deposit, withdraw, and inspect supported assets on the Aegis vault surface for {AEGIS_RUNTIME.chainName}. Experimental routing tooling is visible for evaluation only and is not a live launch feature.
            </p>
          </div>
        </div>
      </div>

      <div className="aegis-shell space-y-12">
        <VaultStats />

        <div className="grid gap-8 lg:grid-cols-2">
          <DepositForm />
          <WithdrawalForm />
        </div>

        <XcmRoutePanel />

        {historyErrorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
            <p className="text-sm font-semibold">Recent wallet history unavailable</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{historyErrorMessage}</p>
          </div>
        )}

        <div className="space-y-4">
          <WalletHistoryTable
            items={items}
            isLoading={isHistoryLoading}
            userAddress={userAddress}
            errorMessage={historyErrorMessage}
          />
          {userAddress && !historyErrorMessage && (
            <div className="rounded-2xl border bg-secondary/20 p-4 text-xs text-muted-foreground leading-relaxed">
              Recent wallet history covers source-chain deposits and withdrawals from
              blocks {coverage.onChainWindow.fromBlock} to{" "}
              {coverage.onChainWindow.indexedThroughBlock}. This bounded wallet
              view intentionally excludes private relay-request records and does
              not provide full archival history or per-user route-outcome
              proof.
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {guides.map((guide) => (
            <div key={guide.title} className="aegis-panel p-6 space-y-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{guide.icon}</span>
                <h3 className="font-bold text-sm tracking-tight">{guide.title}</h3>
              </div>
              <ul className="space-y-2">
                {guide.steps.map((step, index) => (
                  <li key={index} className="flex gap-2 text-xs font-medium text-muted-foreground">
                    <span className="text-primary opacity-50">•</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-xl space-y-4">
              <h2 className="text-3xl font-bold tracking-tight">Need beta guidance?</h2>
              <p className="text-zinc-400 font-medium leading-relaxed">
                Review the assistant and activity pages for current environment context. They help explain the beta workflow, but they do not represent production-safe routed execution.
              </p>
            </div>
            <div className="flex gap-4 shrink-0">
              <Link href="/chat" className="h-12 px-8 bg-primary text-white rounded-xl flex items-center justify-center font-bold hover:scale-105 transition-all">
                Open Assistant
              </Link>
              <Link href="/activity" className="h-12 px-8 bg-zinc-800 text-white rounded-xl flex items-center justify-center font-bold hover:bg-zinc-700 transition-all">
                View Activity
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
