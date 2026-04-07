import {
  AEGIS_RUNTIME_ENV,
  isConfiguredAddress,
  resolveAddress,
} from "@/lib/runtime/environment";

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
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "riskScore", type: "uint256" },
      { name: "assetData", type: "bytes" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "YieldRoutedViaXCMWithAssetType",
    inputs: [
      { name: "destParachainId", type: "uint32", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "assetType", type: "uint8", indexed: true },
      { name: "riskScore", type: "uint256" },
      { name: "assetData", type: "bytes" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "XcmRouted",
    inputs: [
      { name: "targetChainId", type: "uint32", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "parachainNonce", type: "uint256", indexed: true },
      { name: "txHash", type: "bytes32" },
      { name: "riskScore", type: "uint256" },
      { name: "assetType", type: "uint8" },
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
  AEGIS_VAULT:
    AEGIS_RUNTIME_ENV === "moonbase-staging"
      ? resolveAddress(
          process.env.NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS,
          "0x0000000000000000000000000000000000000000"
        )
      : resolveAddress(
          process.env.NEXT_PUBLIC_AEGIS_VAULT_ADDRESS,
          "0x0000000000000000000000000000000000000000"
        ),
  MOONBASE_STAGING_VAULT: resolveAddress(
    process.env.NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS,
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
  MOONBASE_STAGING_TOKEN: resolveAddress(
    process.env.NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS,
    "0x0000000000000000000000000000000000000000"
  ),
} as const;

const PASEO_SUPPORTED_TOKENS = [
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

const moonbaseStagingTokenSymbol =
  process.env.NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_SYMBOL?.trim() || "mUSDC";

const MOONBASE_STAGING_SUPPORTED_TOKENS = isConfiguredAddress(
  CONTRACT_ADDRESSES.MOONBASE_STAGING_TOKEN
)
  ? ([
      {
        symbol: moonbaseStagingTokenSymbol,
        name: `${moonbaseStagingTokenSymbol} (staging stable)`,
        address: CONTRACT_ADDRESSES.MOONBASE_STAGING_TOKEN,
        decimals: 6,
        icon: "🧪",
      },
    ] as const)
  : ([] as const);

export const SUPPORTED_TOKENS: readonly {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  icon: string;
}[] =
  AEGIS_RUNTIME_ENV === "moonbase-staging"
    ? MOONBASE_STAGING_SUPPORTED_TOKENS
    : PASEO_SUPPORTED_TOKENS;

export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];
export const HAS_CONFIGURED_VAULT = isConfiguredAddress(
  CONTRACT_ADDRESSES.AEGIS_VAULT
);
export const HAS_CONFIGURED_SUPPORTED_TOKENS = SUPPORTED_TOKENS.length > 0;

export function getSupportedTokenByAddress(
  address: string | null | undefined
): SupportedToken | undefined {
  if (!address) {
    return undefined;
  }

  return SUPPORTED_TOKENS.find(
    (token) => token.address.toLowerCase() === address.toLowerCase()
  );
}
