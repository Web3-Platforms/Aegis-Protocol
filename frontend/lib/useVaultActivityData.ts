"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseAbiItem } from "viem";
import { CONTRACT_ADDRESSES } from "@/lib/contracts";

export interface ActivityTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "yield_routed";
  token: string;
  amount: number;
  timestamp: Date;
  status: "confirmed";
  txHash: string;
  parachainId?: number;
  riskScore?: number;
}

export interface ActivityYield {
  parachainId: number;
  parachainName: string;
  amount: number;
  yield: number;
  apy: number;
  riskScore: number;
  routed: boolean;
  timestamp: Date;
}

export interface ActivityStats {
  totalDeposited: number;
  totalWithdrawn: number;
  totalYieldRouted: number;
  transactionCount: number;
  activeStrategies: number;
  averageRiskScore: number;
}

function getParachainName(parachainId: number): string {
  const names: Record<number, string> = {
    1000: "Paseo Asset Hub",
    2000: "Acala",
    2001: "Astar",
    2004: "Moonbeam",
  };
  return names[parachainId] ?? `Parachain ${parachainId}`;
}

export function useVaultActivityData() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<ActivityTransaction[]>([]);
  const [yields, setYields] = useState<ActivityYield[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!publicClient) return;
      setIsLoading(true);
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock =
          currentBlock > 200_000n ? currentBlock - 200_000n : 0n;

        const vaultAddress = CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`;
        const userAddress = address as `0x${string}` | undefined;

        const [depositLogs, withdrawalLogs, routedLogs] = await Promise.all([
          publicClient.getLogs({
            address: vaultAddress,
            event: parseAbiItem(
              "event Deposit(address indexed user, address indexed token, uint256 amount, uint256 timestamp)"
            ),
            args: userAddress ? { user: userAddress } : undefined,
            fromBlock,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: vaultAddress,
            event: parseAbiItem(
              "event Withdrawal(address indexed user, address indexed token, uint256 amount, uint256 timestamp)"
            ),
            args: userAddress ? { user: userAddress } : undefined,
            fromBlock,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: vaultAddress,
            event: parseAbiItem(
              "event YieldRoutedViaXCM(uint32 indexed destParachainId, uint256 amount, uint256 riskScore, uint256 timestamp)"
            ),
            fromBlock,
            toBlock: "latest",
          }),
        ]);

        const depositTxs: ActivityTransaction[] = depositLogs.map((log, idx) => ({
          id: `dep-${log.transactionHash}-${idx}`,
          type: "deposit",
          token: "USDC",
          amount: Number(formatUnits(log.args.amount ?? 0n, 6)),
          timestamp: new Date(Number((log.args.timestamp ?? 0n) * 1000n)),
          status: "confirmed",
          txHash: log.transactionHash,
        }));

        const withdrawalTxs: ActivityTransaction[] = withdrawalLogs.map(
          (log, idx) => ({
            id: `wd-${log.transactionHash}-${idx}`,
            type: "withdrawal",
            token: "USDC",
            amount: Number(formatUnits(log.args.amount ?? 0n, 6)),
            timestamp: new Date(Number((log.args.timestamp ?? 0n) * 1000n)),
            status: "confirmed",
            txHash: log.transactionHash,
          })
        );

        const routeTxs: ActivityTransaction[] = routedLogs.map((log, idx) => ({
          id: `route-${log.transactionHash}-${idx}`,
          type: "yield_routed",
          token: "USDC",
          amount: Number(formatUnits(log.args.amount ?? 0n, 6)),
          timestamp: new Date(Number((log.args.timestamp ?? 0n) * 1000n)),
          status: "confirmed",
          txHash: log.transactionHash,
          parachainId: Number(log.args.destParachainId ?? 0),
          riskScore: Number(log.args.riskScore ?? 0),
        }));

        // When wallet isn't connected we still display global routed events,
        // but deposit/withdraw data is wallet-scoped by args filter above.
        const merged = [...depositTxs, ...withdrawalTxs, ...routeTxs].sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );

        const routeYields: ActivityYield[] = routeTxs.map((tx) => ({
          parachainId: tx.parachainId ?? 0,
          parachainName: getParachainName(tx.parachainId ?? 0),
          amount: tx.amount,
          // True APY/yield requires indexer + pricing; keep explicit zeros for now.
          yield: 0,
          apy: 0,
          riskScore: tx.riskScore ?? 0,
          routed: true,
          timestamp: tx.timestamp,
        }));

        if (!active) return;
        setTransactions(merged);
        setYields(routeYields);
      } catch (error) {
        if (!active) return;
        setTransactions([]);
        setYields([]);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [publicClient, address]);

  const stats: ActivityStats = useMemo(() => {
    const totalDeposited = transactions
      .filter((tx) => tx.type === "deposit")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalWithdrawn = transactions
      .filter((tx) => tx.type === "withdrawal")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalYieldRouted = transactions
      .filter((tx) => tx.type === "yield_routed")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const averageRiskScore =
      yields.length > 0
        ? yields.reduce((sum, y) => sum + y.riskScore, 0) / yields.length
        : 0;

    return {
      totalDeposited,
      totalWithdrawn,
      totalYieldRouted,
      transactionCount: transactions.length,
      activeStrategies: yields.length,
      averageRiskScore,
    };
  }, [transactions, yields]);

  return {
    isLoading,
    transactions,
    yields,
    stats,
    routedAssetAddress: CONTRACT_ADDRESSES.USDC,
    destinationParachainId: 1000,
    destinationVaultAddress:
      process.env.NEXT_PUBLIC_DESTINATION_VAULT_ADDRESS ??
      "0x9a23A24B7F16d82C75E613bC1ebE9dBEf228d4E6",
  };
}

