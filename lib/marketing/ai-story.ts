/**
 * AI-carrouselverhaal — de AI kijkt naar de gekozen beelden (vision), stelt
 * een kaartvolgorde voor die een verhaal vertelt (van breed naar detail, of
 * probleem → oplossing → bewijs → uitnodiging) en schrijft per kaartje een kop
 * en subregel die op elkaar doorlopen, plus de advertentietekst erboven.
 *
 * Zelfde uitgangspunten als ai-copy.ts: Anthropic Messages-API via fetch,
 * huisstijl-systeemprompt, **null bij ontbrekende key of fout** (de bouwer
 * meldt dat en de gebruiker kan alles ook met de hand invullen), en de
 * tekenlimieten uit de registry worden server-side afgedwongen — het model is
 * de verteller, de registry blijft de wet (§6b).
 */
import type { CopyLimits } from "@/lib/creatives/templates";

import { ANGLE_BRIEF, LANG_NAME, SYSTEM, clampToLimit } from "./ai-copy";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export interface CarouselStoryRequest {
  /** Beelden in de door de gebruiker gekozen volgorde (publieke URL's). */
  images: { url: string; label: string }[];
  locale: "nl" | "en" | "es" | "de";
  angle?: string | null;
  /** Vrij onderwerp/thema van de gebruiker, bv. "renovatie villa Jávea". */
  subject?: string | null;
  category?: string | null;
  /** Tekenlimieten van het kaart-sjabloon (headline/subline tellen mee op het beeld). */
  limits: CopyLimits;
}

export interface CarouselStoryCard {
  headline: string;
  subline?: string;
}

export interface CarouselStory {
  /** AI-voorgestelde kaartvolgorde: indexen in de aangeleverde beeldenlijst. */
  order: number[];
  /** Copy per kaartje, in de volgorde van `order`. */
  cards: CarouselStoryCard[];
  /** Advertentietekst boven de carrousel (Meta "message"). */
  message: string;
  /** Korte interne naam voor de advertentie. */
  name: string;
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

/**
 * Parse en normaliseer het modelantwoord. Puur en testbaar: ongeldige volgorde
 * valt terug op de aangeleverde volgorde, teksten worden op de limieten
 * afgekapt, en zonder bruikbare kaarten is de uitkomst null.
 */
export function parseCarouselStory(
  text: string,
  imageCount: number,
  limits: CopyLimits,
): CarouselStory | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  if (rawCards.length !== imageCount) return null;

  // Volgorde: alleen accepteren als het een echte permutatie van 0..n-1 is.
  const rawOrder = Array.isArray(obj.order) ? obj.order : [];
  const isPermutation =
    rawOrder.length === imageCount &&
    [...rawOrder].sort((a, b) => Number(a) - Number(b)).every((v, i) => Number(v) === i);
  const order = isPermutation
    ? rawOrder.map(Number)
    : Array.from({ length: imageCount }, (_, i) => i);

  const cards: CarouselStoryCard[] = [];
  for (const entry of rawCards) {
    const card = (entry ?? {}) as Record<string, unknown>;
    const headline = typeof card.headline === "string" ? card.headline.trim() : "";
    if (!headline) return null; // elk kaartje heeft een kop nodig
    const subline = typeof card.subline === "string" ? card.subline.trim() : "";
    cards.push({
      headline: clampToLimit(headline, limits.headline),
      subline: subline ? clampToLimit(subline, limits.subline) : undefined,
    });
  }

  const message = typeof obj.message === "string" ? obj.message.trim().slice(0, 2000) : "";
  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 200) : "";
  if (!message) return null;

  return { order, cards, message, name: name || "Carrousel" };
}

/* ------------------------------------------------------- advertentietekst */

export interface AdMessageRequest {
  /** De gekozen kaartjes/creative(s): kop + subregel, in kaartvolgorde. */
  cards: { headline: string; subline?: string | null }[];
  /** Beelden van de kaartjes (publieke URL's) — max ~5 gaan mee naar de AI. */
  images: { url: string; label: string }[];
  locale: "nl" | "en" | "es" | "de";
  /** Landingspagina, zodat de tekst er logisch naartoe leidt. */
  link?: string | null;
}

export interface AdMessage {
  message: string;
  name: string;
}

/** Parse en normaliseer het advertentietekst-antwoord (puur, testbaar). */
export function parseAdMessage(text: string): AdMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message.trim().slice(0, 2000) : "";
  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 200) : "";
  if (!message) return null;
  return { message, name };
}

/**
 * Schrijf de advertentietekst (Meta "message") boven een advertentie of
 * carrousel, op basis van de gekozen creatives én hun beelden. Null bij
 * ontbrekende ANTHROPIC_API_KEY of een fout — het formulier meldt dat.
 */
