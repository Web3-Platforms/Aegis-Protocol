import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { fetchVaultActivityData } from "@/lib/server/activity-indexer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userAddressParam = request.nextUrl.searchParams.get("userAddress");
  const includeGlobalRoutesParam =
    request.nextUrl.searchParams.get("includeGlobalRoutes");
  const includeGlobalRoutes =
    includeGlobalRoutesParam === null
      ? true
      : !["0", "false", "no"].includes(includeGlobalRoutesParam.toLowerCase());

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
    const payload = await fetchVaultActivityData(
      userAddressParam ? (userAddressParam as Hex) : undefined,
      { includeGlobalRoutes }
    );
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load indexed activity data.";

    return NextResponse.json(
      {
        error: "Failed to load activity data",
        detail: message,
      },
      { status: 500 }
    );
  }
}
