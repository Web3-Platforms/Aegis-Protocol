import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { fetchWalletHistory } from "@/lib/server/history-feed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userAddressParam = request.nextUrl.searchParams.get("userAddress");
  const limitParam = request.nextUrl.searchParams.get("limit");

  if (!userAddressParam) {
    return NextResponse.json(
      {
        error: "Missing userAddress",
        detail: "Pass ?userAddress=<wallet-address> to query recent wallet history.",
      },
      { status: 400 }
    );
  }

  if (!isAddress(userAddressParam)) {
    return NextResponse.json(
      {
        error: "Invalid userAddress",
        detail: "userAddress must be a valid 0x-prefixed EVM address.",
      },
      { status: 400 }
    );
  }

  if (limitParam !== null) {
    if (!/^\d+$/.test(limitParam)) {
      return NextResponse.json(
        {
          error: "Invalid limit",
          detail: "limit must be a positive integer.",
        },
        { status: 400 }
      );
    }

    const parsedLimit = Number(limitParam);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0) {
      return NextResponse.json(
        {
          error: "Invalid limit",
          detail: "limit must be a positive integer.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const payload = await fetchWalletHistory(userAddressParam as Hex, limitParam);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load wallet history.";

    return NextResponse.json(
      {
        error: "Failed to load wallet history",
        detail: message,
      },
      { status: 500 }
    );
  }
}
