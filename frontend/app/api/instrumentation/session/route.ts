import { NextRequest, NextResponse } from "next/server";
import { PRODUCT_INSTRUMENTATION_ENABLED } from "@/lib/feature-flags";
import {
  attachInstrumentationSessionCookie,
  createInstrumentationSessionId,
  getValidatedInstrumentationSessionId,
  isTrustedInstrumentationRequest,
} from "@/lib/server/product-instrumentation-session";
import { hasProductEventDatabase } from "@/lib/server/product-event-store";

export async function GET(request: NextRequest) {
  if (!PRODUCT_INSTRUMENTATION_ENABLED) {
    return NextResponse.json(
      { issued: false, reason: "disabled" },
      { status: 202 }
    );
  }

  if (!hasProductEventDatabase()) {
    return NextResponse.json(
      { issued: false, reason: "storage_unavailable" },
      { status: 202 }
    );
  }

  if (!isTrustedInstrumentationRequest(request)) {
    return NextResponse.json(
      { issued: false, reason: "untrusted_context" },
      { status: 202 }
    );
  }

  const sessionId =
    getValidatedInstrumentationSessionId(request) ??
    createInstrumentationSessionId();

  return attachInstrumentationSessionCookie(
    NextResponse.json({ issued: true, sessionId }, { status: 200 }),
    sessionId
  );
}
