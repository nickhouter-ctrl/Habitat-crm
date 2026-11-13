/**
 * Captions voor de social-posts: eerst Engels, dan een regel "—", dan Spaans,
 * dan de plaatsregel en de lokale hashtags.
 *
 * De AI-tekst (Anthropic vision, zelfde patroon als lib/marketing/ai-copy.ts:
 * fetch op de Messages-API, model uit ANTHROPIC_MODEL, null bij ontbrekende
 * key of fout) kijkt naar de gekozen beelden. Zonder sleutel valt alles terug
 * op een nette sjabloontekst per thema — de planning werkt altijd.
 *
 * Harde regel van de eigenaar: geen feiten die we niet kunnen bewijzen (geen
 * brandklasse, diktes, gewichten, prijzen, garanties). Die zinnen worden
 * server-side geschrapt, wat het model ook schrijft.
 */
import type { SocialPostKind } from "./planner";
import { THEME_HASHTAGS, isSocialTheme, type SocialTheme } from "./themes";

export const LOCATION_LINE = "📍 Jávea · Costa Blanca";
export const SEPARATOR = "—";
export const LOCAL_HASHTAGS = [
  "#Javea",
  "#Xabia",
  "#CostaBlanca",
  "#Denia",
  "#Moraira",
  "#Benitachell",
  "#piedraflexible",
  "#flexiblestone",
  "#HabitatOne",
];
/** Instagram staat maximaal 30 hashtags toe. */
export const MAX_HASHTAGS = 30;

/** Zinnen met niet-verifieerbare claims (maten, brandklasse, prijs, garantie). */
const RISKY = [
  /\d+([.,]\d+)?\s?(mm|cm|m²|m2|kg|g\/m|%|€|eur|euros?|years?|años?)\b/i,
  /€\s?\d/,
  /\b(fire|fireproof|fire-?rated|flame|ign[ií]fug|incombustib|non-?combustible|a1|b-?s1|euroclass)/i,
  /\b(price|prices|precio|precios|cheap|barato|discount|descuento|offer|oferta)\b/i,
  /\b(warranty|guarantee|garant[ií]a|lifetime|de por vida)\b/i,
  /\b(thickness|grosor|espesor|weighs?|peso)\b/i,
];

export function hasRiskyClaim(sentence: string): boolean {
  return RISKY.some((re) => re.test(sentence));
}

