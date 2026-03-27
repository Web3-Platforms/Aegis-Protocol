"use client";

import Link from "next/link";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawalForm } from "@/components/WithdrawalForm";
import { VaultStats } from "@/components/VaultStats";
import { TransactionHistory } from "@/components/TransactionHistory";
import { XcmRoutePanel } from "@/components/XcmRoutePanel";

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
      "wPAS (10 decimals)",
      "test-USDC (6 decimals)",
      "Unified vault workflow (MVP beta).",
    ],
  },
  {
    title: "Notes",
    icon: "📝",
    steps: [
      "Token approval is required.",
      "Verify network fees.",
      "Real-time balance updates.",
      "Min deposit: 0.01 tokens.",
    ],
  },
];

export default function VaultPage() {
  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              Capital Management
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Aegis <span className="text-primary">Vault</span> Console.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Securely deposit, withdraw, and track your on-chain yield positions with institutional-grade risk monitoring and AI-guarded routing.
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

        <TransactionHistory />

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
              <h2 className="text-3xl font-bold tracking-tight">Need assistance?</h2>
              <p className="text-zinc-400 font-medium leading-relaxed">
                If you're unsure about a specific yield strategy or want to verify a route before execution, our AI assistant is here to help.
              </p>
            </div>
            <div className="flex gap-4 shrink-0">
              <Link href="/chat" className="h-12 px-8 bg-primary text-white rounded-xl flex items-center justify-center font-bold hover:scale-105 transition-all">
                Launch Assistant
              </Link>
              <Link href="/activity" className="h-12 px-8 bg-zinc-800 text-white rounded-xl flex items-center justify-center font-bold hover:bg-zinc-700 transition-all">
                View Analytics
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
