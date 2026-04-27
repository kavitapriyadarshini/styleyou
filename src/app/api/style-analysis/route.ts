import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

type StyleQuizPayload = {
  gender: string;
  ageRange: string;
  bodyType: string;
  skinTone: string;
  lovedColors: string[];
  vibe: string;
  occasions: string[];
  budget: string;
  brands: string;
  imageBase64?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
};

type StyleAnalysisResult = {
  stylePersonalityName: string;
  stylePersonalityDescription: string;
  styleGaps: string[];
  recommendations: Array<{
    itemName: string;
    whyItWorks: string;
    stylingTip: string;
    googleImagesSearchUrl: string;
  }>;
  outfitCombinations: Array<{
    title: string;
    occasionContext: string;
    outfitDetails: string;
  }>;
};

function extractJsonText(rawText: string) {
  const trimmed = rawText.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function isValidStyleAnalysisResult(data: unknown): data is StyleAnalysisResult {
  const value = data as Partial<StyleAnalysisResult> | null;
  if (!value || typeof value !== "object") return false;

  return (
    typeof value.stylePersonalityName === "string" &&
    typeof value.stylePersonalityDescription === "string" &&
    Array.isArray(value.styleGaps) &&
    value.styleGaps.length === 3 &&
    Array.isArray(value.recommendations) &&
    value.recommendations.length === 6 &&
    value.recommendations.every(
      (item) =>
        typeof item?.itemName === "string" &&
        typeof item?.whyItWorks === "string" &&
        typeof item?.stylingTip === "string" &&
        typeof item?.googleImagesSearchUrl === "string",
    ) &&
    Array.isArray(value.outfitCombinations) &&
    value.outfitCombinations.length === 3 &&
    value.outfitCombinations.every(
      (item) =>
        typeof item?.title === "string" &&
        typeof item?.occasionContext === "string" &&
        typeof item?.outfitDetails === "string",
    )
  );
}

function getReadableErrorMessage(error: unknown) {
  const err = error as {
    message?: string;
    status?: number;
    cause?: { code?: string; message?: string };
  };

  if (err?.cause?.code === "ENOTFOUND") {
    return "Cannot reach Anthropic right now (DNS/network issue). Check your internet, VPN/firewall settings, and try again.";
  }

  if (err?.status === 401) {
    return "Anthropic authentication failed. Please verify your ANTHROPIC_API_KEY in .env.local.";
  }

  if (err?.status === 429) {
    return "Anthropic rate limit reached. Please wait a moment and retry.";
  }

  if (
    err?.message?.includes("Unexpected token") ||
    err?.message?.includes("Invalid analysis format")
  ) {
    return "The AI returned an invalid response format. Please try again.";
  }

  return "Unable to generate style analysis right now. Please try again shortly.";
}

export async function POST(request: Request) {
  const payload = (await request.json()) as StyleQuizPayload;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  const loved = Array.isArray(payload.lovedColors) ? payload.lovedColors : [];
  const isNoPref = (s: string) => s.trim().toLowerCase() === "no preference";
  const hasNoPreference = loved.some(isNoPref);
  const lovedOk =
    loved.length > 0 &&
    loved.length <= 5 &&
    (!hasNoPreference || (loved.length === 1 && isNoPref(loved[0] ?? "")));

  if (
    !payload.gender ||
    !payload.ageRange ||
    !payload.bodyType ||
    !payload.skinTone ||
    !payload.vibe?.trim() ||
    !lovedOk ||
    !payload.occasions?.length ||
    !payload.budget
  ) {
    return NextResponse.json(
      {
        error:
          "Please complete all required quiz fields (including up to 5 colour preferences, or only “No preference”, and your desired vibe).",
      },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const colourTheory = `
Skin-tone colour theory (use for item colours, fabrics, and whyItWorks; cross-check with loved colours below):

Fair: Jewel tones (emerald, sapphire, ruby), pastels, navy, soft pinks work well. Avoid washed-out whites and very pale yellows that can look flat.

Wheatish: Warm tones (terracotta, olive, gold, coral, warm reds), earthy neutrals, rich jewel tones. Avoid ashy greys and cool pastels that can dull warmth.

Medium: Most colours work; especially warm whites, bold brights, warm neutrals, mustard, teal. Avoid very pale or washed-out colours that lack contrast.

Dark: Bold vibrant colours (royal blue, fuchsia, bright orange, rich purple), warm whites, metallics. Avoid very dark colours that reduce contrast with skin.

If the user's stated "colours they love" conflict with the above for their skin tone, address it gently in whyItWorks or stylingTip where relevant (e.g. "While you love pastels, cool pastels can wash out wheatish skin — we chose warm pastels like peach and blush instead.").
`;

  const prompt = `
You are an elite personal stylist for Indian shoppers. Build a style report in STRICT JSON only.

Client profile:
- Gender: ${payload.gender}
- Age range: ${payload.ageRange}
- Body type: ${payload.bodyType}
- Skin tone: ${payload.skinTone}
- Colours they love wearing: ${loved.join(", ")}
- Vibe they want to go for (primary style direction): ${payload.vibe.trim()}
- Occasions you want to buy for: ${payload.occasions.join(", ")}
- Budget per outfit in INR: ${payload.budget}
- Favorite brands: ${payload.brands || "Not specified"}

${colourTheory}

Strict guidance:
- All 6 itemName values and outfit combinations MUST align with their chosen vibe (${payload.vibe.trim()}) and colour preferences (${loved.join(", ")}), while respecting skin-tone colour theory above.
- Recommendations should feel cohesive with both vibe and loved colours (unless "No preference" was chosen — then prioritise skin-tone theory and occasions).

Process internally in three conceptual agent steps:
1) Analyze profile and identify a named style personality plus exactly 3 style gaps.
2) Generate exactly 6 recommendations with fields:
   - itemName
   - whyItWorks (must reference body type, skin tone, loved colours and/or vibe, and one or more occasions)
   - stylingTip
   - googleImagesSearchUrl (format: https://www.google.com/search?tbm=isch&q=ITEM+NAME with spaces encoded)
3) Generate exactly 3 complete outfit combinations using these items, each with:
   - title
   - occasionContext
   - outfitDetails

Respond with this schema and no extra keys:
{
  "stylePersonalityName": "string",
  "stylePersonalityDescription": "string",
  "styleGaps": ["string", "string", "string"],
  "recommendations": [
    {
      "itemName": "string",
      "whyItWorks": "string",
      "stylingTip": "string",
      "googleImagesSearchUrl": "string"
    }
  ],
  "outfitCombinations": [
    {
      "title": "string",
      "occasionContext": "string",
      "outfitDetails": "string"
    }
  ]
}
`;

  try {
    const content: Anthropic.Messages.MessageParam["content"] = [
      {
        type: "text",
        text: prompt,
      },
    ];

    if (payload.imageBase64 && payload.imageMediaType) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: payload.imageMediaType,
          data: payload.imageBase64,
        },
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1800,
      temperature: 0.5,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude response did not contain a text block.");
    }

    const jsonText = extractJsonText(textBlock.text);
    const parsed = JSON.parse(jsonText);
    if (!isValidStyleAnalysisResult(parsed)) {
      throw new Error("Invalid analysis format");
    }
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Style analysis failed", error);
    const readableError = getReadableErrorMessage(error);
    return NextResponse.json(
      { error: readableError },
      { status: 500 },
    );
  }
}
