import { createPublicClient, formatUnits, http, type Hex } from "viem";
import {
  createEmptyActivityStats,
  getParachainName,
  type ActivityStats,
  type ActivityRouteGroup,
  type ActivityTransaction,
  type VaultActivityPayload,
} from "@/lib/activity";
import {
  AEGIS_VAULT_ABI,
  CONTRACT_ADDRESSES,
  getSupportedTokenByAddress,
} from "@/lib/contracts";
import { AEGIS_CHAIN, AEGIS_RUNTIME } from "@/lib/runtime/environment";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 200_000n;

type VaultAbiItem = (typeof AEGIS_VAULT_ABI)[number];
type VaultEventName = Extract<VaultAbiItem, { type: "event" }>["name"];

function getVaultEvent<Name extends VaultEventName>(
  name: Name
): Extract<VaultAbiItem, { type: "event"; name: Name }> {
  const event = AEGIS_VAULT_ABI.find(
    (
      item
    ): item is Extract<VaultAbiItem, { type: "event"; name: Name }> =>
      item.type === "event" && item.name === name
  );

  if (!event) {
    throw new Error(`Missing ${name} event in AEGIS_VAULT_ABI`);
  }

  return event;
}

const DEPOSIT_EVENT = getVaultEvent("Deposit");
const WITHDRAWAL_EVENT = getVaultEvent("Withdrawal");
const XCM_ROUTED_EVENT = getVaultEvent("XcmRouted");

function isConfiguredAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function getPublicClient() {
  return createPublicClient({
    chain: AEGIS_CHAIN as Parameters<typeof createPublicClient>[0]["chain"],
    transport: http(AEGIS_RUNTIME.rpcUrl),
  });
}

function getActivityLookbackBlocks(): bigint {
  const configured = process.env.ACTIVITY_INDEX_LOOKBACK_BLOCKS?.trim();
  if (!configured) {
    return DEFAULT_ACTIVITY_LOOKBACK_BLOCKS;
  }

  if (!/^\d+$/.test(configured)) {
    throw new Error("ACTIVITY_INDEX_LOOKBACK_BLOCKS must be a positive integer");
  }

  const parsed = BigInt(configured);
  return parsed > 0n ? parsed : DEFAULT_ACTIVITY_LOOKBACK_BLOCKS;
}

function getTokenPresentation(tokenAddress: Hex) {
  const supportedToken = getSupportedTokenByAddress(tokenAddress);

  return {
    symbol: supportedToken?.symbol ?? "UNKNOWN",
    decimals: supportedToken?.decimals ?? 18,
  };
}

function normalizeAmount(amount: bigint, tokenAddress: Hex): number {
  const { decimals } = getTokenPresentation(tokenAddress);
  return Number(formatUnits(amount, decimals));
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function buildStats(
  transactions: ActivityTransaction[],
  routeGroups: ActivityRouteGroup[]
): ActivityStats {
  const totalDeposited = transactions
    .filter((tx) => tx.type === "deposit")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalWithdrawn = transactions
    .filter((tx) => tx.type === "withdrawal")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalRouteEventAmount = transactions
    .filter((tx) => tx.type === "route_event")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const routeTransactions = transactions.filter((tx) => tx.type === "route_event");
  const averageRiskScore =
    routeTransactions.length > 0
      ? routeTransactions.reduce((sum, tx) => sum + (tx.riskScore ?? 0), 0) /
        routeTransactions.length
      : 0;

  return {
    totalDeposited,
    totalWithdrawn,
    totalRouteEventAmount,
    transactionCount: transactions.length,
    routeGroupCount: routeGroups.length,
    averageRiskScore,
  };
}

function buildRouteGroups(
  routeTransactions: ActivityTransaction[]
): ActivityRouteGroup[] {
  const grouped = new Map<
    string,
    {
      parachainId: number;
      token: string;
      tokenAddress: string;
      totalAmount: number;
      totalRiskScore: number;
      routeCount: number;
      latestTimestamp: string;
    }
  >();

  for (const transaction of routeTransactions) {
    const parachainId = transaction.parachainId ?? 0;
    const key = `${parachainId}:${transaction.tokenAddress.toLowerCase()}`;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        parachainId,
        token: transaction.token,
        tokenAddress: transaction.tokenAddress,
        totalAmount: transaction.amount,
        totalRiskScore: transaction.riskScore ?? 0,
        routeCount: 1,
        latestTimestamp: transaction.timestamp,
      });
      continue;
    }

    grouped.set(key, {
      ...current,
      totalAmount: current.totalAmount + transaction.amount,
      totalRiskScore: current.totalRiskScore + (transaction.riskScore ?? 0),
      routeCount: current.routeCount + 1,
      latestTimestamp:
        Date.parse(transaction.timestamp) > Date.parse(current.latestTimestamp)
          ? transaction.timestamp
          : current.latestTimestamp,
    });
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      id: key,
      parachainId: value.parachainId,
      parachainName: getParachainName(value.parachainId),
      token: value.token,
      tokenAddress: value.tokenAddress,
      amount: value.totalAmount,
      riskScore: value.totalRiskScore / value.routeCount,
      timestamp: value.latestTimestamp,
      routeCount: value.routeCount,
    }))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

