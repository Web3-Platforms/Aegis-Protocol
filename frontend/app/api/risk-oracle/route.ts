import { NextResponse } from "next/server";

// MVP Option A hard-codes the destination to Paseo Asset Hub (destParachainId=1000).
// We intentionally keep the risk scoring logic, but remove destination variability so MVP scope stays honest.
const DEST_PARACHAIN_ID = Number(process.env.DEST_PARACHAIN_ID ?? 1000);

export async function POST(request: Request) {
  const { intent } = await request.json();
  const normalizedIntent = String(intent ?? "").toLowerCase();

  const looksHighRisk =
    normalizedIntent.includes("leverage") ||
    normalizedIntent.includes("unsafe") ||
    normalizedIntent.includes("degen") ||
    normalizedIntent.includes("100x");

  const riskScore = looksHighRisk ? 88 : 42;

  return NextResponse.json({
    parachainId: DEST_PARACHAIN_ID,
    riskScore,
    safeToRoute: riskScore < 75,
  });
}
