"use client";

import { useAccount } from "wagmi";
import { useVaultPortfolioData } from "@/lib/useVaultPortfolioData";

export function VaultStats() {
  const { isConnected } = useAccount();
  const { assets, errorMessage, isLoading } = useVaultPortfolioData();

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
          <p className="text-sm font-semibold">Portfolio snapshot unavailable</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">{errorMessage}</p>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="aegis-panel p-6 overflow-hidden relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Your Current Positions</h2>
            <p className="text-sm text-muted-foreground">
              Server-owned snapshot of supported vault assets for the connected wallet
            </p>
          </div>
          <span className={`aegis-badge ${isConnected ? "aegis-badge-success" : "aegis-badge-brand"}`}>
            {isConnected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <div className="space-y-4">
          {assets.map((asset) => (
            <div key={asset.tokenAddress} className="flex items-center justify-between p-4 rounded-xl border bg-secondary/30 transition-colors hover:bg-secondary/50">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold">{asset.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    Share: {(asset.userPosition.shareBps / 100).toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{asset.userPosition.display}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="aegis-panel p-8 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!isConnected && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Connect your wallet to see your current positions
              </p>
            </div>
          )}
          {!isLoading && !errorMessage && assets.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No supported assets are configured for this runtime yet.
              </p>
            </div>
          )}
        </div>
      </article>

        <article className="aegis-panel p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Total Beta Vault Deposits</h2>
            <p className="text-sm text-muted-foreground">
              Server-owned snapshot of on-chain deposit balances by supported beta asset
            </p>
          </div>
          <span className="aegis-badge aegis-badge-brand">Server snapshot</span>
        </div>

        <div className="space-y-4">
          {assets.map((asset) => (
            <div key={asset.tokenAddress} className="p-4 rounded-xl border bg-secondary/30 transition-colors hover:bg-secondary/50">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">{asset.symbol}</p>
                <p className="text-lg font-bold">{asset.vaultPosition.display}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Current on-chain total in the beta vault.
              </p>
            </div>
          ))}
          {isLoading && (
            <div className="aegis-panel p-8 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!isLoading && !errorMessage && assets.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Vault totals will appear after this runtime has supported assets configured.
              </p>
            </div>
          )}
        </div>
        </article>
      </section>
    </div>
  );
}
