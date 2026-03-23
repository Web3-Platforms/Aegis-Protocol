"use client";

import { useEffect, useState } from "react";
import { getYieldData, getYieldStats, type YieldData } from "@/lib/mockData";

export function YieldStatistics() {
  const [yields, setYields] = useState<YieldData[]>([]);
  const [stats, setStats] = useState({
    totalYield: 0,
    activeStrategies: 0,
    averageAPY: 0,
    averageRiskScore: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [yieldData, yieldStats] = await Promise.all([getYieldData(), getYieldStats()]);
        setYields(yieldData);
        setStats(yieldStats);
      } catch (error) {
        console.error("Failed to fetch yield data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="aegis-panel h-32 animate-pulse bg-secondary/20" />
        ))}
      </div>
    );
  }

  const getRiskColor = (risk: number) => {
    if (risk < 30) return "text-green-600 dark:text-green-400";
    if (risk < 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRiskLabel = (risk: number) => {
    if (risk < 30) return "Low";
    if (risk < 60) return "Medium";
    return "High";
  };

  const topApy = yields.length > 0 ? Math.max(...yields.map((item) => item.apy)).toFixed(2) : "0";
  const lowApy = yields.length > 0 ? Math.min(...yields.map((item) => item.apy)).toFixed(2) : "0";
  const totalRouted = yields.reduce((sum, item) => sum + item.amount, 0).toFixed(2);

  return (
    <section className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="aegis-panel p-6 border-l-4 border-l-primary">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Yield</p>
          <p className="text-3xl font-extrabold">{stats.totalYield.toFixed(2)} <span className="text-sm font-medium text-muted-foreground">DOT</span></p>
          <div className="mt-2 flex items-center gap-1 text-xs text-green-600 font-medium">
            <span>All-time</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-indigo-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Active Routes</p>
          <p className="text-3xl font-extrabold">{stats.activeStrategies}</p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>Routing yield</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-emerald-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Average APY</p>
          <p className="text-3xl font-extrabold">{stats.averageAPY.toFixed(1)}%</p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>Across protocols</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-amber-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Risk Profile</p>
          <p className={`text-3xl font-extrabold ${getRiskColor(stats.averageRiskScore)}`}>
            {stats.averageRiskScore.toFixed(0)}<span className="text-sm font-medium opacity-70">/100</span>
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>{getRiskLabel(stats.averageRiskScore)} Risk</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Active Strategy Breakdown</h2>
            <button className="text-sm font-medium text-primary hover:underline">View all</button>
          </div>

          {yields.length === 0 ? (
            <div className="aegis-panel py-12 text-center text-muted-foreground">No active yield strategies yet.</div>
          ) : (
            <div className="space-y-4">
              {yields.map((item) => (
                <div key={item.parachainId} className="aegis-panel p-5 group transition-all hover:border-primary/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                        {item.parachainName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{item.parachainName}</h3>
                        <p className="text-xs text-muted-foreground">Chain ID: {item.parachainId}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end">
                      <p className="text-xl font-bold text-primary">{item.amount.toFixed(2)} DOT</p>
                      <p className="text-xs text-green-600 font-bold">+{item.yield.toFixed(2)} DOT earned</p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">APY</p>
                      <p className="text-sm font-bold">{item.apy.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Risk</p>
                      <p className={`text-sm font-bold ${getRiskColor(item.riskScore)}`}>{getRiskLabel(item.riskScore)}</p>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Health</p>
                        <p className="text-[10px] font-bold">{100 - item.riskScore}%</p>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-700 ${
                            item.riskScore < 30 ? "bg-green-500" : item.riskScore < 60 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${100 - item.riskScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight">Performance Overview</h2>
          <div className="aegis-panel p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">High APY</p>
                <p className="text-2xl font-black text-emerald-500">{topApy}%</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 text-right">Low APY</p>
                <p className="text-2xl font-black text-amber-500 text-right">{lowApy}%</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Total Routed</span>
                <span className="text-sm font-bold">{totalRouted} DOT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Protocol Fees</span>
                <span className="text-sm font-bold">0.15%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Security Layer</span>
                <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">AI-Gated</span>
              </div>
            </div>

            <div className="pt-4">
              <button className="aegis-button aegis-button-primary w-full shadow-lg shadow-primary/20">
                Generate Performance Report
              </button>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-primary text-primary-foreground space-y-3">
            <h3 className="font-bold">Next Rebalance</h3>
            <p className="text-sm opacity-90 leading-relaxed">The AI agent is currently analyzing the latest block data for Paseo Testnet. Rebalancing scheduled in 4h 12m.</p>
            <div className="pt-2">
              <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white w-2/3 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
