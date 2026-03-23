"use client";

import { ChatInterface } from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              AI Intent Engine
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Aegis <span className="text-primary">Assistant</span>.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Describe your DeFi goals in plain English. Our AI risk oracle will analyze the route, score the potential risks, and help you execute safely.
            </p>
          </div>
        </div>
      </div>

      <div className="aegis-shell space-y-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Intent Channel</h2>
            <ChatInterface />
          </div>

          <div className="space-y-8">
            <div className="aegis-panel p-6 space-y-6">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">How It Works</h3>
              <div className="space-y-4">
                {[
                  { title: "Describe", text: "State a goal like 'Earn yield on Acala'." },
                  { title: "Analyze", text: "Aegis evaluates risk before offering routes." },
                  { title: "Score", text: "Routes must be below the risk threshold." },
                  { title: "Execute", text: "Safe routes can be executed instantly." }
                ].map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {i+1}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="aegis-panel p-6 space-y-4 border-l-4 border-l-indigo-500">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">AI Protection</h3>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                The Aegis AI Oracle monitors block-level data across the Polkadot ecosystem to identify anomalous behavior before it affects your capital.
              </p>
            </div>

            <div className="aegis-panel p-6 space-y-4 border-l-4 border-l-emerald-500">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Safe Routing</h3>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                Every transaction executed through this channel is wrapped in a safety-first routing logic that prioritizes capital preservation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