/** Schrap zinnen met niet-verifieerbare claims; behoud alinea-indeling. */
export function stripRiskyClaims(text: string): string {
  return text
    .split(/\n/)
    .map((line) =>
      (line.match(/[^.!?]+[.!?]*\s*/g) ?? [line])
        .filter((s) => !hasRiskyClaim(s))
        .join("")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "#tag" netjes maken; ongeldige tags → null. */
export function normalizeHashtag(tag: string): string | null {
  const t = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return t ? `#${t}` : null;
}

export function buildHashtags(theme: SocialTheme | "mixed" | string, extra: string[] = []): string[] {
  const topic = isSocialTheme(theme) ? THEME_HASHTAGS[theme] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...LOCAL_HASHTAGS, ...topic, ...extra]) {
    const tag = normalizeHashtag(raw);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** Het vaste formaat: EN → "—" → ES → plaats → hashtags. */
export function formatCaption(parts: { en: string; es: string; hashtags: string[] }): string {
  const en = stripRiskyClaims(parts.en.replace(/#[\p{L}\p{N}_]+/gu, "")).trim();
  const es = stripRiskyClaims(parts.es.replace(/#[\p{L}\p{N}_]+/gu, "")).trim();
  return [en, SEPARATOR, es, LOCATION_LINE, parts.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

/* ----------------------------------------------------------- sjabloontekst */

const FALLBACK: Record<string, { en: string; es: string }> = {
  installation: {
    en: "From bare wall to finished stone, step by step. Flexible stone is bonded straight onto the wall and follows every corner.",
    es: "De pared desnuda a piedra terminada, paso a paso. La piedra flexible se pega directamente a la pared y sigue cada esquina.",
  },
  texture: {
    en: "Run your hand over it: real stone grain, warm to the touch, in a sheet that bends.",
    es: "Pasa la mano: la veta real de la piedra, cálida al tacto, en una lámina que se curva.",
  },
  column: {
    en: "A column wrapped in one continuous piece of stone. No joints, no cuts, just texture all the way round.",
    es: "Una columna envuelta en una sola pieza de piedra. Sin juntas ni cortes, solo textura de arriba abajo.",
  },
  shower: {
    en: "A stone shower that feels like a Mediterranean villa, with light, seamless sheets instead of heavy slabs.",
    es: "Una ducha de piedra con alma de villa mediterránea, con láminas ligeras y continuas en lugar de losas pesadas.",
  },
  bathroom: {
    en: "Natural stone texture for the bathroom, calm and warm, in the spirit of the Costa Blanca.",
    es: "Textura de piedra natural para el baño, serena y cálida, con el espíritu de la Costa Blanca.",
  },
  kitchen: {
    en: "The kitchen wall as the quiet centre of the home: stone texture that brings warmth to every meal.",
    es: "La pared de la cocina como centro tranquilo de la casa: textura de piedra que da calidez a cada comida.",
  },
  curved: {
    en: "Curves, arches and rounded walls: flexible stone follows the shape instead of fighting it.",
    es: "Curvas, arcos y paredes redondeadas: la piedra flexible sigue la forma en lugar de luchar contra ella.",
  },
  outdoor: {
    en: "Whitewashed walls, olive trees, sea light, and a stone facade that belongs right there.",
    es: "Paredes encaladas, olivos, luz de mar, y una fachada de piedra que pertenece a ese lugar.",
  },
  benefit: {
    en: "Stone texture in a sheet that bends around corners and curves. Ask us how it would work in your home.",
    es: "Textura de piedra en una lámina que se adapta a esquinas y curvas. Pregúntanos cómo quedaría en tu casa.",
  },
};
const FALLBACK_DEFAULT = {
  en: "Stone texture for Mediterranean homes, made with flexible stone sheets. Visit us in Jávea to see and touch the collection.",
  es: "Textura de piedra para casas mediterráneas, con láminas de piedra flexible. Visítanos en Jávea para ver y tocar la colección.",
};

export function fallbackCaption(theme: string, kind: SocialPostKind): string {
  const base = FALLBACK[theme] ?? FALLBACK_DEFAULT;
  const cta =
    kind === "carousel" || kind === "howto"
      ? { en: " Swipe through.", es: " Desliza para ver más." }
      : { en: "", es: "" };
  return formatCaption({ en: base.en + cta.en, es: base.es + cta.es, hashtags: buildHashtags(theme) });
}

/* -------------------------------------------------------------- AI-tekst */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiCaptionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You write organic Instagram and Facebook captions for Habitat One in Jávea (Xàbia), Costa Blanca, which supplies and installs flexible stone wall panels (Flex-Surfaces / Stone-Motion). Audience: owners and builders of luxury Spanish homes on the Costa Blanca. Style direction: the Spanish villa / Ibiza look: whitewashed walls, natural lime and travertine, warm wooden beams, terracotta, arches, olive trees, pools, sea light. Tone: warm, calm, tactile and concrete, never generic or hotel-like, no hype, no exclamation marks, at most one emoji per language. Spanish is written natively (Castilian), not as a translation. NEVER state facts you cannot see or verify: no fire ratings, no thickness, weight or dimensions, no prices, discounts or warranties, no certifications.`;

const KIND_BRIEF: Record<SocialPostKind, string> = {
  carousel: "a carousel; end with a short invitation to swipe",
  howto: "an installation / how-to carousel: explain the steps you can see, plainly, as a short numbered sequence if it fits",
  single: "a single photo; one or two sentences about what you see and how it feels",
  video: "a short explanatory Reel (about 10–15 seconds) showing the stone and how it is used",
};

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

/** Parse het modelantwoord naar {en, es, tags}; null bij onbruikbaar antwoord. */
export function parseCaptionResponse(text: string): { en: string; es: string; tags: string[] } | null {
  try {
    const raw = JSON.parse(stripFences(text)) as Record<string, unknown>;
    const en = typeof raw.en === "string" ? raw.en.trim() : "";
    const es = typeof raw.es === "string" ? raw.es.trim() : "";
    if (!en || !es) return null;
    const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string").slice(0, 6) : [];
    return { en: en.slice(0, 900), es: es.slice(0, 900), tags };
  } catch {
    return null;
  }
}

export interface CaptionRequest {
  kind: SocialPostKind;
  theme: string;
  /** Publieke URL's van de beelden (max 5 gaan mee). */
  imageUrls: string[];
  /** Bestandsnamen — extra context (bv. "curved-shower"). */
  imageNames?: string[];
}

/** AI-caption in het vaste formaat; null bij ontbrekende key of fout. */
export async function generateCaption(req: CaptionRequest): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const images = req.imageUrls.filter((u) => /^https:\/\//.test(u)).slice(0, 5);
  const prompt = `Write the caption for ${KIND_BRIEF[req.kind]}. Theme: ${req.theme}.
${images.length ? "Look carefully at the attached image(s) and describe what is really there (material, light, space, hands, tools). Do not invent rooms or features that are not visible." : ""}
${req.imageNames?.length ? `File names for context: ${req.imageNames.slice(0, 5).join(", ")}.` : ""}
Write an English version (max ~60 words) and a Spanish version (max ~60 words) with the same meaning. Do not include hashtags or the location line in the text; suggest up to 4 extra topic hashtags.
Return ONLY a JSON object (no markdown): {"en": "...", "es": "...", "tags": ["#...", "#..."]}`;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.7,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...images.map((url) => ({ type: "image", source: { type: "url", url } })),
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[social] AI-caption faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("\n");
    const parsed = parseCaptionResponse(text);
    if (!parsed) return null;
    return formatCaption({ en: parsed.en, es: parsed.es, hashtags: buildHashtags(req.theme, parsed.tags) });
  } catch (err) {
    console.warn("[social] AI-caption error:", err);
    return null;
  }
}

/** Prompt voor de AI-video (Higgsfield image-to-video): uitleggend, villa-stijl, geen tekst in beeld. */
export function videoPrompt(theme: string): string {
  const subject: Record<string, string> = {
    installation: "hands pressing a flexible stone sheet onto a wall and smoothing it, then the camera pulls back to the finished wall",
    texture: "a hand slowly running across the stone surface, macro close-up of the grain, then a gentle pull back to the full wall",
    column: "the camera circles a column wrapped in continuous stone, showing there are no joints",
    shower: "slow dolly into a stone shower, water starting to run over the stone",
    curved: "the camera follows a curved stone wall around an arch, light moving across the texture",
  };
  return `${subject[theme] ?? "slow, steady camera move revealing the stone wall and its texture up close"}. Spanish luxury villa, Ibiza style: whitewashed walls, natural lime and travertine, warm wooden beams, terracotta, soft Mediterranean sea light. Realistic, natural, calm movement, no people's faces, no text, no logos, no dark or black marble.`;
}