export async function fetchVaultActivityData(
  userAddress?: Hex,
  options?: { includeGlobalRoutes?: boolean }
): Promise<VaultActivityPayload> {
  const vaultAddress = CONTRACT_ADDRESSES.AEGIS_VAULT;
  const includeGlobalRoutes = options?.includeGlobalRoutes ?? true;

  if (!isConfiguredAddress(vaultAddress)) {
    throw new Error(
      "NEXT_PUBLIC_AEGIS_VAULT_ADDRESS is not configured for the activity API."
    );
  }

  const publicClient = getPublicClient();
  const currentBlock = await publicClient.getBlockNumber();
  const lookbackBlocks = getActivityLookbackBlocks();
  const fromBlock =
    currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

  const [depositLogs, withdrawalLogs, xcmRoutedLogs] = await Promise.all([
    publicClient.getLogs({
      address: vaultAddress,
      event: DEPOSIT_EVENT,
      args: userAddress ? { user: userAddress } : undefined,
      fromBlock,
      toBlock: "latest",
    }),
    publicClient.getLogs({
      address: vaultAddress,
      event: WITHDRAWAL_EVENT,
      args: userAddress ? { user: userAddress } : undefined,
      fromBlock,
      toBlock: "latest",
    }),
    includeGlobalRoutes
      ? publicClient.getLogs({
          address: vaultAddress,
          event: XCM_ROUTED_EVENT,
          fromBlock,
          toBlock: "latest",
        })
      : Promise.resolve([]),
  ]);

  const depositTransactions = depositLogs
    .map((log) => {
      const tokenAddress = log.args.token;
      const amount = log.args.amount;
      const timestamp = log.args.timestamp;

      if (!tokenAddress || amount === undefined || timestamp === undefined) {
        return null;
      }

      const { symbol } = getTokenPresentation(tokenAddress);

      return {
        id: `dep-${log.transactionHash}-${String(log.logIndex)}`,
        type: "deposit" as const,
        token: symbol,
        tokenAddress,
        amount: normalizeAmount(amount, tokenAddress),
        timestamp: new Date(Number(timestamp * 1000n)).toISOString(),
        status: "confirmed" as const,
        txHash: log.transactionHash,
      };
    })
    .filter(isDefined);

  const withdrawalTransactions = withdrawalLogs
    .map((log) => {
      const tokenAddress = log.args.token;
      const amount = log.args.amount;
      const timestamp = log.args.timestamp;

      if (!tokenAddress || amount === undefined || timestamp === undefined) {
        return null;
      }

      const { symbol } = getTokenPresentation(tokenAddress);

      return {
        id: `wd-${log.transactionHash}-${String(log.logIndex)}`,
        type: "withdrawal" as const,
        token: symbol,
        tokenAddress,
        amount: normalizeAmount(amount, tokenAddress),
        timestamp: new Date(Number(timestamp * 1000n)).toISOString(),
        status: "confirmed" as const,
        txHash: log.transactionHash,
      };
    })
    .filter(isDefined);

  const routeTransactions = xcmRoutedLogs
    .map((log) => {
      const tokenAddress = log.args.token;
      const amount = log.args.amount;
      const timestamp = log.args.timestamp;
      const parachainId = log.args.targetChainId;
      const riskScore = log.args.riskScore;
      const parachainNonce = log.args.parachainNonce;
      const assetType = log.args.assetType;

      if (
        !tokenAddress ||
        amount === undefined ||
        timestamp === undefined ||
        parachainId === undefined ||
        riskScore === undefined ||
        parachainNonce === undefined ||
        assetType === undefined
      ) {
        return null;
      }

      const { symbol } = getTokenPresentation(tokenAddress);

      return {
        id: `route-${log.transactionHash}-${String(log.logIndex)}`,
        type: "route_event" as const,
        token: symbol,
        tokenAddress,
        amount: normalizeAmount(amount, tokenAddress),
        timestamp: new Date(Number(timestamp * 1000n)).toISOString(),
        status: "confirmed" as const,
        txHash: log.transactionHash,
        parachainId: Number(parachainId),
        riskScore: Number(riskScore),
        parachainNonce: Number(parachainNonce),
        assetType: Number(assetType),
      };
    })
    .filter(isDefined);

  const transactions = [
    ...depositTransactions,
    ...withdrawalTransactions,
    ...routeTransactions,
  ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

  const routeGroups = buildRouteGroups(routeTransactions);
  const stats = buildStats(transactions, routeGroups);

  return {
    transactions,
    routeGroups,
    stats: stats ?? createEmptyActivityStats(),
    indexedThroughBlock: currentBlock.toString(),
    fromBlock: fromBlock.toString(),
  };
}
