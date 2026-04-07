import { NextRequest, NextResponse } from "next/server";
import { PRODUCT_INSTRUMENTATION_ENABLED } from "@/lib/feature-flags";
import {
  createStoredProductEvent,
  parseProductEventPayload,
} from "@/lib/product-events";
import {
  hasProductEventDatabase,
  recordProductEvent,
} from "@/lib/server/product-event-store";
import {
  getValidatedInstrumentationSessionId,
  isTrustedInstrumentationRequest,
} from "@/lib/server/product-instrumentation-session";

export async function POST(request: NextRequest) {
  if (!isTrustedInstrumentationRequest(request)) {
    return NextResponse.json(
      { recorded: false, reason: "untrusted_context" },
      { status: 202 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const payload = parseProductEventPayload(body);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid product event payload" },
      { status: 400 }
    );
  }

  if (!PRODUCT_INSTRUMENTATION_ENABLED) {
    return NextResponse.json(
      { recorded: false, reason: "disabled" },
      { status: 202 }
    );
  }

  if (!hasProductEventDatabase()) {
    return NextResponse.json(
      {
        recorded: false,
        reason: "storage_unavailable",
        detail:
          "Set DATABASE_URL (or AI_ORACLE_RELAY_DATABASE_URL) before enabling NEXT_PUBLIC_AEGIS_PRODUCT_INSTRUMENTATION_ENABLED for persistent event capture.",
      },
      { status: 202 }
    );
  }

  const instrumentationSessionId = getValidatedInstrumentationSessionId(request);
  if (!instrumentationSessionId || instrumentationSessionId !== payload.sessionId) {
    return NextResponse.json(
      { recorded: false, reason: "invalid_session" },
      { status: 202 }
    );
  }

  try {
    await recordProductEvent(createStoredProductEvent(payload));
  } catch (error) {
    console.error("Failed to record product event.", error);

    return NextResponse.json(
      {
        recorded: false,
        reason: "write_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ recorded: true }, { status: 202 });
}
