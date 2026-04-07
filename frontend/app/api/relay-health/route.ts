import { NextRequest, NextResponse } from "next/server";
import { getRouteRelayHealthSnapshot } from "@/lib/server/route-relay-health";

function shouldFailOnDegraded(request: NextRequest): boolean {
  const strict = request.nextUrl.searchParams.get("strict")?.trim().toLowerCase();
  return strict === "1" || strict === "true";
}

export async function GET(request: NextRequest) {
  try {
    const snapshot = await getRouteRelayHealthSnapshot();
    const strict = shouldFailOnDegraded(request);
    const shouldFail =
      snapshot.status === "failed" || (strict && snapshot.status === "degraded");

    return NextResponse.json(snapshot, {
      status: shouldFail ? 503 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Failed to generate relay health snapshot",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
