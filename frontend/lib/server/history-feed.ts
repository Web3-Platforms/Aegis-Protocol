import { createPublicClient, formatUnits, http, type Hex } from "viem";
import type {
  WalletHistoryAmount,
  WalletHistoryPayload,
  WalletHistoryToken,
} from "@/lib/history";
import {
  AEGIS_VAULT_ABI,
  CONTRACT_ADDRESSES,
  getSupportedTokenByAddress,
} from "@/lib/contracts";
import { AEGIS_CHAIN, AEGIS_RUNTIME } from "@/lib/runtime/environment";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 200_000n;
const DEFAULT_HISTORY_LIMIT = 25;
const MAX_HISTORY_LIMIT = 50;

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

function isConfiguredAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function getVaultAddress(): Hex {
  const vaultAddress = CONTRACT_ADDRESSES.AEGIS_VAULT;
  if (!isConfiguredAddress(vaultAddress)) {
    throw new Error(
      "NEXT_PUBLIC_AEGIS_VAULT_ADDRESS is not configured for the history API."
    );
  }

  return vaultAddress;
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

function parseHistoryLimit(limitParam?: string | null): number {
  if (!limitParam) {
    return DEFAULT_HISTORY_LIMIT;
  }

  if (!/^\d+$/.test(limitParam)) {
    throw new Error("limit must be a positive integer");
  }

  const parsed = Number(limitParam);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function trimFormattedAmount(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, "$1");
}

function buildToken(tokenAddress: Hex): WalletHistoryToken {
  const supportedToken = getSupportedTokenByAddress(tokenAddress);

  return {
    address: tokenAddress,
    symbol: supportedToken?.symbol ?? "UNKNOWN",
    decimals: supportedToken?.decimals ?? 18,
  };
}

function buildOnChainAmount(rawAmount: bigint, token: WalletHistoryToken): WalletHistoryAmount {
  return {
    raw: rawAmount.toString(),
    display: trimFormattedAmount(formatUnits(rawAmount, token.decimals)),
    source: "on_chain",
  };
}

function compareObservedAtDescending(
  left: { observedAt: string },
  right: { observedAt: string }
) {
  return Date.parse(right.observedAt) - Date.parse(left.observedAt);
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

export async function fetchWalletHistory(
  userAddress: Hex,
  limitParam?: string | null
): Promise<WalletHistoryPayload> {
  const limit = parseHistoryLimit(limitParam);
  const vaultAddress = getVaultAddress();
  const publicClient = getPublicClient();
  const currentBlock = await publicClient.getBlockNumber();
  const lookbackBlocks = getActivityLookbackBlocks();
  const fromBlock =
    currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

  const [depositLogs, withdrawalLogs] = await Promise.all([
    publicClient.getLogs({
      address: vaultAddress,
      event: DEPOSIT_EVENT,
      args: { user: userAddress },
      fromBlock,
      toBlock: "latest",
    }),
    publicClient.getLogs({
      address: vaultAddress,
      event: WITHDRAWAL_EVENT,
      args: { user: userAddress },
      fromBlock,
      toBlock: "latest",
    }),
  ]);

  const onChainItems = [...depositLogs, ...withdrawalLogs]
    .map((log) => {
      const tokenAddress = log.args.token;
      const amount = log.args.amount;
      const timestamp = log.args.timestamp;

      if (!tokenAddress || amount === undefined || timestamp === undefined) {
        return null;
      }

      const token = buildToken(tokenAddress);

      return {
        id: `${log.eventName.toLowerCase()}-${log.transactionHash}-${String(log.logIndex)}`,
        kind:
          log.eventName === "Deposit"
            ? ("deposit" as const)
            : ("withdrawal" as const),
        source: "on_chain" as const,
        observedAt: new Date(Number(timestamp * 1000n)).toISOString(),
        createdAt: null,
        token,
        amount: buildOnChainAmount(amount, token),
        status: "confirmed" as const,
        txHash: log.transactionHash,
        requestId: null,
        failureCategory: null,
        retryDisposition: null,
        warnings: [],
      };
    })
    .filter(isDefined);

  const items = onChainItems.sort(compareObservedAtDescending).slice(0, limit);

  return {
    userAddress,
    items,
    summary: {
      returnedItemCount: items.length,
      limit,
    },
    coverage: {
      onChainWindow: {
        fromBlock: fromBlock.toString(),
        indexedThroughBlock: currentBlock.toString(),
        windowLimited: true,
      },
      relayRequests: {
        source: "server_store",
        available: false,
        backend: null,
        limitations: [
          "Private relay-request history is not exposed through this wallet-history API.",
          "Use direct route responses and request-status lookups for operator follow-up instead.",
        ],
      },
      limitations: [
        "This is recent wallet history, not a full archival ledger.",
        "Wallet history does not include per-user XcmRouted outcomes because those logs are not wallet-attributed.",
        "Wallet history intentionally excludes private relay-request records.",
      ],
    },
  };
}
