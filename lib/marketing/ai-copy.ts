/**
 * AI-copygeneratie voor de creative-editor (taak U3 — de operator heeft het
 * geen-LLM-uitgangspunt van brief §2 opgeheven voor dit pad).
 *
 * Volgt de conventies van lib/leads/ai-copy.ts: Anthropic Messages-API via
 * fetch, model uit `ANTHROPIC_MODEL`, huisstijl-systeemprompt, JSON-uitvoer
 * met stripFences, en **null bij ontbrekende key of fout** — de editor valt
 * dan terug op de copyblokken ("Vul automatisch"). De AI is een optie, geen
 * afhankelijkheid: zonder API-sleutel blijft alles werken.
 *
 * Tekenlimieten per sjabloon × formaat gaan mee in de prompt én worden
 * server-side afgedwongen (afkappen op woordgrens) — het model is een
 * copywriter, de registry blijft de wet (§6b).
 */
import type { CopyLimits } from "@/lib/creatives/templates";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/** Is er een API-sleutel? (Voor de UI: knop tonen of verbergen.) */
export function aiCreativeCopyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

const SYSTEM = `Je bent een top-copywriter voor Habitat One, een exclusieve interieur- en bouwmaterialenleverancier aan de Costa Blanca (Xàbia/Jávea): keukenbladen, natuursteen, badkamers, buitenkeukens — geleverd én gemonteerd. Je schrijft korte advertentieteksten voor Meta-beelden (Instagram/Facebook). Verfijnd, warm en mediterraan-luxe; zintuiglijk en beeldend (licht, textuur, materiaal, ambacht) zonder zweverig te worden. Doelgroep: particulieren en professionals aan de Costa Blanca. Regels: geen clichés als "de beste kwaliteit", geen uitroeptekens, geen emoji, niet pusherig, geen beloftes die niet waargemaakt kunnen worden. Elke taal wordt op moedertaalniveau geschreven — Spaans is een eersterangs taal, geen vertaling.`;

const LANG_NAME: Record<string, string> = {
  es: "Spaans (Castellano)",
  nl: "Nederlands",
  de: "Duits",
  en: "Engels",
};

const ANGLE_BRIEF: Record<string, string> = {
  material: "het materiaal zelf: textuur, herkomst, hoe het voelt en oogt",
  price: "de vanafprijs als laagdrempelige binnenkomer, zonder goedkoop te klinken",
  showroom: "een bezoek aan de showroom in Xàbia: zien, voelen, adviseren",
  project: "een afgerond project als bewijs: van ontwerp tot montage uit één hand",
  seasonal: "het seizoen als aanleiding (zomer, terras, renovatieseizoen)",
};

export interface CreativeCopyRequest {
  locale: "nl" | "en" | "es" | "de";
  angle: string | null;
  /** Productnaam (indien gekozen), anders alleen categorie. */
  productName?: string | null;
  category?: string | null;
  /** Reeds geformatteerde vanafprijs in de doeltaal, bv. "1.250,00 €". */
  priceFormatted?: string | null;
  /** Tekenlimieten van het gekozen sjabloon × formaat (uit de registry). */
  limits: CopyLimits;
}

export interface GeneratedCreativeCopy {
  eyebrow?: string;
  headline?: string;
  subline?: string;
  cta?: string;
  badge?: string;
}

/** Kap af op de laatste woordgrens binnen de limiet — nooit midden in een woord. */
export function clampToLimit(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.5 ? cut.slice(0, lastSpace) : cut.slice(0, limit)).trimEnd();
}

/**
 * Genereer advertentiecopy per rol in de gevraagde taal. Null bij ontbrekende
 * key of fout — de aanroeper valt terug op de copyblokken.
 */
export async function generateCreativeCopy(
  req: CreativeCopyRequest,
): Promise<GeneratedCreativeCopy | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const langName = LANG_NAME[req.locale] ?? "Spaans (Castellano)";
  const subject = req.productName
    ? `${req.productName}${req.category ? ` (categorie: ${req.category})` : ""}`
    : (req.category ?? "de collectie van Habitat One");

  const prompt = `Schrijf de tekstvelden voor één Meta-advertentiebeeld van Habitat One.
BELANGRIJK: schrijf ALLE velden in het ${langName}, vlekkeloos en natuurlijk (moedertaalniveau).

Onderwerp: ${subject}.
${req.angle && ANGLE_BRIEF[req.angle] ? `Invalshoek: ${ANGLE_BRIEF[req.angle]}.` : ""}
${req.priceFormatted ? `Vanafprijs (exact zo schrijven): ${req.priceFormatted}.` : "Noem GEEN prijs."}

Velden en HARDE tekenlimieten (inclusief spaties — blijf eronder):
- eyebrow: korte kicker boven de kop, max ${req.limits.eyebrow} tekens
- headline: de kop, max ${req.limits.headline} tekens
- subline: ondersteunende regel, max ${req.limits.subline} tekens
- cta: knoptekst (gebiedende wijs, uitnodigend), max ${req.limits.cta} tekens
- badge: ${req.priceFormatted ? `de vanafprijs, bv. "v.a. ${req.priceFormatted}" in de doeltaal, max ${req.limits.badge} tekens` : `korte badge of leeg laten, max ${req.limits.badge} tekens`}

Geef ALLEEN een JSON-object terug (geen markdown): {"eyebrow": "...", "headline": "...", "subline": "...", "cta": "...", "badge": "..."}.`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        temperature: 0.7,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-creativecopy faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;
    const raw = JSON.parse(stripFences(text)) as Record<string, unknown>;

    // Server-side afdwingen: de registry blijft de wet, wat het model ook zegt.
    const field = (name: keyof CopyLimits): string | undefined => {
      const value = raw[name];
      if (typeof value !== "string" || !value.trim()) return undefined;
      return clampToLimit(value, name === "headline"
        ? Math.floor(req.limits.headline / 0.78) // kop mag de shrink-ruimte in (§6b)
        : req.limits[name]);
    };
    const copy: GeneratedCreativeCopy = {
      eyebrow: field("eyebrow"),
      headline: field("headline"),
      subline: field("subline"),
      cta: field("cta"),
      badge: field("badge"),
    };
    if (!copy.headline) return null;
    return copy;
  } catch (err) {
    console.warn("AI-creativecopy error:", err);
    return null;
  }
}
