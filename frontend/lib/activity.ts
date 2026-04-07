export interface ActivityTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "route_event";
  token: string;
  tokenAddress: string;
  amount: number;
  timestamp: string;
  status: "confirmed";
  txHash: string;
  parachainId?: number;
  riskScore?: number;
  parachainNonce?: number;
  assetType?: number;
}

export interface ActivityRouteGroup {
  id: string;
  parachainId: number;
  parachainName: string;
  token: string;
  tokenAddress: string;
  amount: number;
  riskScore: number;
  timestamp: string;
  routeCount: number;
}

export interface ActivityStats {
  totalDeposited: number;
  totalWithdrawn: number;
  totalRouteEventAmount: number;
  transactionCount: number;
  routeGroupCount: number;
  averageRiskScore: number;
}

export interface VaultActivityPayload {
  transactions: ActivityTransaction[];
  routeGroups: ActivityRouteGroup[];
  stats: ActivityStats;
  indexedThroughBlock: string;
  fromBlock: string;
}

export function getParachainName(parachainId: number): string {
  const names: Record<number, string> = {
    1000: "Paseo Asset Hub",
    2000: "Acala",
    2001: "Astar",
    2004: "Moonbeam",
  };

  return names[parachainId] ?? `Parachain ${parachainId}`;
}

export function createEmptyActivityStats(): ActivityStats {
  return {
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalRouteEventAmount: 0,
    transactionCount: 0,
    routeGroupCount: 0,
    averageRiskScore: 0,
  };
}

export function createEmptyVaultActivityPayload(): VaultActivityPayload {
  return {
    transactions: [],
    routeGroups: [],
    stats: createEmptyActivityStats(),
    indexedThroughBlock: "0",
    fromBlock: "0",
  };
}
