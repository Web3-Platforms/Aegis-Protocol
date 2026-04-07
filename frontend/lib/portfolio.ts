export interface PortfolioAmount {
  raw: string;
  display: string;
}

export interface PortfolioUserPosition extends PortfolioAmount {
  shareBps: number;
}

export interface PortfolioAssetPosition {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  userPosition: PortfolioUserPosition;
  vaultPosition: PortfolioAmount;
}

export interface PortfolioSnapshotMetadata {
  chainId: number;
  blockNumber: string;
  observedAt: string;
}

export interface PortfolioSummary {
  supportedAssetCount: number;
  userNonZeroAssetCount: number;
  vaultNonZeroAssetCount: number;
}

export interface PortfolioCoverage {
  source: "live_contract_snapshot";
  supportedAssetsOnly: true;
  limitations: string[];
}

export interface PortfolioPayload {
  snapshot: PortfolioSnapshotMetadata;
  userAddress: string | null;
  assets: PortfolioAssetPosition[];
  summary: PortfolioSummary;
  coverage: PortfolioCoverage;
}

export function createEmptyPortfolioPayload(): PortfolioPayload {
  return {
    snapshot: {
      chainId: 0,
      blockNumber: "0",
      observedAt: new Date(0).toISOString(),
    },
    userAddress: null,
    assets: [],
    summary: {
      supportedAssetCount: 0,
      userNonZeroAssetCount: 0,
      vaultNonZeroAssetCount: 0,
    },
    coverage: {
      source: "live_contract_snapshot",
      supportedAssetsOnly: true,
      limitations: [
        "No pricing, TVL, APY, realized yield, or PnL.",
        "Only configured supported assets are included.",
      ],
    },
  };
}
