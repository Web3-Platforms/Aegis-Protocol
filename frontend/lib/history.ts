export const WALLET_HISTORY_KINDS = [
  "deposit",
  "withdrawal",
] as const;

export type WalletHistoryKind = (typeof WALLET_HISTORY_KINDS)[number];

export type WalletHistoryStatus =
  | "confirmed";

export interface WalletHistoryToken {
  address: string;
  symbol: string;
  decimals: number;
}

export interface WalletHistoryAmount {
  raw: string | null;
  display: string | null;
  source: "on_chain" | "requested_input" | "submitted_raw" | "none";
}

export interface WalletHistoryItem {
  id: string;
  kind: WalletHistoryKind;
  source: "on_chain" | "relay_store";
  observedAt: string;
  createdAt: string | null;
  token: WalletHistoryToken | null;
  amount: WalletHistoryAmount;
  status: WalletHistoryStatus;
  txHash: string | null;
  requestId: string | null;
  failureCategory: string | null;
  retryDisposition: string | null;
  warnings: string[];
}

export interface WalletHistoryCoverage {
  onChainWindow: {
    fromBlock: string;
    indexedThroughBlock: string;
    windowLimited: true;
  };
  relayRequests: {
    source: "server_store";
    available: boolean;
    backend: "file" | "postgres" | null;
    limitations: string[];
  };
  limitations: string[];
}

export interface WalletHistorySummary {
  returnedItemCount: number;
  limit: number;
}

export interface WalletHistoryPayload {
  userAddress: string | null;
  items: WalletHistoryItem[];
  summary: WalletHistorySummary;
  coverage: WalletHistoryCoverage;
}

export function createEmptyWalletHistoryPayload(): WalletHistoryPayload {
  return {
    userAddress: null,
    items: [],
    summary: {
      returnedItemCount: 0,
      limit: 0,
    },
    coverage: {
      onChainWindow: {
        fromBlock: "0",
        indexedThroughBlock: "0",
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
