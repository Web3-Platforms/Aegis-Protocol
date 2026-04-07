import { NextResponse } from "next/server";
import { assessRouteIntent } from "@/lib/server/risk-oracle";

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const intent = String(body?.intent ?? "").trim();

  if (!intent) {
    return NextResponse.json(
      { error: "Missing intent field in request body" },
      { status: 400 }
    );
  }

  const riskAssessment = await assessRouteIntent(intent);

  return NextResponse.json({
    parachainId: riskAssessment.parachainId,
    riskScore: riskAssessment.riskScore,
    safeToRoute: riskAssessment.safeToRoute,
    scoringMethod: riskAssessment.scoringMethod,
  });
}
