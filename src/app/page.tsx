"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

const GENDER_CARDS = [
  { value: "Woman", icon: "♀", label: "Woman" },
  { value: "Man", icon: "♂", label: "Man" },
  { value: "Non-binary", icon: "◈", label: "Non-binary" },
] as const;

const ageOptions = ["18-24", "25-34", "35-44", "45+"];
const skinToneOptions = ["Fair", "Wheatish", "Medium", "Dark"];
const occasionOptions = [
  "Work",
  "Dates",
  "Weddings",
  "Casual outings",
  "Gym",
  "Parties",
];
const budgetOptions = ["Under 2000", "2000-5000", "5000-15000", "15000+"];

const analysisStepsDisplay = [
  "Analysing your style profile...",
  "Building your wardrobe...",
  "Creating your style guide...",
];

const STYLE_TIPS = [
  "Did you know? Wearing colours that complement your skin tone can make you look 10 years younger.",
  "Style tip: The right fit matters more than the brand.",
  "Style tip: One statement piece elevates any outfit.",
];

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

const initialQuiz: QuizData = {
  gender: "",
  ageRange: "",
  bodyType: "",
  skinTone: "",
  lovedColors: [],
  vibe: "",
  occasions: [],
  budget: "",
  brands: "",
  imageBase64: "",
  imageMediaType: "",
  imageName: "",
};

function genderTermForImages(gender: string): string {
  const g = gender.trim().toLowerCase();
  if (g === "woman") return "women";
  if (g === "man") return "men";
  if (g === "non-binary" || g === "nonbinary") return "unisex";
  return "";
}

