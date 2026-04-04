import { NextResponse } from "next/server";

// Risk oracle — current implementation: keyword-based scoring (no LLM call).
// To add a real LLM: call the provider API here, parse the numeric score from
// the response, and return it in the same shape: { parachainId, riskScore, safeToRoute }.
// The risk gate threshold is riskScore < 75 (scores of 75 and above are blocked by the contract).
//
// MVP Option A hard-codes the destination to Paseo Asset Hub (destParachainId=1000).
// We intentionally keep the risk scoring logic, but remove destination variability so MVP scope stays honest.
const DEST_PARACHAIN_ID = Number(process.env.DEST_PARACHAIN_ID ?? 1000);

// ── LLM provider config (optional) ───────────────────────────────────────────
// Set OPENAI_API_KEY (or GEMINI_API_KEY) in .env.local to enable real scoring.
// If neither is set, the keyword fallback is used automatically.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── Keyword fallback scorer ───────────────────────────────────────────────────
// Returns a score 0–100. Scores >= 75 are blocked by the contract.
function keywordScore(intent: string): number {
  const s = intent.toLowerCase();

  // High-risk signals → score 85
  if (
    s.includes("leverage") ||
    s.includes("unsafe") ||
    s.includes("degen") ||
    s.includes("100x") ||
    s.includes("liquidat") ||
    s.includes("flash loan") ||
    s.includes("rug") ||
    s.includes("ponzi")
  ) {
    return 85;
  }

  // Medium-risk signals → score 55
  if (
    s.includes("high yield") ||
    s.includes("maximum return") ||
    s.includes("aggressive") ||
    s.includes("risky") ||
    s.includes("speculative")
  ) {
    return 55;
  }

  // Safe signals → score 30
  if (
    s.includes("safe") ||
    s.includes("stable") ||
    s.includes("low risk") ||
    s.includes("conservative") ||
    s.includes("stablecoin") ||
    s.includes("usdc") ||
    s.includes("usdt")
  ) {
    return 30;
  }

  // Default: moderate-safe
  return 42;
}

// ── OpenAI scorer ─────────────────────────────────────────────────────────────
async function scoreWithOpenAI(intent: string): Promise<number> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 10,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a DeFi risk analyst. Given a user's yield routing intent, " +
            "respond with ONLY a single integer from 0 to 100 representing the risk score. " +
            "0 = completely safe, 100 = extremely dangerous. " +
            "Scores >= 75 will be blocked. No explanation, just the number.",
        },
        { role: "user", content: `Intent: "${intent}"` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const score = parseInt(text, 10);

  if (isNaN(score) || score < 0 || score > 100) {
    throw new Error(`OpenAI returned non-numeric score: "${text}"`);
  }

  return score;
}

// ── Gemini scorer ─────────────────────────────────────────────────────────────
async function scoreWithGemini(intent: string): Promise<number> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "You are a DeFi risk analyst. Given a user's yield routing intent, " +
                "respond with ONLY a single integer from 0 to 100 representing the risk score. " +
                "0 = completely safe, 100 = extremely dangerous. " +
                "Scores >= 75 will be blocked. No explanation, just the number.\n\n" +
                `Intent: "${intent}"`,
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 10, temperature: 0 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const score = parseInt(text, 10);

  if (isNaN(score) || score < 0 || score > 100) {
    throw new Error(`Gemini returned non-numeric score: "${text}"`);
  }

  return score;
}

// ── Main scorer — tries LLM, falls back to keywords ──────────────────────────
async function computeRiskScore(intent: string): Promise<{
  score: number;
  method: "openai" | "gemini" | "keyword";
}> {
  if (OPENAI_API_KEY) {
    try {
      const score = await scoreWithOpenAI(intent);
      return { score, method: "openai" };
    } catch (err) {
      console.warn("[risk-oracle] OpenAI failed, falling back to keywords:", err);
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const score = await scoreWithGemini(intent);
      return { score, method: "gemini" };
    } catch (err) {
      console.warn("[risk-oracle] Gemini failed, falling back to keywords:", err);
    }
  }

  return { score: keywordScore(intent), method: "keyword" };
}

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

  const { score: riskScore, method } = await computeRiskScore(intent);

  return NextResponse.json({
    parachainId: DEST_PARACHAIN_ID,
    riskScore,
    safeToRoute: riskScore < 75,
    scoringMethod: method,
  });
}
