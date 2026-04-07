import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { fetchVaultPortfolioSnapshot } from "@/lib/server/portfolio-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userAddressParam = request.nextUrl.searchParams.get("userAddress");

  if (userAddressParam && !isAddress(userAddressParam)) {
    return NextResponse.json(
      {
        error: "Invalid userAddress",
        detail: "userAddress must be a valid 0x-prefixed EVM address.",
      },
      { status: 400 }
    );
  }

  try {
    const payload = await fetchVaultPortfolioSnapshot(
      userAddressParam ? (userAddressParam as Hex) : undefined
    );
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load portfolio snapshot.";

    return NextResponse.json(
      {
        error: "Failed to load portfolio snapshot",
        detail: message,
      },
      { status: 500 }
    );
  }
}
