const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function resolveAddress(
  value: string | undefined,
  fallback: `0x${string}`
): `0x${string}` {
  return value && ADDRESS_PATTERN.test(value)
    ? (value as `0x${string}`)
    : fallback;
}

// Contract configuration for Aegis Vault
export const AEGIS_VAULT_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "initialOwner", type: "address" },
      { name: "initialAiOracle", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAIOracleAddress",
    inputs: [{ name: "newOracleAddress", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addSupportedToken",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "routeYieldViaXCM",
    inputs: [
      { name: "destParachainId", type: "uint32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "aiRiskScore", type: "uint256" },
      { name: "assetData", type: "bytes" },
      { name: "feeAssetItem", type: "uint32" },
      { name: "weightLimit", type: "uint64" },
      { name: "assetType", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getTotalRoutedByAssetType",
    inputs: [
      { name: "token", type: "address" },
      { name: "assetType", type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setRouteCapByAssetType",
    inputs: [
      { name: "token", type: "address" },
      { name: "assetType", type: "uint8" },
      { name: "cap", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalRoutedByAssetType",
    inputs: [
      { type: "address" },
      { type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "routeCapsByAssetType",
    inputs: [
      { type: "address" },
      { type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setXCMPrecompileAddress",
    inputs: [{ name: "newXCMPrecompile", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "xcmPrecompileAddress",
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTotalRouted",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultBalance",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserDeposit",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "aiOracleAddress",
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "supportedTokens",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "userDeposits",
    inputs: [
      { type: "address" },
      { type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalDeposits",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_RISK_SCORE",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "YieldRoutedViaXCM",
    inputs: [
      { name: "destParachainId", type: "uint32", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "riskScore", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "AIOracleUpdated",
    inputs: [{ name: "newOracleAddress", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "TokenSupported",
    inputs: [{ name: "token", type: "address", indexed: true }],
  },
] as const;

// Minimal ERC-20 ABI for balance checks and approval flow
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// Contract addresses are loaded from NEXT_PUBLIC_* env vars for deployment.
// Fallbacks keep local UI development usable before real Paseo addresses exist.
export const CONTRACT_ADDRESSES = {
  AEGIS_VAULT: resolveAddress(
    process.env.NEXT_PUBLIC_AEGIS_VAULT_ADDRESS,
    "0x0000000000000000000000000000000000000000"
  ),
  // MVP Option A tokens (mock EVM addresses by design)
  WPAS: resolveAddress(
    process.env.NEXT_PUBLIC_WPAS_ADDRESS,
    "0x0000000000000000000000000000000000000000"
  ),
  USDC: resolveAddress(
    process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS ??
      process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS,
    "0x0000000000000000000000000000000000000000"
  ),
} as const;

// Supported tokens for deposit/withdrawal
export const SUPPORTED_TOKENS = [
  {
    symbol: "wPAS",
    name: "Wrapped PAS",
    address: CONTRACT_ADDRESSES.WPAS,
    decimals: 10,
    icon: "🟪",
  },
  {
    symbol: "USDC",
    name: "test-USDC (MVP token)",
    address: CONTRACT_ADDRESSES.USDC,
    decimals: 6,
    icon: "💳",
  },
] as const;
