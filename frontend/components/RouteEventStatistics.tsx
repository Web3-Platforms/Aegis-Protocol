"use client";

import type { ActivityRouteGroup, ActivityStats } from "@/lib/activity";

interface RouteEventStatisticsProps {
  routeGroups: ActivityRouteGroup[];
  stats: ActivityStats;
  isLoading: boolean;
  errorMessage?: string | null;
}

function getRiskColor(risk: number) {
  if (risk < 30) return "text-green-600 dark:text-green-400";
  if (risk < 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getRiskLabel(risk: number) {
  if (risk < 30) return "Low";
  if (risk < 60) return "Medium";
  return "High";
}

function formatObservedAt(timestamp: string | null) {
  if (!timestamp) {
    return "No route events yet";
  }

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RouteEventStatistics({
  routeGroups,
  stats,
  isLoading,
  errorMessage = null,
}: RouteEventStatisticsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="aegis-panel h-32 animate-pulse bg-secondary/20" />
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <section className="space-y-6">
        <div className="aegis-panel p-4 bg-amber-50/50 border border-amber-200/50 text-amber-900 dark:text-amber-200">
          Route-event statistics are temporarily unavailable because the activity API could not be loaded. This page does not fall back to zero-like values during an API failure.
        </div>
        <div className="aegis-panel py-12 text-center text-muted-foreground">
          Route event breakdown is unavailable until the activity API recovers.
        </div>
      </section>
    );
  }

  const latestObservedRoute = routeGroups[0]?.timestamp ?? null;

  return (
    <section className="space-y-8">
      <div className="aegis-panel p-4 bg-amber-50/50 border border-amber-200/50 text-amber-900 dark:text-amber-200">
        Source: indexed source-chain `XcmRouted` events. These cards show route-event visibility only; APY, realized yield, fees, and destination-chain delivery proof remain unavailable.
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="aegis-panel p-6 border-l-4 border-l-primary">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Route Event Amount
          </p>
          <p className="text-3xl font-extrabold">
            {stats.totalRouteEventAmount.toFixed(2)}{" "}
            <span className="text-sm font-medium text-muted-foreground">units</span>
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>Indexed source-chain amount only</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-indigo-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Route Groups
          </p>
          <p className="text-3xl font-extrabold">{stats.routeGroupCount}</p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>Grouped by destination and asset</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-amber-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Average Risk Gate
          </p>
          <p className={`text-3xl font-extrabold ${getRiskColor(stats.averageRiskScore)}`}>
            {stats.averageRiskScore.toFixed(0)}
            <span className="text-sm font-medium opacity-70">/100</span>
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>{getRiskLabel(stats.averageRiskScore)} prototype score from route events</span>
          </div>
        </div>

        <div className="aegis-panel p-6 border-l-4 border-l-emerald-500">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Proof Scope
          </p>
          <p className="text-3xl font-extrabold">Source only</p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <span>Destination delivery not proven here</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Route Event Breakdown</h2>

          {routeGroups.length === 0 ? (
            <div className="aegis-panel py-12 text-center text-muted-foreground">
              No route events observed yet.
            </div>
          ) : (
            <div className="space-y-4">
              {routeGroups.map((item) => (
                <div
                  key={item.id}
                  className="aegis-panel p-5 group transition-all hover:border-primary/30"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                        {item.parachainName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{item.parachainName}</h3>
                        <p className="text-xs text-muted-foreground">
                          Chain ID: {item.parachainId} · Asset: {item.token}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end">
                      <p className="text-xl font-bold text-primary">
                        {item.amount.toFixed(2)} units
                      </p>
                      <p className="text-xs text-muted-foreground font-bold">
                        {item.routeCount} indexed route event
                        {item.routeCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Latest Observed
                      </p>
                      <p className="text-sm font-bold">{formatObservedAt(item.timestamp)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Risk Band
                      </p>
                      <p className={`text-sm font-bold ${getRiskColor(item.riskScore)}`}>
                        {getRiskLabel(item.riskScore)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Risk Score
                      </p>
                      <p className={`text-sm font-bold ${getRiskColor(item.riskScore)}`}>
                        {item.riskScore.toFixed(0)}/100
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight">Event Data Overview</h2>
          <div className="aegis-panel p-6 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                  Route Groups
                </p>
                <p className="text-2xl font-black text-emerald-500">
                  {stats.routeGroupCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 text-right">
                  Avg Risk Gate
                </p>
                <p className="text-2xl font-black text-amber-500 text-right">
                  {stats.averageRiskScore.toFixed(0)}/100
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Total Route Event Amount
                </span>
                <span className="text-sm font-bold">
                  {stats.totalRouteEventAmount.toFixed(2)} units
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Latest Indexed Route
                </span>
                <span className="text-sm font-bold text-right">
                  {formatObservedAt(latestObservedRoute)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Data Coverage
                </span>
                <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  Indexed beta
                </span>
              </div>
            </div>

            <div className="pt-4 rounded-xl bg-secondary/30 px-4 py-3 text-xs font-medium text-muted-foreground">
              APY, realized yield, fees, and destination-side execution analytics are not live in this beta.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-primary text-primary-foreground space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">Delivery Scope</h3>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                Limited
              </span>
            </div>
            <p className="text-sm opacity-90 leading-relaxed">
              This page summarizes source-chain route events only. Cross-chain delivery, destination execution, and rebalancing remain outside the current beta proof surface.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
