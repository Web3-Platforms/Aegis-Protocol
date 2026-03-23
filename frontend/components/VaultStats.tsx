"use client";

import { useAccount, useReadContract } from "wagmi";
import { AEGIS_VAULT_ABI, CONTRACT_ADDRESSES, SUPPORTED_TOKENS } from "@/lib/contracts";

export function VaultStats() {
  const { address, isConnected } = useAccount();

  const vaultStats = SUPPORTED_TOKENS.map((token) => {
    const { data: totalDeposits } = useReadContract({
      address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
      abi: AEGIS_VAULT_ABI,
      functionName: "totalDeposits",
      args: [token.address as `0x${string}`],
    });

    const { data: userDeposit } = useReadContract({
      address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
      abi: AEGIS_VAULT_ABI,
      functionName: "getUserDeposit",
      args: address ? [address, token.address as `0x${string}`] : undefined,
      query: { enabled: !!address },
    });

    const normalizedTotal = totalDeposits ? Number(totalDeposits) / Math.pow(10, token.decimals) : 0;
    const normalizedUser = userDeposit ? Number(userDeposit) / Math.pow(10, token.decimals) : 0;

    return {
      token,
      totalDeposits: normalizedTotal,
      userDeposit: normalizedUser,
      userShare: normalizedTotal > 0 ? (normalizedUser / normalizedTotal) * 100 : 0,
    };
  });

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <article className="aegis-panel p-6 overflow-hidden relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Your Deposits</h2>
            <p className="text-sm text-muted-foreground">Managing your assets in the vault</p>
          </div>
          <span className={`aegis-badge ${isConnected ? "aegis-badge-success" : "aegis-badge-brand"}`}>
            {isConnected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <div className="space-y-4">
          {vaultStats.map((stat) => (
            <div key={stat.token.address} className="flex items-center justify-between p-4 rounded-xl border bg-secondary/30 transition-colors hover:bg-secondary/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{stat.token.icon}</span>
                <div>
                  <p className="font-semibold">{stat.token.symbol}</p>
                  <p className="text-xs text-muted-foreground">Share: {stat.userShare.toFixed(2)}%</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{stat.userDeposit.toFixed(4)}</p>
              </div>
            </div>
          ))}
          {!isConnected && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Connect your wallet to see your deposits</p>
            </div>
          )}
        </div>
      </article>

      <article className="aegis-panel p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Total Vault TVL</h2>
            <p className="text-sm text-muted-foreground">Protocol-wide liquidity metrics</p>
          </div>
          <span className="aegis-badge aegis-badge-brand">Real-time</span>
        </div>

        <div className="space-y-4">
          {vaultStats.map((stat) => (
            <div key={stat.token.address} className="p-4 rounded-xl border bg-secondary/30 transition-colors hover:bg-secondary/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{stat.token.icon}</span>
                  <p className="font-semibold">{stat.token.symbol}</p>
                </div>
                <p className="text-lg font-bold">{stat.totalDeposits.toFixed(2)}</p>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500" 
                  style={{ width: `${Math.min(stat.totalDeposits / 1000 * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
