"use client";

import Link from "next/link";

const features = [
  {
    title: "AI-Gated Routing",
    description: "Every intent is analyzed by our risk oracle before capital moves, blocking unsafe routes automatically.",
    icon: "🛡️",
    color: "bg-primary/10 text-primary"
  },
  {
    title: "Yield Aggregation",
    description: "Access deep liquidity and optimized yield across the entire Polkadot ecosystem from a single vault.",
    icon: "📈",
    color: "bg-indigo-500/10 text-indigo-600"
  },
  {
    title: "Cross-Chain native",
    description: "Built on XCM primitives for seamless asset transfers between parachains with minimal slippage.",
    icon: "🔗",
    color: "bg-emerald-500/10 text-emerald-600"
  },
];

export default function Home() {
  return (
    <div className="flex flex-col space-y-20 pb-20">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-white">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <div className="aegis-shell relative z-10">
          <div className="max-w-3xl space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-primary text-xs font-bold uppercase tracking-widest">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              Paseo Testnet Live
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[1.1]">
              The intelligent yield layer for <span className="text-primary">Polkadot.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Aegis is an intent-based, AI-guarded vault protocol. We route your capital to the safest, highest-performing yield strategies across the Hub.
            </p>
            
            <div className="flex flex-wrap gap-4 pt-4">
              <Link href="/vault" className="aegis-button h-14 px-8 bg-primary text-primary-foreground text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                Launch App
              </Link>
              <Link href="/chat" className="aegis-button h-14 px-8 border-2 text-lg font-bold transition-all hover:bg-secondary active:scale-95">
                Chat with Assistant
              </Link>
            </div>

            <div className="flex items-center gap-6 pt-8 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span> AI-Verified
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span> XCM-Enabled
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span> Non-Custodial
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
                <p className="font-bold">Paseo Hub</p>
                <p className="text-xs text-muted-foreground">Connected & Syncing</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 md:border-x px-0 md:px-8">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Value Guarded</p>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-black tracking-tight">—</p>
              <p className="text-sm font-bold text-muted-foreground pb-1">
                MVP beta (simulated)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Strategies</p>
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 w-10 rounded-full border-2 border-background bg-secondary flex items-center justify-center font-bold text-xs">
                  P{i}
                </div>
              ))}
              <div className="h-10 w-10 rounded-full border-2 border-background bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                +8
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="aegis-shell space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Engineered for Security</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto font-medium">Built from the ground up to protect your capital while maximizing yield potential.</p>
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
              Ready to automate your yield routing?
            </h2>
            <p className="text-xl opacity-80 leading-relaxed font-medium">
              Join the future of intent-based DeFi. Connect your wallet and let Aegis find the best opportunities for you.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Link href="/vault" className="h-14 px-10 bg-white text-primary rounded-xl flex items-center justify-center font-bold text-lg hover:bg-opacity-90 transition-all active:scale-95">
                Open Vault
              </Link>
              <button className="h-14 px-8 border-2 border-white/20 rounded-xl font-bold text-lg hover:bg-white/10 transition-all active:scale-95">
                View Documentation
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
