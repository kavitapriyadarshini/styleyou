"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import Image from "next/image";

type Recommendation = {
  itemName: string;
  whyItWorks: string;
  stylingTip: string;
  googleImagesSearchUrl: string;
};

type OutfitCombination = {
  title: string;
  occasionContext: string;
  outfitDetails: string;
};

type AnalysisResult = {
  stylePersonalityName: string;
  stylePersonalityDescription: string;
  styleGaps: string[];
  recommendations: Recommendation[];
  outfitCombinations: OutfitCombination[];
};

type QuizData = {
  gender: string;
  ageRange: string;
  bodyType: string;
  skinTone: string;
  currentStyle: string;
  lovedColors: string[];
  vibe: string;
  occasions: string[];
  budget: string;
  brands: string;
  imageBase64: string;
  imageMediaType: "image/jpeg" | "image/png" | "image/webp" | "";
  imageName: string;
};

type BodyTypeRow = { value: string; title: string; helper: string };

const LOVED_COLOR_OPTIONS = [
  "Whites & Creams",
  "Blacks & Charcoals",
  "Navy & Blues",
  "Earthy tones (beige, brown, tan)",
  "Pastels (soft pink, lavender, mint)",
  "Brights (red, yellow, orange)",
  "Greens (olive, forest, emerald)",
  "Neutrals (grey, taupe)",
  "Prints & Patterns",
  "No preference",
] as const;

const VIBE_OPTIONS = [
  "Clean & Minimal",
  "Bold & Statement",
  "Soft & Romantic",
  "Edgy & Urban",
  "Classic & Timeless",
  "Relaxed & Effortless",
  "Power & Polished",
  "Playful & Colourful",
] as const;

const BODY_TYPE_WOMAN: BodyTypeRow[] = [
  {
    value: "🍎 Apple — Fuller midsection, slimmer legs",
    title: "🍎 Apple",
    helper: "Fuller midsection, slimmer legs",
  },
  {
    value: "🍐 Pear — Narrower shoulders, wider hips",
    title: "🍐 Pear",
    helper: "Narrower shoulders, wider hips",
  },
  {
    value: "⏳ Hourglass — Balanced shoulders and hips, defined waist",
    title: "⏳ Hourglass",
    helper: "Balanced shoulders and hips, defined waist",
  },
  {
    value: "📏 Rectangle — Similar shoulder, waist and hip width",
    title: "📏 Rectangle",
    helper: "Similar shoulder, waist and hip width",
  },
  {
    value: "🔺 Inverted Triangle — Broader shoulders, narrower hips",
    title: "🔺 Inverted Triangle",
    helper: "Broader shoulders, narrower hips",
  },
  {
    value: "🌙 Plus & Curvy — Fuller figure, generous curves",
    title: "🌙 Plus & Curvy",
    helper: "Fuller figure, generous curves",
  },
];

const BODY_TYPE_MAN: BodyTypeRow[] = [
  {
    value: "📐 Triangle — Narrower shoulders, wider waist",
    title: "📐 Triangle",
    helper: "Narrower shoulders, wider waist",
  },
  {
    value: "🔺 Inverted Triangle — Broad shoulders, narrow waist",
    title: "🔺 Inverted Triangle",
    helper: "Broad shoulders, narrow waist",
  },
  {
    value: "⬜ Rectangle — Even proportions throughout",
    title: "⬜ Rectangle",
    helper: "Even proportions throughout",
  },
  {
    value: "🔵 Oval — Fuller midsection",
    title: "🔵 Oval",
    helper: "Fuller midsection",
  },
  {
    value: "💪 Athletic — Muscular, well-defined build",
    title: "💪 Athletic",
    helper: "Muscular, well-defined build",
  },
];

const BODY_TYPE_NONBINARY: BodyTypeRow[] = [...BODY_TYPE_WOMAN, ...BODY_TYPE_MAN];

const genderOptions = ["Man", "Woman", "Non-binary"];
const ageOptions = ["18-24", "25-34", "35-44", "45+"];
const skinToneOptions = ["Fair", "Wheatish", "Medium", "Dark"];
const styleOptions = [
  "Casual",
  "Formal",
  "Smart Casual",
  "Streetwear",
  "Ethnic",
  "Mixed",
];
const occasionOptions = [
  "Work",
  "Dates",
  "Weddings",
  "Casual outings",
  "Gym",
  "Parties",
];
const budgetOptions = ["Under 2000", "2000-5000", "5000-15000", "15000+"];