export async function generateAdMessage(req: AdMessageRequest): Promise<AdMessage | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const langName = LANG_NAME[req.locale] ?? "Spaans (Castellano)";
  const isCarousel = req.cards.length > 1;
  const cardLines = req.cards
    .map((c, i) => `${i + 1}. ${c.headline}${c.subline ? ` — ${c.subline}` : ""}`)
    .join("\n");

  const prompt = `Schrijf de advertentietekst (het "message"-veld boven ${isCarousel ? "een Meta-carrousel" : "een Meta-advertentiebeeld"}) voor Habitat One.

De ${isCarousel ? "kaartjes dragen deze koppen (in deze volgorde)" : "creative draagt deze tekst"}:
${cardLines}
${req.link ? `De advertentie linkt naar: ${req.link}.` : ""}

Opdracht:
1. KIJK eerst naar de bijgevoegde beelden: de tekst moet passen bij wat er écht te zien is.
2. Schrijf 2–4 korte zinnen in het ${langName} (moedertaalniveau) die het geheel opzetten en nieuwsgierig maken${isCarousel ? " naar de kaartjes" : ""} — herhaal de koppen niet letterlijk.
3. Max 500 tekens. Geen hashtags, geen emoji, geen uitroeptekens.
4. Bedenk ook een korte interne naam voor de advertentie (mag Nederlands zijn).

Geef ALLEEN een JSON-object terug (geen markdown): {"message": "...", "name": "..."}`;

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
        max_tokens: 700,
        temperature: 0.7,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...req.images.slice(0, 5).flatMap((img, i) => [
                { type: "text", text: `Beeld ${i + 1}: ${img.label}` },
                { type: "image", source: { type: "url", url: img.url } },
              ]),
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-advertentietekst faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;
    return parseAdMessage(text);
  } catch (err) {
    console.warn("AI-advertentietekst error:", err);
    return null;
  }
}

/**
 * Laat de AI het carrouselverhaal schrijven op basis van de beelden zelf.
 * Null bij ontbrekende ANTHROPIC_API_KEY of een fout — de bouwer meldt dat.
 */
export async function generateCarouselStory(
  req: CarouselStoryRequest,
): Promise<CarouselStory | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const langName = LANG_NAME[req.locale] ?? "Spaans (Castellano)";
  const n = req.images.length;

  const prompt = `Je krijgt ${n} beelden van Habitat One (genummerd 0 t/m ${n - 1}, in die volgorde bijgevoegd). Maak er één Meta-carrouseladvertentie van die als een verhaal leest.

${req.subject ? `Onderwerp/thema van de gebruiker: ${req.subject}.` : ""}
${req.category ? `Categorie: ${req.category}.` : ""}
${req.angle && ANGLE_BRIEF[req.angle] ? `Invalshoek: ${ANGLE_BRIEF[req.angle]}.` : ""}

Opdracht:
1. KIJK eerst goed naar elk beeld: wat is er écht te zien (materiaal, ruimte, licht, detail)?
2. Kies de kaartVOLGORDE die het sterkste verhaal vertelt — bv. van breed naar detail, of probleem → oplossing → resultaat → uitnodiging. Het eerste kaartje moet de scroll stoppen, het laatste nodigt uit.
3. Schrijf per kaartje een kop en subregel in het ${langName} (moedertaalniveau) die bij DAT beeld past én doorloopt op het vorige kaartje — samen één verhaal, geen losse kreten.
4. Schrijf de advertentietekst die boven de carrousel staat (2–4 korte zinnen, zelfde taal): zet het verhaal op en maak nieuwsgierig naar de kaartjes.
5. Bedenk een korte interne naam voor deze advertentie (mag Nederlands zijn).

HARDE tekenlimieten (inclusief spaties): kop max ${req.limits.headline} tekens, subregel max ${req.limits.subline} tekens, advertentietekst max 500 tekens.

Geef ALLEEN een JSON-object terug (geen markdown), met "cards" in de volgorde van "order":
{"order": [beeldindexen in verhaalvolgorde], "cards": [{"headline": "...", "subline": "..."}, ...], "message": "...", "name": "..."}`;

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
        max_tokens: 1500,
        temperature: 0.7,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...req.images.flatMap((img, i) => [
                { type: "text", text: `Beeld ${i}: ${img.label}` },
                { type: "image", source: { type: "url", url: img.url } },
              ]),
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-carrouselverhaal faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;
    return parseCarouselStory(text, n, req.limits);
  } catch (err) {
    console.warn("AI-carrouselverhaal error:", err);
    return null;
  }
}
