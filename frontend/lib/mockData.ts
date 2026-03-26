// Mock service for transaction and yield data
// In production, this would read from the blockchain

export interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "yield_routed";
  token: string;
  amount: number;
  timestamp: Date;
  status: "confirmed" | "pending" | "failed";
  txHash: string;
  parachainId?: number;
  riskScore?: number;
}

export interface YieldData {
  parachainId: number;
  parachainName: string;
  amount: number;
  yield: number;
  apy: number;
  riskScore: number;
  routed: boolean;
  timestamp: Date;
}

// Mock transactions
const mockTransactions: Transaction[] = [
  {
    id: "tx_1",
    type: "deposit",
    token: "USDC",
    amount: 100,
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    status: "confirmed",
    txHash: "0x123abc...789def",
  },
  {
    id: "tx_2",
    type: "deposit",
    token: "USDC",
    amount: 500,
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    status: "confirmed",
    txHash: "0x456def...123abc",
  },
  {
    id: "tx_3",
    type: "yield_routed",
    token: "USDC",
    amount: 25,
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
    status: "confirmed",
    txHash: "0x789abc...456def",
    parachainId: 2000,
    riskScore: 45,
  },
  {
    id: "tx_4",
    type: "withdrawal",
    token: "USDC",
    amount: 100,
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    status: "confirmed",
    txHash: "0xabc789...def456",
  },
];

// Mock yield data
const mockYieldData: YieldData[] = [
  {
    parachainId: 2000,
    parachainName: "Acala",
    amount: 25,
    yield: 3.5,
    apy: 12.5,
    riskScore: 45,
    routed: true,
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    parachainId: 2004,
    parachainName: "Moonbeam",
    amount: 50,
    yield: 2.8,
    apy: 10.2,
    riskScore: 38,
    routed: true,
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
];

export async function getTransactions(): Promise<Transaction[]> {
  // Simulate network delay
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTransactions);
    }, 500);
  });
}

export async function getYieldData(): Promise<YieldData[]> {
  // Simulate network delay
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockYieldData);
    }, 500);
  });
}

export async function getTransactionStats() {
  const transactions = await getTransactions();
  
  const totalDeposited = transactions
    .filter((tx) => tx.type === "deposit" && tx.status === "confirmed")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalWithdrawn = transactions
    .filter((tx) => tx.type === "withdrawal" && tx.status === "confirmed")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalYieldRouted = transactions
    .filter((tx) => tx.type === "yield_routed" && tx.status === "confirmed")
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    totalDeposited,
    totalWithdrawn,
    totalYieldRouted,
    transactionCount: transactions.length,
  };
}

export async function getYieldStats() {
  const yields = await getYieldData();

  const totalYield = yields.reduce((sum, y) => sum + y.yield, 0);
  const activeStrategies = yields.filter((y) => y.routed).length;
  const averageAPY =
    yields.length > 0
      ? yields.reduce((sum, y) => sum + y.apy, 0) / yields.length
      : 0;
  const averageRiskScore =
    yields.length > 0
      ? yields.reduce((sum, y) => sum + y.riskScore, 0) / yields.length
      : 0;

  return {
    totalYield,
    activeStrategies,
    averageAPY,
    averageRiskScore,
    yieldCount: yields.length,
  };
}
