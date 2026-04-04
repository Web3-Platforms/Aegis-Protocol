import { NextResponse } from "next/server";
import { http, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AEGIS_VAULT_ABI, CONTRACT_ADDRESSES } from "@/lib/contracts";
import { encodeAssetDataForXCM, AssetType } from "@/lib/xcm-encoder";

const PAS_RPC_URL =
  process.env.NEXT_PUBLIC_PASEO_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";

const paseoTestnet = {
  id: 420420417,
  name: "Paseo Testnet",
  network: "paseo-testnet",
  nativeCurrency: { decimals: 18, name: "Paseo", symbol: "PAS" },
  rpcUrls: {
    default: { http: [PAS_RPC_URL] },
    public:  { http: [PAS_RPC_URL] },
  },
} as const;

// Risk scoring — keyword-based fallback.
// Replace this function body with a real LLM call when ready.
// The contract enforces aiRiskScore < 75; scores >= 75 revert on-chain.
function computeRiskScore(intent: string): number {
  const s = String(intent ?? "").toLowerCase();
  const highRisk =
    s.includes("leverage") ||
    s.includes("unsafe") ||
    s.includes("degen") ||
    s.includes("100x");
  return highRisk ? 88 : 42;
}

export async function POST(request: Request) {
  // ── Parse body ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const userAddress    = body?.userAddress as string | undefined;
  const intent         = body?.intent      as string | undefined;
  const riskOverride   = body?.riskScore   as number | undefined;
  const assetDataOverride = body?.assetData as string | undefined;
  const feeAssetItem   = (body?.feeAssetItem  as number | undefined) ?? 0;
  const weightLimit    = (body?.weightLimit   as number | undefined) ?? 1_000_000;
  const assetTypeInput = (body?.assetType     as number | undefined) ?? 1;
  const assetId        = body?.assetId        as number | undefined;
  const assetType: AssetType =
    assetTypeInput === 0 ? AssetType.NATIVE : AssetType.WRAPPER_MAPPED;

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return NextResponse.json(
      { error: "Missing or invalid userAddress (must be a 0x-prefixed EVM address)" },
      { status: 400 }
    );
  }

  // ── Risk gate ─────────────────────────────────────────────────────────
  const riskScore = Number(riskOverride ?? computeRiskScore(intent ?? "route"));
  if (riskScore >= 75) {
    return NextResponse.json(
      {
        error: "Route blocked by risk gate",
        detail: `Risk score ${riskScore} is >= 75. Describe a safer intent or lower the risk score.`,
        riskScore,
      },
      { status: 403 }
    );
  }

  // ── Resolve token address ─────────────────────────────────────────────
  const tokenAddress =
    process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS ??
    process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS;

  if (!tokenAddress || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
    return NextResponse.json(
      {
        error: "Server misconfiguration: NEXT_PUBLIC_TEST_USDC_ADDRESS is not set or invalid",
        detail: "Add NEXT_PUBLIC_TEST_USDC_ADDRESS to your .env.local and restart the server.",
      },
      { status: 500 }
    );
  }

  // ── Check oracle private key ──────────────────────────────────────────
  const aiOraclePrivateKey = process.env.AI_ORACLE_PRIVATE_KEY;
  if (!aiOraclePrivateKey) {
    return NextResponse.json(
      {
        error: "AI_ORACLE_PRIVATE_KEY is not configured",
        detail:
          "Add AI_ORACLE_PRIVATE_KEY=0x<private-key> to frontend/.env.local. " +
          "This must be the private key of the aiOracleAddress set in the vault contract. " +
          "After setup-paseo.js, the oracle address equals the deployer address.",
      },
      { status: 501 }
    );
  }

  // ── Validate private key format ───────────────────────────────────────
  if (!/^0x[0-9a-fA-F]{64}$/.test(aiOraclePrivateKey)) {
    return NextResponse.json(
      {
        error: "AI_ORACLE_PRIVATE_KEY format is invalid",
        detail: "Must be a 0x-prefixed 32-byte hex string (66 characters total).",
      },
      { status: 500 }
    );
  }

  // ── Destination parachain ─────────────────────────────────────────────
  const destParachainId = Number(process.env.DEST_PARACHAIN_ID ?? 1000);

  // ── Read user's deposited balance ─────────────────────────────────────
  const publicClient = createPublicClient({
    chain: paseoTestnet as Parameters<typeof createPublicClient>[0]["chain"],
    transport: http(PAS_RPC_URL),
  });

  let amount: bigint;
  try {
    amount = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
      abi: AEGIS_VAULT_ABI,
      functionName: "getUserDeposit",
      args: [userAddress as `0x${string}`, tokenAddress as `0x${string}`],
    })) as bigint;
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to read user deposit from vault",
        detail: String(err),
        hint: "Ensure NEXT_PUBLIC_AEGIS_VAULT_ADDRESS is set and the contract is deployed.",
      },
      { status: 502 }
    );
  }

  if (amount === 0n) {
    return NextResponse.json(
      {
        error: "No deposited balance to route",
        detail: `${userAddress} has 0 test-USDC deposited in the vault. Deposit first.`,
        userAddress,
        tokenAddress,
      },
      { status: 400 }
    );
  }

  // ── Encode XCM asset data ─────────────────────────────────────────────
  let assetData: `0x${string}`;
  if (assetDataOverride) {
    if (!assetDataOverride.startsWith("0x")) {
      return NextResponse.json(
        { error: "assetData must be a hex string starting with 0x" },
        { status: 400 }
      );
    }
    assetData = assetDataOverride as `0x${string}`;
  } else {
    assetData = encodeAssetDataForXCM(
      tokenAddress,
      amount,
      destParachainId,
      assetType,
      assetId
    );
  }

  // ── Submit on-chain as AI oracle ──────────────────────────────────────
  const account = privateKeyToAccount(aiOraclePrivateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: paseoTestnet as Parameters<typeof createWalletClient>[0]["chain"],
    transport: http(PAS_RPC_URL),
  });

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
      abi: AEGIS_VAULT_ABI,
      functionName: "routeYieldViaXCM",
      args: [
        destParachainId,
        tokenAddress as `0x${string}`,
        amount,
        BigInt(riskScore),
        assetData,
        feeAssetItem,
        BigInt(weightLimit),
        assetType,
      ],
      chain: paseoTestnet as Parameters<typeof walletClient.writeContract>[0]["chain"],
    });
  } catch (err) {
    const msg = String(err);

    // Decode common revert reasons into actionable messages
    if (msg.includes("OnlyAIOracle")) {
      return NextResponse.json(
        {
          error: "Oracle address mismatch",
          detail:
            `The account derived from AI_ORACLE_PRIVATE_KEY (${account.address}) ` +
            "is not the aiOracleAddress set in the vault. " +
            "Re-run setup-paseo.js or call vault.setAIOracleAddress() from the owner wallet.",
        },
        { status: 403 }
      );
    }
    if (msg.includes("RiskScoreTooHigh")) {
      return NextResponse.json(
        { error: "Contract rejected risk score", riskScore, detail: msg },
        { status: 403 }
      );
    }
    if (msg.includes("TokenNotSupported")) {
      return NextResponse.json(
        {
          error: "Token not supported by vault",
          detail:
            `${tokenAddress} is not in the vault's supported token list. ` +
            "Call vault.addSupportedToken() from the owner wallet.",
          tokenAddress,
        },
        { status: 400 }
      );
    }
    if (msg.includes("XCMRoutingPaused")) {
      return NextResponse.json(
        {
          error: "XCM routing is paused",
          detail: "Call vault.toggleXcmRoute() from the owner wallet to unpause.",
        },
        { status: 503 }
      );
    }
    if (msg.includes("InsufficientRoutedBalance")) {
      return NextResponse.json(
        {
          error: "Insufficient vault balance for routing",
          detail: "The vault does not hold enough of this token to route the requested amount.",
          amount: amount.toString(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "routeYieldViaXCM transaction failed", detail: msg },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    txHash,
    destParachainId,
    amount: amount.toString(),
    riskScore,
    assetData,
    assetType,
    assetId: assetId ?? null,
    feeAssetItem,
    weightLimit,
    oracleAddress: account.address,
    note:
      "XCM precompile is address(0) on Paseo — the vault call succeeded and events " +
      "were emitted, but no cross-chain message was dispatched. This will work " +
      "automatically once Polkadot Hub ships the XCM precompile.",
  });
}
