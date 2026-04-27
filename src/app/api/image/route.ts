import { NextResponse } from "next/server";

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";

/** Multi-word colours first (longest match wins), then singles */
const COLOUR_PHRASES = [
  "navy blue",
  "royal blue",
  "sky blue",
  "light blue",
  "dark blue",
  "baby blue",
  "powder blue",
  "forest green",
  "olive green",
  "bottle green",
  "sage green",
  "emerald green",
  "light pink",
  "hot pink",
  "dusty pink",
  "rose gold",
  "charcoal grey",
  "charcoal gray",
  "light grey",
  "light gray",
  "dark grey",
  "dark gray",
  "off white",
  "off-white",
  "wine red",
  "burgundy red",
  "tan brown",
  "camel brown",
  "mustard yellow",
  "cream white",
  "jet black",
  "midnight blue",
  "electric blue",
  "coral pink",
  "lavender purple",
  "denim blue",
  "stone grey",
  "stone gray",
];

const COLOUR_SINGLES = [
  "white",
  "black",
  "navy",
  "beige",
  "tan",
  "grey",
  "gray",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "orange",
  "brown",
  "cream",
  "ivory",
  "burgundy",
  "maroon",
  "charcoal",
  "khaki",
  "camel",
  "rust",
  "teal",
  "coral",
  "lavender",
  "gold",
  "silver",
  "mustard",
  "wine",
  "ochre",
  "denim",
  "indigo",
  "magenta",
  "turquoise",
  "aqua",
  "bronze",
  "copper",
  "peach",
  "mint",
  "lilac",
  "violet",
  "crimson",
  "scarlet",
  "sand",
  "ecru",
  "taupe",
  "mocha",
  "espresso",
];

function skinToneToModifier(skinTone: string): string {
  const t = skinTone.trim().toLowerCase();
  if (t === "fair") return "light skin";
  if (t === "wheatish") return "tan skin south asian";
  if (t === "medium") return "medium skin";
  if (t === "dark") return "dark skin";
  return "";
}

function genderSearchToken(gender: string): string {
  const g = gender.trim().toLowerCase();
  if (g === "man") return "men";
  if (g === "woman") return "women";
  if (g === "non-binary" || g === "nonbinary") return "non binary";
  return gender.trim().toLowerCase() || "fashion";
}

/**
 * Extract leading colour phrase from item name; return remainder as item descriptor.
 */
