"use client";

import Link from "next/link";
import { SUPPORTED_TOKENS } from "@/lib/contracts";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

const features = [
  {
    title: "Vault Beta",
    description: `Connect a wallet and use supported deposit and withdraw flows on ${AEGIS_RUNTIME.chainName}.`,
    icon: "🛡️",
    color: "bg-primary/10 text-primary"
  },
  {
    title: "Route Evaluation",
    description: "Intent prompts are scored by the current policy-based oracle before any experimental route submission is shown.",
    icon: "📈",
    color: "bg-indigo-500/10 text-indigo-600"
  },
  {
    title: "Experimental Routing",
    description: "XCM-related routing remains a testnet evaluation path and is not a live production-safe launch feature.",
    icon: "🔗",
    color: "bg-emerald-500/10 text-emerald-600"
  },
];

export default function Home() {
  const supportedAssetSummary =
    SUPPORTED_TOKENS.length > 1
      ? `${AEGIS_RUNTIME.chainName} assets: ${SUPPORTED_TOKENS.map((token) => token.symbol).join(" and ")}`
      : `${AEGIS_RUNTIME.chainName} asset: ${SUPPORTED_TOKENS[0]?.symbol ?? "Configured staging token"}`;

  return (
    <div className="flex flex-col space-y-20 pb-20">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-white">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <div className="aegis-shell relative z-10">
          <div className="max-w-3xl space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-primary text-xs font-bold uppercase tracking-widest">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              {AEGIS_RUNTIME.statusBadge}
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[1.1]">
              The pilot-first vault beta for <span className="text-primary">Polkadot.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Aegis currently supports deposit and withdraw flows for supported assets on {AEGIS_RUNTIME.chainName}. Routing assessment and XCM-related workflows remain experimental beta tools, not live launch features.
            </p>
            
            <div className="flex flex-wrap gap-4 pt-4">
              <Link href="/vault" className="aegis-button h-14 px-8 bg-primary text-primary-foreground text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                Open Vault
              </Link>
              <Link href="/chat" className="aegis-button h-14 px-8 border-2 text-lg font-bold transition-all hover:bg-secondary active:scale-95">
                Review Beta Assistant
              </Link>
            </div>

            <div className="flex items-center gap-6 pt-8 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span> Vault Beta
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🧪</span> Route Evaluation Only
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📍</span>{" "}
                {AEGIS_RUNTIME.env === "moonbase-staging"
                  ? "Staging-only Today"
                  : "Testnet-only Today"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats/Wallet Section */}
      <section className="aegis-shell -mt-24 relative z-20">
        <div className="aegis-panel p-8 grid md:grid-cols-3 gap-8 shadow-2xl">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Network Status</p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div>
                <p className="font-bold">{AEGIS_RUNTIME.chainName}</p>
                <p className="text-xs text-muted-foreground">{AEGIS_RUNTIME.postureDescription}</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 md:border-x px-0 md:px-8">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Launch Mode</p>
            <div className="space-y-1">
              <p className="text-3xl font-black tracking-tight">Vault-only beta</p>
              <p className="text-sm font-bold text-muted-foreground">
                Routing stays experimental until protected pilot proof exists.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Supported Assets</p>
            <div className="space-y-1">
              <p className="font-bold">{supportedAssetSummary}</p>
              <p className="text-xs text-muted-foreground">Configured environment assets only; not launch-asset proof.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="aegis-shell space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Vault Beta and Evaluation Tools</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto font-medium">Built to keep the current runtime story aligned with what is live on {AEGIS_RUNTIME.chainName} today and what remains experimental.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="aegis-panel p-8 space-y-6 group hover:border-primary/50 transition-colors">
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center text-3xl ${feature.color}`}>
                {feature.icon}
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
              <Link href="/vault" className="inline-flex items-center gap-2 text-sm font-bold text-primary group-hover:translate-x-1 transition-transform">
                Learn more <span>→</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="aegis-shell">
        <div className="bg-primary rounded-[32px] p-8 md:p-16 text-primary-foreground relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-full bg-white/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 max-w-2xl space-y-8">
            <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
              Explore the vault-only beta.
            </h2>
            <p className="text-xl opacity-80 leading-relaxed font-medium">
              Use today&apos;s deposit and withdraw flows on {AEGIS_RUNTIME.chainName}, or review the experimental routing assistant with environment-appropriate expectations.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Link href="/vault" className="h-14 px-10 bg-white text-primary rounded-xl flex items-center justify-center font-bold text-lg hover:bg-opacity-90 transition-all active:scale-95">
                Open Vault
              </Link>
              <Link href="/chat" className="h-14 px-8 border-2 border-white/20 rounded-xl font-bold text-lg hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center">
                Review Beta Assistant
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
