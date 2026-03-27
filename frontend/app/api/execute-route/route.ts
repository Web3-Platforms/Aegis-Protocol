import { NextResponse } from "next/server";
import { http, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AEGIS_VAULT_ABI, CONTRACT_ADDRESSES } from "@/lib/contracts";
import { 
  encodeAssetDataForXCM, 
  AssetType
} from "@/lib/xcm-encoder";

const PAS_RPC_URL =
  process.env.NEXT_PUBLIC_PASEO_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";

// Mirror the chain config used by the frontend wagmi provider.
const paseoTestnet = {
  id: 420420417,
  name: "Paseo Testnet",
  network: "paseo-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Paseo",
    symbol: "PAS",
  },
  rpcUrls: {
    default: { http: [PAS_RPC_URL] },
    public: { http: [PAS_RPC_URL] },
  },
} as const;

function computeRiskScore(intent: string) {
  const normalizedIntent = String(intent ?? "").toLowerCase();
  const looksHighRisk =
    normalizedIntent.includes("leverage") ||
    normalizedIntent.includes("unsafe") ||
    normalizedIntent.includes("degen") ||
    normalizedIntent.includes("100x");

  // Contract enforces aiRiskScore < 75.
  return looksHighRisk ? 88 : 42;
}

/**
 * Encode asset data for XCM transfer using dynamic encoder
 * This creates a proper MultiAsset encoding for the XCM precompile
 * Supports multiple asset types: Native (0) and Wrapper/Mapped (1)
 * 
 * @param tokenAddress The ERC20 token address
 * @param amount The amount to transfer
 * @param destParachainId The destination parachain ID
 * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
 * @param assetId Optional asset ID for wrapper/mapped assets
 * @returns Encoded bytes for XCM asset data
 */
function encodeAssetData(
  tokenAddress: string, 
  amount: bigint, 
  destParachainId: number,
  assetType: AssetType = AssetType.WRAPPER_MAPPED,
  assetId?: number
): `0x${string}` {
  // Use the dynamic XCM encoder for proper Scale encoding based on asset type
  return encodeAssetDataForXCM(tokenAddress, amount, destParachainId, assetType, assetId);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userAddress = body?.userAddress as string | undefined;
    const intent = body?.intent as string | undefined;
    const riskScoreOverride = body?.riskScore as number | undefined;
    const assetDataOverride = body?.assetData as string | undefined;
    const feeAssetItem = body?.feeAssetItem as number | undefined;
    const weightLimit = body?.weightLimit as number | undefined;
    
    // Multi-asset support: assetType (0=Native, 1=Wrapper/Mapped)
    const assetTypeInput = body?.assetType as number | undefined;
    const assetType: AssetType = assetTypeInput === 0 ? AssetType.NATIVE : AssetType.WRAPPER_MAPPED;
    
    // Optional asset ID for wrapper/mapped assets (e.g., Statemine asset ID)
    const assetId = body?.assetId as number | undefined;

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing userAddress" },
        { status: 400 }
      );
    }

    // MVP Option A: fixed destination is Paseo Asset Hub (destParachainId=1000).
    const destParachainId = Number(process.env.DEST_PARACHAIN_ID ?? 1000);
    const riskScore = Number(
      riskScoreOverride ?? computeRiskScore(intent ?? "route")
    );

    if (riskScore >= 75) {
      return NextResponse.json(
        {
          error:
            "Routing blocked by risk gate (aiRiskScore must be < 75)",
          riskScore,
        },
        { status: 403 }
      );
    }

    const testUsdcAddress =
      process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS ??
      process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS;

    if (!testUsdcAddress) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_TEST_USDC_ADDRESS (or NEXT_PUBLIC_USDC_TOKEN_ADDRESS)" },
        { status: 500 }
      );
    }

    const publicClient = createPublicClient({
      chain: paseoTestnet as any,
      transport: http(PAS_RPC_URL),
    });

    const vaultAddress = CONTRACT_ADDRESSES.AEGIS_VAULT;
    const amount = (await publicClient.readContract({
      address: vaultAddress,
      abi: AEGIS_VAULT_ABI,
      functionName: "getUserDeposit",
      args: [userAddress as `0x${string}`, testUsdcAddress as `0x${string}`],
    })) as bigint;

    if (amount === 0n) {
      return NextResponse.json(
        {
          error: "User has no deposited test-USDC to route",
          userAddress,
        },
        { status: 400 }
      );
    }

    // The vault only allows the configured aiOracleAddress to call routeYieldViaXCM.
    const aiOraclePrivateKey = process.env.AI_ORACLE_PRIVATE_KEY;
    if (!aiOraclePrivateKey) {
      return NextResponse.json(
        {
          error:
            "AI_ORACLE_PRIVATE_KEY is not configured on the server (oracle/relay signing required).",
        },
        { status: 501 }
      );
    }

    // Prepare assetData - use provided value or encode from token/amount/assetType
    let assetData: `0x${string}`;
    if (assetDataOverride) {
      // Validate that assetData is a valid hex string
      if (!assetDataOverride.startsWith("0x")) {
        return NextResponse.json(
          { error: "assetData must be a hex string starting with 0x" },
          { status: 400 }
        );
      }
      assetData = assetDataOverride as `0x${string}`;
    } else {
      // Encode asset data from token address, amount, and asset type using dynamic encoder
      assetData = encodeAssetData(testUsdcAddress, amount, destParachainId, assetType, assetId);
    }

    // Use provided feeAssetItem and weightLimit or defaults
    const finalFeeAssetItem = feeAssetItem ?? 0;
    const finalWeightLimit = weightLimit ?? 1000000;

    const account = privateKeyToAccount(aiOraclePrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: paseoTestnet as any,
      transport: http(PAS_RPC_URL),
    });

    // Call routeYieldViaXCM with assetType parameter
    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: AEGIS_VAULT_ABI,
      functionName: "routeYieldViaXCM",
      args: [
        destParachainId,
        testUsdcAddress as `0x${string}`,
        amount,
        BigInt(riskScore),
        assetData,
        finalFeeAssetItem,
        BigInt(finalWeightLimit),
        assetType, // Pass assetType to the contract
      ],
      chain: paseoTestnet as any,
    });

    return NextResponse.json({
      txHash,
      destParachainId,
      amount: amount.toString(),
      riskScore,
      assetData,
      assetType,
      assetId,
      feeAssetItem: finalFeeAssetItem,
      weightLimit: finalWeightLimit,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to execute route", detail: String(err) },
      { status: 500 }
    );
  }
}