function extractColourAndItemName(itemName: string): { colour: string; itemRest: string } {
  let lower = itemName.trim().toLowerCase();
  let colour = "";

  for (const phrase of COLOUR_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(lower)) {
      colour = phrase;
      lower = lower.replace(re, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  if (!colour) {
    for (const word of COLOUR_SINGLES) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      if (re.test(lower)) {
        colour = word;
        lower = lower.replace(re, " ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  const itemRest = lower.replace(/\s+/g, " ").trim();
  return { colour, itemRest };
}

function buildRecommendationQuery(params: {
  itemName: string;
  gender: string;
  vibe: string;
  occasions: string;
  skinTone: string;
  lovedHint?: string;
}): string {
  const { colour, itemRest } = extractColourAndItemName(params.itemName);
  const gender = genderSearchToken(params.gender);
  const vibeWords = params.vibe.trim().toLowerCase();
  const occasionPart = params.occasions
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  const skin = skinToneToModifier(params.skinTone);
  const loved = params.lovedHint?.trim().toLowerCase() ?? "";

  const parts = [
    colour,
    itemRest || params.itemName.trim().toLowerCase(),
    gender,
    vibeWords,
    occasionPart,
    skin,
    loved,
    "fashion",
    "outfit",
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildMoodQuery(params: {
  personality: string;
  gender: string;
  vibe: string;
  skinTone: string;
  lovedHint?: string;
}): string {
  const personality = params.personality.trim().toLowerCase();
  const gender = genderSearchToken(params.gender);
  const vibeWords = params.vibe.trim().toLowerCase();
  const skin = skinToneToModifier(params.skinTone);
  const loved = params.lovedHint?.trim().toLowerCase() ?? "";

  const parts = [
    personality,
    gender,
    vibeWords,
    "fashion",
    "lifestyle",
    skin,
    loved,
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
]);

function queryKeywordsForScoring(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function scorePhotoRelevance(
  photo: { alt?: string | null; photographer?: string | null },
  keywords: string[],
): number {
  const text = `${photo.alt ?? ""} ${photo.photographer ?? ""}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 2) continue;
    if (text.includes(kw)) score += 1;
  }
  return score;
}

function pickBestPhoto<T extends { alt?: string | null; photographer?: string | null; src?: { medium?: string } }>(
  photos: T[],
  searchQuery: string,
): T | undefined {
  if (!photos.length) return undefined;
  const keywords = queryKeywordsForScoring(searchQuery);
  if (!keywords.length) return photos[0];

  let best = photos[0];
  let bestScore = scorePhotoRelevance(best, keywords);

  for (let i = 1; i < photos.length; i++) {
    const s = scorePhotoRelevance(photos[i], keywords);
    if (s > bestScore) {
      bestScore = s;
      best = photos[i];
    }
  }

  if (bestScore === 0) return photos[0];
  return best;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim() || "legacy";

  if (!process.env.PEXELS_API_KEY) {
    return NextResponse.json(
      { error: "Missing PEXELS_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  let searchQuery = "";
  let slot = 0;

  if (type === "recommendation") {
    const itemName = searchParams.get("itemName")?.trim();
    const gender = searchParams.get("gender")?.trim();
    const vibe = searchParams.get("vibe")?.trim();
    const occasions = searchParams.get("occasions")?.trim() ?? "";
    const skinTone = searchParams.get("skinTone")?.trim();

    if (!itemName || !gender || !vibe || !skinTone) {
      return NextResponse.json(
        { error: "Missing itemName, gender, vibe, or skinTone for recommendation image." },
        { status: 400 },
      );
    }

    const lovedRaw = searchParams.get("lovedColors")?.trim() ?? "";
    const lovedHint =
      lovedRaw && !lovedRaw.toLowerCase().includes("no preference")
        ? lovedRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(" ")
        : "";

    searchQuery = buildRecommendationQuery({
      itemName,
      gender,
      vibe,
      occasions,
      skinTone,
      lovedHint,
    });
  } else if (type === "mood") {
    const personality = searchParams.get("personality")?.trim();
    const gender = searchParams.get("gender")?.trim();
    const vibe = searchParams.get("vibe")?.trim();
    const skinTone = searchParams.get("skinTone")?.trim();
    const slotRaw = searchParams.get("slot");
    slot = Math.max(0, Math.min(4, Number.parseInt(slotRaw ?? "0", 10) || 0));

    if (!personality || !gender || !vibe || !skinTone) {
      return NextResponse.json(
        { error: "Missing personality, gender, vibe, or skinTone for mood image." },
        { status: 400 },
      );
    }

    const lovedRaw = searchParams.get("lovedColors")?.trim() ?? "";
    const lovedHint =
      lovedRaw && !lovedRaw.toLowerCase().includes("no preference")
        ? lovedRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(" ")
        : "";

    searchQuery = buildMoodQuery({
      personality,
      gender,
      vibe,
      skinTone,
      lovedHint,
    });
  } else {
    const q = searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ error: "Missing query parameter q." }, { status: 400 });
    }
    searchQuery = q;
  }

  const url = new URL(PEXELS_SEARCH);
  url.searchParams.set("query", searchQuery);
  url.searchParams.set("per_page", "5");
  url.searchParams.set("page", "1");
  url.searchParams.set("orientation", "portrait");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: process.env.PEXELS_API_KEY,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to fetch image from Pexels." },
        { status: response.status },
      );
    }

    const data = (await response.json()) as {
      photos?: Array<{
        alt?: string | null;
        photographer?: string | null;
        src?: { medium?: string };
      }>;
    };

    const photos = data.photos ?? [];
    if (!photos.length) {
      return NextResponse.json({ imageUrl: null });
    }

    if (type === "mood") {
      const keywords = queryKeywordsForScoring(searchQuery);
      const scored = photos.map((photo, idx) => ({
        photo,
        score: scorePhotoRelevance(photo, keywords),
        idx,
      }));
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.idx - b.idx;
      });
      const chosen = scored[slot]?.photo ?? scored[0]?.photo ?? photos[0];
      const imageUrl = chosen?.src?.medium ?? null;
      return NextResponse.json({ imageUrl });
    }

    const best = pickBestPhoto(photos, searchQuery);
    const imageUrl = best?.src?.medium ?? photos[0]?.src?.medium ?? null;
    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Pexels image fetch failed", error);
    return NextResponse.json(
      { error: "Unable to fetch image from Pexels." },
      { status: 500 },
    );
  }
}
