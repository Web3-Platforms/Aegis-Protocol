import { createPublicClient, formatUnits, http, type Hex } from "viem";
import {
  AEGIS_VAULT_ABI,
  CONTRACT_ADDRESSES,
  SUPPORTED_TOKENS,
} from "@/lib/contracts";
import { AEGIS_CHAIN, AEGIS_RUNTIME } from "@/lib/runtime/environment";
import type {
  PortfolioAssetPosition,
  PortfolioPayload,
} from "@/lib/portfolio";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isConfiguredAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function getPublicClient() {
  return createPublicClient({
    chain: AEGIS_CHAIN as Parameters<typeof createPublicClient>[0]["chain"],
    transport: http(AEGIS_RUNTIME.rpcUrl),
  });
}

function trimFormattedAmount(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, "$1");
}

function formatDisplayAmount(rawAmount: bigint, decimals: number): string {
  return trimFormattedAmount(formatUnits(rawAmount, decimals));
}

function getVaultAddress(): Hex {
  const vaultAddress = CONTRACT_ADDRESSES.AEGIS_VAULT;
  if (!isConfiguredAddress(vaultAddress)) {
    throw new Error(
      "NEXT_PUBLIC_AEGIS_VAULT_ADDRESS is not configured for the portfolio API."
    );
  }

  return vaultAddress;
}

function buildAssetPosition(input: {
  tokenAddress: Hex;
  symbol: string;
  decimals: number;
  userAmount: bigint;
  vaultAmount: bigint;
}): PortfolioAssetPosition {
  const shareBps =
    input.vaultAmount > 0n
      ? Number((input.userAmount * 10_000n) / input.vaultAmount)
      : 0;

  return {
    tokenAddress: input.tokenAddress,
    symbol: input.symbol,
    decimals: input.decimals,
    userPosition: {
      raw: input.userAmount.toString(),
      display: formatDisplayAmount(input.userAmount, input.decimals),
      shareBps,
    },
    vaultPosition: {
      raw: input.vaultAmount.toString(),
      display: formatDisplayAmount(input.vaultAmount, input.decimals),
    },
  };
}

export async function fetchVaultPortfolioSnapshot(
  userAddress?: Hex
): Promise<PortfolioPayload> {
  const publicClient = getPublicClient();
  const vaultAddress = getVaultAddress();
  const [blockNumber, assets] = await Promise.all([
    publicClient.getBlockNumber(),
    Promise.all(
      SUPPORTED_TOKENS.map(async (token) => {
        const [vaultAmount, userAmount] = await Promise.all([
          publicClient.readContract({
            address: vaultAddress,
            abi: AEGIS_VAULT_ABI,
            functionName: "totalDeposits",
            args: [token.address as Hex],
          }) as Promise<bigint>,
          userAddress
            ? (publicClient.readContract({
                address: vaultAddress,
                abi: AEGIS_VAULT_ABI,
                functionName: "getUserDeposit",
                args: [userAddress, token.address as Hex],
              }) as Promise<bigint>)
            : Promise.resolve(0n),
        ]);

        return buildAssetPosition({
          tokenAddress: token.address as Hex,
          symbol: token.symbol,
          decimals: token.decimals,
          userAmount,
          vaultAmount,
        });
      })
    ),
  ]);

  return {
    snapshot: {
      chainId: AEGIS_CHAIN.id,
      blockNumber: blockNumber.toString(),
      observedAt: new Date().toISOString(),
    },
    userAddress: userAddress ?? null,
    assets,
    summary: {
      supportedAssetCount: assets.length,
      userNonZeroAssetCount: assets.filter(
        (asset) => asset.userPosition.raw !== "0"
      ).length,
      vaultNonZeroAssetCount: assets.filter(
        (asset) => asset.vaultPosition.raw !== "0"
      ).length,
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