function bodyTypeRowsForGender(gender: string): BodyTypeRow[] {
  if (gender === "Woman") return BODY_TYPE_WOMAN;
  if (gender === "Man") return BODY_TYPE_MAN;
  if (gender === "Non-binary") return BODY_TYPE_NONBINARY;
  return [];
}

function isLovedColorsValid(lovedColors: string[]): boolean {
  if (lovedColors.length === 0 || lovedColors.length > 5) return false;
  const hasNoPref = lovedColors.includes("No preference");
  if (hasNoPref) return lovedColors.length === 1;
  return true;
}

const analysisSteps = [
  "Analysing your style profile...",
  "Building your wardrobe recommendations...",
  "Creating your style guide...",
];

const initialQuiz: QuizData = {
  gender: "",
  ageRange: "",
  bodyType: "",
  skinTone: "",
  currentStyle: "",
  lovedColors: [],
  vibe: "",
  occasions: [],
  budget: "",
  brands: "",
  imageBase64: "",
  imageMediaType: "",
  imageName: "",
};

function getGoogleImagesSearchUrl(itemName: string) {
  const keywordQuery = itemName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");

  const safeQuery = keywordQuery || itemName.trim() || "fashion";
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(safeQuery)}`;
}

export default function Home() {
  const [quiz, setQuiz] = useState<QuizData>(initialQuiz);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentStep, setActiveAgentStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [skinToneDetectedMessage, setSkinToneDetectedMessage] = useState<string | null>(
    null,
  );

  const bodyTypeRows = useMemo(() => bodyTypeRowsForGender(quiz.gender), [quiz.gender]);

  const canSubmit =
    Boolean(quiz.gender) &&
    Boolean(quiz.ageRange) &&
    Boolean(quiz.bodyType) &&
    Boolean(quiz.skinTone) &&
    Boolean(quiz.currentStyle) &&
    Boolean(quiz.vibe) &&
    isLovedColorsValid(quiz.lovedColors) &&
    Boolean(quiz.budget) &&
    quiz.occasions.length > 0;

  const handleInput = (
    key: keyof QuizData,
    value: string | string[] | QuizData["imageMediaType"],
  ) => {
    setQuiz((prev) => ({ ...prev, [key]: value }));
  };

  const handleOccasionToggle = (occasion: string) => {
    setQuiz((prev) => {
      const exists = prev.occasions.includes(occasion);
      return {
        ...prev,
        occasions: exists
          ? prev.occasions.filter((item) => item !== occasion)
          : [...prev.occasions, occasion],
      };
    });
  };

  const handleGenderChange = (gender: string) => {
    setQuiz((prev) => ({
      ...prev,
      gender,
      bodyType: "",
    }));
  };

  const handleLovedColorToggle = (color: string) => {
    setQuiz((prev) => {
      if (color === "No preference") {
        const has = prev.lovedColors.includes("No preference");
        return {
          ...prev,
          lovedColors: has ? [] : ["No preference"],
        };
      }
      let next = prev.lovedColors.filter((c) => c !== "No preference");
      const exists = next.includes(color);
      if (exists) {
        next = next.filter((c) => c !== color);
      } else if (next.length < 5) {
        next = [...next, color];
      }
      return { ...prev, lovedColors: next };
    });
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    const base64 = await fileToBase64(file);
    setSkinToneDetectedMessage(null);
    setQuiz((prev) => ({
      ...prev,
      imageBase64: base64,
      imageMediaType: file.type as QuizData["imageMediaType"],
      imageName: file.name,
    }));
    setError("");

    try {
      const res = await fetch("/api/detect-skin-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          imageMediaType: file.type,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { skinTone?: string };
        const detected = data.skinTone;
        if (detected && ["Fair", "Wheatish", "Medium", "Dark"].includes(detected)) {
          setQuiz((prev) => ({ ...prev, skinTone: detected }));
          setSkinToneDetectedMessage(
            `We detected your skin tone as ${detected} — you can update this if needed.`,
          );
        }
      }
    } catch {
      /* optional detection */
    }
  };

  const runFakeAgentProgress = () => {
    setActiveAgentStep(0);
    const first = setTimeout(() => setActiveAgentStep(1), 1200);
    const second = setTimeout(() => setActiveAgentStep(2), 2400);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError("");
    setAnalysis(null);

    const stopProgress = runFakeAgentProgress();

    try {
      const response = await fetch("/api/style-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...quiz,
          imageBase64: quiz.imageBase64 || undefined,
          imageMediaType: quiz.imageMediaType || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      setAnalysis(data as AnalysisResult);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to generate your style guide right now.";
      setError(message);
    } finally {
      stopProgress();
      setIsLoading(false);
      setActiveAgentStep(2);
    }
  };

  const handleDownloadPdf = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    let y = 18;

    const addHeading = (title: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(title, 14, y);
      y += 8;
    };

    const addParagraph = (text: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 6 + 4;
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
    };

    addHeading("StyleYou - My Style Guide");
    addParagraph(
      `${analysis.stylePersonalityName}: ${analysis.stylePersonalityDescription}`,
    );

    addHeading("Your 3 Style Gaps");
    analysis.styleGaps.forEach((gap, index) => addParagraph(`${index + 1}. ${gap}`));

    addHeading("Wardrobe Recommendations");
    analysis.recommendations.forEach((item, index) => {
      addParagraph(
        `${index + 1}. ${item.itemName}\nWhy it works: ${item.whyItWorks}\nStyling tip: ${item.stylingTip}\nGoogle Images: ${getGoogleImagesSearchUrl(item.itemName)}`,
      );
    });

    addHeading("Outfit Combinations");
    analysis.outfitCombinations.forEach((look, index) => {
      addParagraph(
        `${index + 1}. ${look.title}\n${look.occasionContext}\n${look.outfitDetails}`,
      );
    });

    doc.save("styleyou-style-guide.pdf");
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-foreground sm:px-8">
      <section className="mb-10 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
        <p className="mb-4 inline-flex rounded-full bg-accent-soft px-4 py-1 text-sm font-medium text-[#7a5a3f]">
          AI-powered personal stylist
        </p>
        <h1 className="mb-3 text-4xl leading-tight sm:text-5xl">StyleYou</h1>
        <p className="max-w-2xl text-muted">
          Discover your signature wardrobe with quiz-based personalization,
          Claude-powered style analysis, and a downloadable style guide.
        </p>
      </section>

      {!analysis && (
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10"
        >
          <h2 className="mb-6 text-3xl">Step 1 - Style Quiz</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Gender"
              value={quiz.gender}
              options={genderOptions}
              onChange={handleGenderChange}
            />
            <SelectField
              label="Age range"
              value={quiz.ageRange}
              options={ageOptions}
              onChange={(value) => handleInput("ageRange", value)}
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-[#4f3d2f]">Body type</p>
            {!quiz.gender ? (
              <p className="text-sm text-muted">Select gender first to see body type options.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bodyTypeRows.map((row) => {
                  const active = quiz.bodyType === row.value;
                  return (
                    <button
                      key={row.value}
                      type="button"
                      onClick={() => handleInput("bodyType", row.value)}
                      className={`rounded-xl border p-3 text-left text-sm transition ${
                        active
                          ? "border-accent bg-accent-soft ring-1 ring-accent"
                          : "border-[#d8c8b8] bg-white hover:border-[#c4b5a8]"
                      }`}
                    >
                      <span className="font-medium text-[#3d2f26]">{row.title}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted">
                        {row.helper}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Current style description"
              value={quiz.currentStyle}
              options={styleOptions}
              onChange={(value) => handleInput("currentStyle", value)}
            />
            <SelectField
              label="Budget per outfit in INR"
              value={quiz.budget}
              options={budgetOptions}
              onChange={(value) => handleInput("budget", value)}
            />
          </div>

          <div className="mt-6">
            <p className="mb-1 text-sm font-medium text-[#4f3d2f]">
              Colours you love wearing
            </p>
            <p className="mb-3 text-xs text-muted">
              Pick up to 5, or only &quot;No preference&quot;. {quiz.lovedColors.length}/5 selected
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LOVED_COLOR_OPTIONS.map((color) => {
                const active = quiz.lovedColors.includes(color);
                const disabledNoPref =
                  color !== "No preference" &&
                  quiz.lovedColors.includes("No preference");
                const disabledMax =
                  color !== "No preference" &&
                  !active &&
                  quiz.lovedColors.length >= 5 &&
                  !quiz.lovedColors.includes("No preference");
                return (
                  <button
                    key={color}
                    type="button"
                    disabled={disabledNoPref || disabledMax}
                    onClick={() => handleLovedColorToggle(color)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-[#d8c8b8] bg-white text-[#4a3d34]"
                    }`}
                  >
                    {color}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-[#4f3d2f]">Vibe you want to go for</p>
            <div className="flex flex-wrap gap-2">
              {VIBE_OPTIONS.map((vibe) => {
                const active = quiz.vibe === vibe;
                return (
                  <button
                    key={vibe}
                    type="button"
                    onClick={() => handleInput("vibe", vibe)}
                    className={`rounded-full border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-[#d8c8b8] bg-white text-[#4a3d34]"
                    }`}
                  >
                    {vibe}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-[#4f3d2f]">
              Occasions they dress for
            </p>
            <div className="flex flex-wrap gap-2">
              {occasionOptions.map((occasion) => {
                const active = quiz.occasions.includes(occasion);
                return (
                  <button
                    key={occasion}
                    type="button"
                    onClick={() => handleOccasionToggle(occasion)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-[#d8c8b8] bg-white text-[#6a584b]"
                    }`}
                  >
                    {occasion}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-medium text-[#4f3d2f]">
              Brands they like (optional)
            </span>
            <input
              value={quiz.brands}
              onChange={(event) => handleInput("brands", event.target.value)}
              className="w-full rounded-xl border border-[#d8c8b8] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-accent-soft"
              placeholder="e.g. H&M, Zara, FabIndia"
            />
          </label>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-medium text-[#4f3d2f]">
              One photo upload (optional)
            </span>
            <p className="mb-2 text-xs text-muted">
              We can suggest skin tone from your photo — you can still change it below.
            </p>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleImageUpload}
              className="w-full rounded-xl border border-[#d8c8b8] bg-white px-4 py-3 text-sm"
            />
            {quiz.imageName ? (
              <p className="mt-2 text-sm text-muted">Uploaded: {quiz.imageName}</p>
            ) : null}
          </label>

          <div className="mt-6 max-w-md">
            <SelectField
              label="Skin tone"
              value={quiz.skinTone}
              options={skinToneOptions}
              onChange={(value) => {
                setSkinToneDetectedMessage(null);
                handleInput("skinTone", value);
              }}
            />
            {skinToneDetectedMessage ? (
              <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-[#5c4330]">
                {skinToneDetectedMessage}
              </p>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="mt-8 w-full rounded-2xl bg-accent px-6 py-3 font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isLoading ? "Generating your style guide..." : "Generate My Style Guide"}
          </button>
        </form>
      )}

      {isLoading && (
        <section className="mt-8 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
          <h2 className="mb-6 text-3xl">Step 2 - AI Style Analysis</h2>
          <div className="space-y-4">
            {analysisSteps.map((step, index) => {
              const done = index < activeAgentStep;
              const active = index === activeAgentStep;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-xl border p-4 transition ${
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-[#e8ddd2] bg-white"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      done || active
                        ? "bg-accent text-white"
                        : "bg-[#e8ddd2] text-[#6f5d4e]"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <p className="text-sm sm:text-base">{step}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {analysis && (
        <section className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <PexelsImage
                key={`mood-${slot}`}
                variant="mood"
                personality={analysis.stylePersonalityName}
                gender={quiz.gender}
                currentStyle={quiz.currentStyle}
                skinTone={quiz.skinTone}
                lovedColors={quiz.lovedColors}
                vibe={quiz.vibe}
                slot={slot}
                alt={`${analysis.stylePersonalityName} mood board ${slot + 1}`}
                imageClassName="h-[180px] w-full rounded-2xl object-cover sm:h-[200px]"
                placeholderClassName="h-[180px] w-full rounded-2xl bg-[#ddd5ce] sm:h-[200px]"
              />
            ))}
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
            <h2 className="text-3xl">Step 3 - Your Style Results</h2>
            <p className="mt-3 text-lg font-semibold text-accent">
              {analysis.stylePersonalityName}
            </p>
            <p className="mt-2 text-muted">{analysis.stylePersonalityDescription}</p>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
            <h3 className="text-2xl">3 Style Gaps to Fix</h3>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-muted">
              {analysis.styleGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
            <h3 className="text-2xl">6 Wardrobe Recommendations</h3>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.recommendations.map((item) => (
                <article
                  key={item.itemName}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e8ddd2] bg-white"
                >
                  <PexelsImage
                    variant="recommendation"
                    itemName={item.itemName}
                    gender={quiz.gender}
                    currentStyle={quiz.currentStyle}
                    occasions={quiz.occasions}
                    skinTone={quiz.skinTone}
                    lovedColors={quiz.lovedColors}
                    vibe={quiz.vibe}
                    alt={`Style reference for ${item.itemName}`}
                    imageClassName="h-[200px] w-full rounded-t-2xl object-cover"
                    placeholderClassName="h-[200px] w-full rounded-t-2xl bg-[#ddd5ce]"
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <h4 className="text-xl">{item.itemName}</h4>
                    <p className="mt-2 text-sm text-muted">{item.whyItWorks}</p>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Styling tip:</span>{" "}
                      {item.stylingTip}
                    </p>
                    <div className="mt-auto pt-4">
                      <a
                        href={getGoogleImagesSearchUrl(item.itemName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-xl bg-accent px-4 py-2 text-sm text-white"
                      >
                        Browse on Google Images →
                      </a>
                      <p className="mt-2 text-xs text-muted">
                        Opens Google Images for this item (from your style profile)
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-[#e8ddd2] sm:p-10">
            <h3 className="text-2xl">3 Outfit Combinations</h3>
            <div className="mt-5 space-y-4">
              {analysis.outfitCombinations.map((look) => (
                <article
                  key={look.title}
                  className="rounded-2xl border border-[#e8ddd2] bg-white p-4"
                >
                  <h4 className="text-xl">{look.title}</h4>
                  <p className="mt-2 text-sm font-medium text-[#5f4b3a]">
                    {look.occasionContext}
                  </p>
                  <p className="mt-2 text-sm text-muted">{look.outfitDetails}</p>
                </article>
              ))}
            </div>
          </div>

          <button
            onClick={handleDownloadPdf}
            className="w-full rounded-2xl bg-accent px-6 py-3 font-medium text-white transition hover:brightness-95 sm:w-auto"
          >
            Download My Style Guide
          </button>
        </section>
      )}
    </main>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#4f3d2f]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#d8c8b8] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:bg-[#f2ece6]"
      >
        <option value="">{disabled ? "Select gender first" : "Select one"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Unable to read uploaded image."));
        return;
      }
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Unable to read uploaded image."));
    reader.readAsDataURL(file);
  });
}

type PexelsImageProps =
  | {
      variant: "recommendation";
      itemName: string;
      gender: string;
      currentStyle: string;
      occasions: string[];
      skinTone: string;
      lovedColors: string[];
      vibe: string;
      alt: string;
      imageClassName: string;
      placeholderClassName: string;
    }
  | {
      variant: "mood";
      personality: string;
      gender: string;
      currentStyle: string;
      skinTone: string;
      lovedColors: string[];
      vibe: string;
      slot: number;
      alt: string;
      imageClassName: string;
      placeholderClassName: string;
    };

function buildPexelsImageRequestUrl(props: PexelsImageProps): string {
  if (props.variant === "recommendation") {
    const params = new URLSearchParams({
      type: "recommendation",
      itemName: props.itemName,
      gender: props.gender,
      style: props.currentStyle,
      occasions: props.occasions.join(","),
      skinTone: props.skinTone,
      lovedColors: props.lovedColors.join(","),
      vibe: props.vibe,
    });
    return `/api/image?${params.toString()}`;
  }
  const params = new URLSearchParams({
    type: "mood",
    personality: props.personality,
    gender: props.gender,
    style: props.currentStyle,
    skinTone: props.skinTone,
    lovedColors: props.lovedColors.join(","),
    vibe: props.vibe,
    slot: String(props.slot),
  });
  return `/api/image?${params.toString()}`;
}

function getPexelsImageCacheKey(props: PexelsImageProps): string {
  return buildPexelsImageRequestUrl(props);
}

function PexelsImage(props: PexelsImageProps) {
  const { alt, imageClassName, placeholderClassName } = props;
  const cacheKey = getPexelsImageCacheKey(props);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImageUrl(null);
    setFailed(false);
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;

    const fetchImage = async () => {
      try {
        const response = await fetch(cacheKey);
        if (!response.ok) {
          throw new Error("Image API request failed.");
        }

        const data = (await response.json()) as { imageUrl?: string | null };
        if (!cancelled) {
          if (data.imageUrl) {
            setImageUrl(data.imageUrl);
          } else {
            setFailed(true);
          }
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void fetchImage();

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  if (!imageUrl || failed) {
    return (
      <div
        className={placeholderClassName}
        role="img"
        aria-label={`${alt} placeholder`}
      />
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={1200}
      height={800}
      className={imageClassName}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