function normalizeVibeForImages(vibe: string): string {
  return vibe
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrandChunk(brands: string): string {
  const t = brands.trim();
  if (!t) return "";
  return t
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/** Google Images search: item + gender + vibe + optional brands */
function getBrowseMoreImagesUrl(
  itemName: string,
  gender: string,
  vibe: string,
  brands: string,
): string {
  const itemKeywords = itemName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");
  const itemPart = itemKeywords || itemName.trim().toLowerCase() || "fashion";
  const genderPart = genderTermForImages(gender);
  const vibePart = normalizeVibeForImages(vibe || "");
  const brandPart = normalizeBrandChunk(brands || "");

  const query = [itemPart, genderPart, vibePart, brandPart].filter(Boolean).join(" ");
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function sectionCanAdvance(step: number, quiz: QuizData): boolean {
  if (step === 1) return Boolean(quiz.gender && quiz.ageRange);
  if (step === 2) return Boolean(quiz.gender && quiz.bodyType && quiz.budget);
  if (step === 3)
    return (
      isLovedColorsValid(quiz.lovedColors) &&
      Boolean(quiz.vibe) &&
      quiz.occasions.length > 0
    );
  if (step === 4) return Boolean(quiz.skinTone);
  return false;
}

export default function Home() {
  const [quiz, setQuiz] = useState<QuizData>(initialQuiz);
  const [quizStep, setQuizStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentStep, setActiveAgentStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [skinToneDetectedMessage, setSkinToneDetectedMessage] = useState<string | null>(
    null,
  );
  const [tipIndex, setTipIndex] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const quizSectionRef = useRef<HTMLDivElement>(null);

  const bodyTypeRows = useMemo(() => bodyTypeRowsForGender(quiz.gender), [quiz.gender]);

  const canSubmit =
    Boolean(quiz.gender) &&
    Boolean(quiz.ageRange) &&
    Boolean(quiz.bodyType) &&
    Boolean(quiz.skinTone) &&
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
      /* optional */
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

  useEffect(() => {
    if (!isLoading) return;
    setTipIndex(0);
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % STYLE_TIPS.length);
    }, 3000);
    return () => clearInterval(id);
  }, [isLoading]);

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
        `${index + 1}. ${item.itemName}\nWhy it works: ${item.whyItWorks}\nStyling tip: ${item.stylingTip}\nGoogle Images: ${getBrowseMoreImagesUrl(item.itemName, quiz.gender, quiz.vibe, quiz.brands)}`,
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

  const scrollToQuiz = () => {
    quizSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleShare = async () => {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const text = `I just got my personal AI style guide from StyleYou — it matched recommendations to my body type and skin tone. Try it free: ${base || "https://styleyou.vercel.app"}`;
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      setShareCopied(false);
    }
  };

  const cardHover =
    "transition-transform duration-300 ease-out hover:scale-[1.02] hover:shadow-md";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {!analysis && (
        <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 font-sans text-xs font-medium uppercase tracking-[0.2em] text-accent">
              StyleYou
            </p>
            <h1 className="mb-6 text-[2rem] leading-[1.08] tracking-tight text-accent-dark sm:text-5xl sm:leading-[1.05] md:text-6xl md:leading-[1.02] lg:text-7xl">
              Dress like the best version of you
            </h1>
            <p className="mx-auto mb-10 max-w-xl font-sans text-base leading-relaxed text-muted sm:text-lg">
              Answer a few questions. Get personalised style recommendations matched to your body,
              skin tone, and budget — for free.
            </p>
            <p
              className="mb-5 text-[13px] italic"
              style={{ color: "#8B8B8B", fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}
            >
              Crafted by Kavita Priyadarshini
            </p>
            <button
              type="button"
              onClick={scrollToQuiz}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105"
            >
              Start My Style Quiz →
            </button>
            <div className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-4 sm:max-w-none sm:grid-cols-3 sm:gap-5">
              {[
                { emoji: "👗", text: "Built for your body shape" },
                { emoji: "🎨", text: "Colours that actually suit you" },
                { emoji: "✨", text: "Style advice you can afford" },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex flex-col items-center rounded-2xl bg-[#F5F0E8] px-5 py-5 text-center shadow-md transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="text-2xl" aria-hidden>
                    {item.emoji}
                  </span>
                  <p className="mt-3 font-serif text-sm leading-snug text-accent-dark">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {!analysis && (
        <div ref={quizSectionRef} id="style-quiz" className="mx-auto max-w-3xl px-4 pb-16 sm:px-8">
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-accent/15 bg-card p-6 shadow-xl shadow-accent-dark/5 sm:p-10"
          >
            <div className="mb-8">
              <div className="mb-2 flex items-center justify-between font-sans text-sm text-muted">
                <span>
                  Step {quizStep} of 4
                </span>
                <span>{Math.round((quizStep / 4) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                  style={{ width: `${(quizStep / 4) * 100}%` }}
                />
              </div>
            </div>

            <h2 className="mb-8 text-center text-2xl text-accent-dark sm:text-3xl">
              Style quiz
            </h2>

            {quizStep === 1 && (
              <div key="s1" className="animate-section-in space-y-10">
                <div>
                  <p className="mb-4 font-sans text-sm font-medium text-accent-dark">Gender</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {GENDER_CARDS.map((g) => {
                      const active = quiz.gender === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => handleGenderChange(g.value)}
                          className={`flex flex-col items-center rounded-2xl border-2 p-6 text-center ${cardHover} ${
                            active
                              ? "border-accent bg-accent-soft shadow-inner"
                              : "border-transparent bg-accent-soft/40 ring-1 ring-accent/10"
                          }`}
                        >
                          <span className="text-3xl">{g.icon}</span>
                          <span className="mt-2 font-sans text-sm font-semibold text-accent-dark">
                            {g.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-3 font-sans text-sm font-medium text-accent-dark">Age range</p>
                  <div className="flex flex-wrap gap-2">
                    {ageOptions.map((age) => {
                      const active = quiz.ageRange === age;
                      return (
                        <button
                          key={age}
                          type="button"
                          onClick={() => handleInput("ageRange", age)}
                          className={`rounded-full border-2 px-4 py-2.5 font-sans text-sm transition ${
                            active
                              ? "scale-105 border-accent bg-accent text-white"
                              : "border-accent/20 bg-background text-foreground hover:border-accent/40"
                          }`}
                        >
                          {age}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {quizStep === 2 && (
              <div key="s2" className="animate-section-in space-y-10">
                <div>
                  <p className="mb-4 font-sans text-sm font-medium text-accent-dark">Body type</p>
                  {!quiz.gender ? (
                    <p className="font-sans text-sm text-muted">Select gender in step 1 first.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {bodyTypeRows.map((row) => {
                        const active = quiz.bodyType === row.value;
                        return (
                          <button
                            key={row.value}
                            type="button"
                            onClick={() => handleInput("bodyType", row.value)}
                            className={`rounded-2xl border-2 p-4 text-left ${cardHover} ${
                              active
                                ? "border-accent bg-accent-soft shadow-md"
                                : "border-accent/15 bg-background ring-1 ring-accent/10"
                            }`}
                          >
                            <span className="font-sans text-sm font-semibold text-accent-dark">
                              {row.title}
                            </span>
                            <span className="mt-1 block font-sans text-xs leading-snug text-muted">
                              {row.helper}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-3 font-sans text-sm font-medium text-accent-dark">
                    Budget per outfit (INR)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {budgetOptions.map((b) => {
                      const active = quiz.budget === b;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => handleInput("budget", b)}
                          className={`rounded-full border-2 px-4 py-2.5 font-sans text-sm transition ${
                            active
                              ? "scale-105 border-accent bg-accent text-white"
                              : "border-accent/20 bg-background hover:border-accent/40"
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {quizStep === 3 && (
              <div key="s3" className="animate-section-in space-y-10">
                <div>
                  <p className="mb-1 font-sans text-sm font-medium text-accent-dark">
                    Colours you love wearing
                  </p>
                  <p className="mb-3 font-sans text-xs text-muted">
                    Pick up to 5, or only &quot;No preference&quot;. {quiz.lovedColors.length}/5
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
                          className={`rounded-xl border-2 px-3 py-2.5 text-left font-sans text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                              ? "animate-pop border-accent bg-accent text-white"
                              : "border-accent/15 bg-background hover:border-accent/30"
                          }`}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-3 font-sans text-sm font-medium text-accent-dark">
                    Vibe you want to go for
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {VIBE_OPTIONS.map((v) => {
                      const active = quiz.vibe === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleInput("vibe", v)}
                          className={`rounded-full border-2 px-3 py-2 font-sans text-sm transition ${
                            active
                              ? "scale-105 border-accent bg-accent text-white"
                              : "border-accent/15 bg-background hover:border-accent/30"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-3 font-sans text-sm font-medium text-accent-dark">
                    Occasions you want to buy for
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {occasionOptions.map((occasion) => {
                      const active = quiz.occasions.includes(occasion);
                      return (
                        <button
                          key={occasion}
                          type="button"
                          onClick={() => handleOccasionToggle(occasion)}
                          className={`rounded-full border-2 px-3 py-2 font-sans text-sm transition ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-accent/15 bg-background hover:border-accent/30"
                          }`}
                        >
                          {occasion}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {quizStep === 4 && (
              <div key="s4" className="animate-section-in space-y-8">
                <label className="block">
                  <span className="mb-2 block font-sans text-sm font-medium text-accent-dark">
                    Brands you like (optional)
                  </span>
                  <input
                    value={quiz.brands}
                    onChange={(event) => handleInput("brands", event.target.value)}
                    className="w-full rounded-2xl border border-accent/20 bg-background px-4 py-3 font-sans text-sm outline-none ring-accent/30 focus:ring-2"
                    placeholder="e.g. H&M, Zara, FabIndia"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block font-sans text-sm font-medium text-accent-dark">
                    Photo (optional)
                  </span>
                  <p className="mb-2 font-sans text-xs text-muted">
                    We can suggest skin tone from your photo.
                  </p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleImageUpload}
                    className="w-full rounded-2xl border border-accent/20 bg-background px-4 py-3 font-sans text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:font-medium file:text-accent-dark"
                  />
                  {quiz.imageName ? (
                    <p className="mt-2 font-sans text-xs text-muted">Uploaded: {quiz.imageName}</p>
                  ) : null}
                </label>
                <div>
                  <p className="mb-3 font-sans text-sm font-medium text-accent-dark">Skin tone</p>
                  <div className="flex flex-wrap gap-2">
                    {skinToneOptions.map((tone) => {
                      const active = quiz.skinTone === tone;
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => {
                            setSkinToneDetectedMessage(null);
                            handleInput("skinTone", tone);
                          }}
                          className={`rounded-full border-2 px-4 py-2 font-sans text-sm transition ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-accent/15 bg-background hover:border-accent/30"
                          }`}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                  {skinToneDetectedMessage ? (
                    <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 font-sans text-xs text-accent-dark">
                      {skinToneDetectedMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {error ? <p className="mt-6 font-sans text-sm text-red-600">{error}</p> : null}

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-between">
              {quizStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setQuizStep((s) => Math.max(1, s - 1))}
                  className="order-2 rounded-full border-2 border-accent/30 px-6 py-3 font-sans text-sm font-medium text-accent-dark transition hover:bg-accent-soft sm:order-1"
                >
                  ← Back
                </button>
              ) : (
                <span className="hidden sm:block sm:w-28" />
              )}
              {quizStep < 4 ? (
                <button
                  type="button"
                  disabled={!sectionCanAdvance(quizStep, quiz)}
                  onClick={() => setQuizStep((s) => Math.min(4, s + 1))}
                  className="order-1 rounded-full bg-accent px-8 py-3 font-sans text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 sm:order-2 sm:ml-auto"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSubmit || isLoading}
                  className="order-1 rounded-full bg-accent px-8 py-3 font-sans text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 sm:order-2 sm:ml-auto"
                >
                  {isLoading ? "Generating…" : "Generate My Style Guide"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/95 px-6 backdrop-blur-md">
          <div className="pulse-gold mb-10 h-24 w-24 rounded-full bg-accent/30 ring-4 ring-accent/40 ring-offset-4 ring-offset-background" />
          <h2 className="mb-2 text-center text-2xl text-accent-dark">Crafting your guide</h2>
          <div className="mb-10 w-full max-w-md space-y-4">
            {analysisStepsDisplay.map((step, index) => {
              const done = index < activeAgentStep;
              const active = index === activeAgentStep;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 font-sans text-sm transition ${
                    active ? "border-accent bg-accent-soft" : "border-accent/10 bg-card"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      done ? "bg-accent text-white" : active ? "bg-accent text-white" : "bg-accent-soft text-muted"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span className={done || active ? "text-accent-dark" : "text-muted"}>{step}</span>
                </div>
              );
            })}
          </div>
          <p className="max-w-md text-center font-sans text-sm italic text-muted transition-opacity duration-500">
            {STYLE_TIPS[tipIndex]}
          </p>
        </div>
      )}

      {analysis && (
        <section className="mx-auto max-w-6xl space-y-10 px-4 pb-20 pt-10 sm:px-8">
          <h2 className="text-center text-3xl text-accent-dark sm:text-4xl">
            Your style personality is ready ✨
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <PexelsImage
                key={`mood-${slot}`}
                variant="mood"
                personality={analysis.stylePersonalityName}
                gender={quiz.gender}
                skinTone={quiz.skinTone}
                lovedColors={quiz.lovedColors}
                vibe={quiz.vibe}
                slot={slot}
                alt={`${analysis.stylePersonalityName} mood board ${slot + 1}`}
                imageClassName="h-[180px] w-full rounded-2xl object-cover sm:h-[200px]"
                placeholderClassName="h-[180px] w-full rounded-2xl bg-accent-soft sm:h-[200px]"
              />
            ))}
          </div>

          <div className="rounded-3xl border border-accent/10 bg-card p-8 text-center shadow-lg">
            <h3 className="text-3xl font-semibold text-accent-dark sm:text-4xl">
              {analysis.stylePersonalityName}
            </h3>
            <p className="mx-auto mt-4 max-w-2xl font-sans text-muted">
              {analysis.stylePersonalityDescription}
            </p>
          </div>

          <div className="rounded-3xl border border-accent/10 bg-card p-8 shadow-lg">
            <h3 className="text-2xl text-accent-dark">Style gaps to fix</h3>
            <ul className="mt-6 space-y-3 font-sans text-muted">
              {analysis.styleGaps.map((gap) => (
                <li key={gap} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-6 text-2xl text-accent-dark">Wardrobe picks</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.recommendations.map((item, idx) => (
                <article
                  key={item.itemName}
                  className={`animate-result-card flex h-full flex-col overflow-hidden rounded-2xl border border-accent/10 bg-card shadow-md ${cardHover}`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <PexelsImage
                    variant="recommendation"
                    itemName={item.itemName}
                    gender={quiz.gender}
                    occasions={quiz.occasions}
                    skinTone={quiz.skinTone}
                    lovedColors={quiz.lovedColors}
                    vibe={quiz.vibe}
                    alt={item.itemName}
                    imageClassName="h-[200px] w-full object-cover"
                    placeholderClassName="h-[200px] w-full bg-accent-soft"
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <h4 className="text-lg text-accent-dark">{item.itemName}</h4>
                    <p className="mt-3 font-sans text-[10px] font-bold uppercase tracking-widest text-accent">
                      Why this works for you
                    </p>
                    <p className="mt-2 font-sans text-sm text-muted">{item.whyItWorks}</p>
                    <blockquote className="mt-4 border-l-4 border-accent pl-4 font-sans text-sm italic text-accent-dark/90">
                      {item.stylingTip}
                    </blockquote>
                    <div className="mt-auto pt-6">
                      <a
                        href={getBrowseMoreImagesUrl(
                          item.itemName,
                          quiz.gender,
                          quiz.vibe,
                          quiz.brands,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-semibold text-white transition hover:brightness-105"
                      >
                        Browse More →
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-accent/10 bg-card p-8 shadow-lg">
            <h3 className="text-2xl text-accent-dark">Outfit combinations</h3>
            <div className="mt-6 space-y-5">
              {analysis.outfitCombinations.map((look) => (
                <article
                  key={look.title}
                  className="rounded-2xl border border-accent/10 bg-background p-5"
                >
                  <h4 className="text-lg text-accent-dark">{look.title}</h4>
                  <p className="mt-2 font-sans text-sm font-medium text-accent">{look.occasionContext}</p>
                  <p className="mt-2 font-sans text-sm text-muted">{look.outfitDetails}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-accent/15 bg-accent-soft/50 p-8 text-center">
            <h3 className="text-2xl text-accent-dark">Love your style guide?</h3>
            <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted">
              Save it or tell a friend — spreading good style is always in fashion.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="rounded-full border-2 border-accent bg-card px-8 py-3 font-sans text-sm font-semibold text-accent-dark transition hover:bg-accent-soft"
              >
                Download Style Guide
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="rounded-full bg-accent px-8 py-3 font-sans text-sm font-semibold text-white transition hover:brightness-105"
              >
                {shareCopied ? "Copied!" : "Share StyleYou with a friend"}
              </button>
            </div>
          </div>
        </section>
      )}
      <footer className="px-4 pb-8 pt-2 text-center sm:px-8">
        <p className="font-sans text-xs text-muted">
          © 2026 StyleYou <span className="mx-1 text-muted/80">·</span> Crafted by{" "}
          <a
            href="https://www.linkedin.com/in/kavitapriyadarshini"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A96E] no-underline transition hover:underline"
          >
            Kavita Priyadarshini
          </a>
        </p>
      </footer>
    </main>
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
