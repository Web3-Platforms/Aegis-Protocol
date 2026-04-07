import { NextRequest, NextResponse } from "next/server";
import {
  RouteRelayHttpError,
  getRouteRequestStatus,
  getRouteResponsePayload,
  getStoredRouteResponsePayload,
  submitRouteRequest,
} from "@/lib/server/route-relay";

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("requestId") ?? "";
  const userAddress = request.nextUrl.searchParams.get("userAddress") ?? "";

  try {
    const record = await getRouteRequestStatus(requestId, userAddress);
    return NextResponse.json(getStoredRouteResponsePayload(record));
  } catch (error) {
    if (error instanceof RouteRelayHttpError) {
      return NextResponse.json(error.payload, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Failed to load route request status",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  try {
    const result = await submitRouteRequest(
      body,
      request.headers.get("Idempotency-Key")
    );

    return NextResponse.json(getRouteResponsePayload(result), {
      status: result.record.responseStatusCode,
    });
  } catch (error) {
    if (error instanceof RouteRelayHttpError) {
      return NextResponse.json(error.payload, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Route relay request failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
