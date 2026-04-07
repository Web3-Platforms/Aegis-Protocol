export const DEFAULT_DEST_PARACHAIN_ID = Number(process.env.DEST_PARACHAIN_ID ?? 1000);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export type RiskScoringMethod = "openai" | "gemini" | "keyword";

export interface RiskAssessment {
  parachainId: number;
  riskScore: number;
  safeToRoute: boolean;
  scoringMethod: RiskScoringMethod;
}

function keywordScore(intent: string): number {
  const normalizedIntent = intent.toLowerCase();

  if (
    normalizedIntent.includes("leverage") ||
    normalizedIntent.includes("unsafe") ||
    normalizedIntent.includes("degen") ||
    normalizedIntent.includes("100x") ||
    normalizedIntent.includes("liquidat") ||
    normalizedIntent.includes("flash loan") ||
    normalizedIntent.includes("rug") ||
    normalizedIntent.includes("ponzi")
  ) {
    return 85;
  }

  if (
    normalizedIntent.includes("high yield") ||
    normalizedIntent.includes("maximum return") ||
    normalizedIntent.includes("aggressive") ||
    normalizedIntent.includes("risky") ||
    normalizedIntent.includes("speculative")
  ) {
    return 55;
  }

  if (
    normalizedIntent.includes("safe") ||
    normalizedIntent.includes("stable") ||
    normalizedIntent.includes("low risk") ||
    normalizedIntent.includes("conservative") ||
    normalizedIntent.includes("stablecoin") ||
    normalizedIntent.includes("usdc") ||
    normalizedIntent.includes("usdt")
  ) {
    return 30;
  }

  return 42;
}

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

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const score = Number.parseInt(text, 10);

  if (Number.isNaN(score) || score < 0 || score > 100) {
    throw new Error(`OpenAI returned non-numeric score: "${text}"`);
  }

  return score;
}

async function scoreWithGemini(intent: string): Promise<number> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const score = Number.parseInt(text, 10);

  if (Number.isNaN(score) || score < 0 || score > 100) {
    throw new Error(`Gemini returned non-numeric score: "${text}"`);
  }

  return score;
}

async function computeRiskScore(
  intent: string
): Promise<{ score: number; method: RiskScoringMethod }> {
  if (OPENAI_API_KEY) {
    try {
      const score = await scoreWithOpenAI(intent);
      return { score, method: "openai" };
    } catch (error) {
      console.warn("[risk-oracle] OpenAI failed, falling back to keywords:", error);
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const score = await scoreWithGemini(intent);
      return { score, method: "gemini" };
    } catch (error) {
      console.warn("[risk-oracle] Gemini failed, falling back to keywords:", error);
    }
  }

  return { score: keywordScore(intent), method: "keyword" };
}

export async function assessRouteIntent(intent: string): Promise<RiskAssessment> {
  const { score, method } = await computeRiskScore(intent);

  return {
    parachainId: DEFAULT_DEST_PARACHAIN_ID,
    riskScore: score,
    safeToRoute: score < 75,
    scoringMethod: method,
  };
}
