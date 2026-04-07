"use client";

import { ChatInterface } from "@/components/ChatInterface";
import { EXPERIMENTAL_ROUTING_ENABLED } from "@/lib/feature-flags";
import { SUPPORTED_TOKENS } from "@/lib/contracts";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

const routeAssetSymbol = SUPPORTED_TOKENS.find((token) => token.symbol === "USDC")?.symbol ??
  SUPPORTED_TOKENS[0]?.symbol ??
  "the configured route asset";

const howItWorksSteps = EXPERIMENTAL_ROUTING_ENABLED
  ? [
      { title: "Describe", text: `State an idea like 'Route ${routeAssetSymbol} to Asset Hub'.` },
      { title: "Assess", text: "Aegis returns the current prototype risk score and destination hint." },
      { title: "Review", text: "Only intents below the risk threshold can reach the experimental submit step." },
      { title: "Submit", text: "Any route submission here is evaluation only, not a live launch flow." },
    ]
  : [
      { title: "Describe", text: `State an idea like 'Route ${routeAssetSymbol} to Asset Hub'.` },
      { title: "Assess", text: "Aegis returns the current prototype risk score and destination hint." },
      { title: "Review", text: "Safe intents are still shown as lower risk for planning purposes." },
      { title: "Launch Mode", text: "Route submission is disabled by default in the vault-only beta and only enabled in explicit pilot environments." },
    ];

export default function ChatPage() {
  return (
    <div className="pb-20">
      <div className="bg-primary/5 border-b py-16 mb-12">
        <div className="aegis-shell">
          <div className="max-w-3xl space-y-4">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              Experimental assistant
            </span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
              Aegis <span className="text-primary">Assistant</span>.
            </h1>
            <p className="text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Describe a routing idea in plain English. Aegis returns a prototype risk assessment for {AEGIS_RUNTIME.chainName} planning; live routed execution is not a current launch feature.
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
                {howItWorksSteps.map((step, i) => (
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
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Assessment Model</h3>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                Current risk scoring uses configured model providers or a rules fallback and should be treated as beta guidance, not production monitoring.
              </p>
            </div>

            <div className="aegis-panel p-6 space-y-4 border-l-4 border-l-emerald-500">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Experimental Routing Workflow</h3>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                {EXPERIMENTAL_ROUTING_ENABLED
                  ? "If a route clears the prototype gate, an experimental submission path may appear. That is for evaluation only and is not proof of live cross-chain execution."
                  : "Experimental route submission is disabled in the default vault-only beta. Enable it only in explicit operator-assisted pilot environments."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
