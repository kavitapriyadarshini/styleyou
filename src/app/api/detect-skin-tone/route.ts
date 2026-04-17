import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const VALID_SKIN = ["Fair", "Wheatish", "Medium", "Dark"] as const;
type SkinTone = (typeof VALID_SKIN)[number];

type Payload = {
  imageBase64: string;
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
};

function extractJsonText(rawText: string) {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1).trim();
  return trimmed;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  const payload = (await request.json()) as Payload;
  if (!payload.imageBase64 || !payload.imageMediaType) {
    return NextResponse.json(
      { error: "Missing imageBase64 or imageMediaType." },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Look at the person in this photo. Estimate visible skin tone for fashion styling (Indian context is fine).
Respond with STRICT JSON only, no markdown:
{"skinTone":"Fair"|"Wheatish"|"Medium"|"Dark","confidence":"low"|"medium"|"high"}
Choose exactly one of Fair, Wheatish, Medium, Dark. Base this on face or visible skin areas only.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: payload.imageMediaType,
                data: payload.imageBase64,
              },
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text in response");
    }

    const parsed = JSON.parse(extractJsonText(textBlock.text)) as {
      skinTone?: string;
      confidence?: string;
    };

    const raw = parsed.skinTone?.trim() ?? "";
    const skinTone = VALID_SKIN.includes(raw as SkinTone)
      ? (raw as SkinTone)
      : null;

    if (!skinTone) {
      return NextResponse.json(
        { error: "Could not classify skin tone from this image." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      skinTone,
      confidence: parsed.confidence ?? "medium",
    });
  } catch (error) {
    console.error("detect-skin-tone failed", error);
    return NextResponse.json(
      { error: "Unable to detect skin tone from this image." },
      { status: 500 },
    );
  }
}
