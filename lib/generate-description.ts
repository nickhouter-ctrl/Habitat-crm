/**
 * Genereert een UNIEKE, merkgerichte productomschrijving in 4 talen (NL/DE/EN/ES)
 * met Claude. Bedoeld om de letterlijk overgenomen leveranciersteksten (Cornelius,
 * Caracole) te vervangen, zodat de website geen dubbele-content-straf krijgt.
 *
 * Vereist `ANTHROPIC_API_KEY`. Zonder key of bij fout → null (caller slaat over).
 * Kosten: ~€0,02 per product. Gegrond: gebruikt alleen meegegeven feiten en
 * verzint geen maten/materialen.
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import type { Locale } from "@/lib/translate";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export type ProductForCopy = {
  name: string;
  brand?: string | null; // collection, bv. "Caracole" / "Cornelius Lifestyle"
  type?: string | null; // subcategory, bv. "Sofa", "Coffee Table"
  variants?: string[] | null; // kleuren/maten, bv. ["Black","Walnut","White"]
  widthMm?: number | string | null;
  heightMm?: number | string | null;
  lengthMm?: number | string | null;
  sourceText?: string | null; // originele leveranciertekst, alleen als referentie
};

export type I18nText = { nl: string; de: string; en: string; es: string };

export function descriptionAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

const mm = (v: unknown): string | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n / 10)} cm` : null;
};

function buildFacts(p: ProductForCopy): string {
  const dims = [mm(p.widthMm) && `breedte ${mm(p.widthMm)}`, mm(p.lengthMm) && `diepte ${mm(p.lengthMm)}`, mm(p.heightMm) && `hoogte ${mm(p.heightMm)}`]
    .filter(Boolean)
    .join(", ");
  return [
    `Naam: ${p.name}`,
    p.brand ? `Merk/collectie: ${p.brand}` : "",
    p.type ? `Type product: ${p.type}` : "",
    p.variants?.length ? `Beschikbare uitvoeringen/maten/kleuren: ${p.variants.join(", ")}` : "",
    dims ? `Afmetingen: ${dims}` : "",
    p.sourceText ? `Referentie (leveranciertekst, NIET overnemen, alleen ter info): ${p.sourceText.slice(0, 800)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const PROMPT = `Je bent copywriter voor Habitat One, een exclusieve interieurzaak aan de Costa Blanca (Xàbia/Jávea, Spanje). Habitat One voert natuursteen, flexibele steen- en wandpanelen, deuren, verlichting én meubels. Toon: warm, verfijnd, mediterraan-luxe, maar concreet en niet zweverig.

Schrijf een UNIEKE verkoopomschrijving voor onderstaand product, in VIER talen: Nederlands, Duits, Engels en Spaans. Elke taal apart, geen vertaling-op-vertaling: schrijf in elke taal natuurlijk.

Regels:
- Per taal 110-160 woorden, 2 korte alinea's.
- Stem de inhoud af op het TYPE product: bij meubels over comfort/vorm/gebruik, bij steen/wand­panelen over afwerking/textuur/toepassing (wand, vloer), bij verlichting/deuren navenant.
- Volledig ORIGINEEL — neem GEEN zinnen letterlijk over uit de referentietekst.
- Verwerk het type product en (indien gegeven) het materiaal/kleur natuurlijk in de tekst (goed voor SEO), zonder te overdrijven of trefwoorden te stapelen.
- Gebruik UITSLUITEND de meegegeven feiten. Verzin GEEN afmetingen, materialen, gewichten of eigenschappen die er niet staan. Als je weinig feiten hebt, blijf dan algemener over stijl/sfeer/toepassing.
- Noem afmetingen alleen als ze zijn meegegeven, en dan beknopt.
- Geen prijzen, geen merknaam van de leverancier, geen "Habitat One" in de lopende tekst.

Geef ALLEEN een JSON-object terug (geen markdown, geen uitleg) met exact deze keys: "nl", "de", "en", "es". Elke waarde is platte tekst (alinea's gescheiden door \\n\\n).`;

/** Genereer de 4-talige omschrijving. Null bij ontbrekende key of fout. */
export async function generateProductDescriptions(p: ProductForCopy): Promise<I18nText | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

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
        max_tokens: 2000,
        temperature: 0.6,
        messages: [{ role: "user", content: `${PROMPT}\n\n--- MEUBEL ---\n${buildFacts(p)}` }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-omschrijving faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;

    const raw = JSON.parse(stripFences(text)) as Partial<Record<Locale, string>>;
    const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : "");
    const out: I18nText = { nl: clean(raw.nl), de: clean(raw.de), en: clean(raw.en), es: clean(raw.es) };
    // Minimaal NL + één andere taal moeten gevuld zijn, anders als mislukt beschouwen.
    if (!out.nl || !(out.de || out.en || out.es)) return null;
    return out;
  } catch (err) {
    console.warn("AI-omschrijving error:", err);
    return null;
  }
}

type ProductRow = typeof products.$inferSelect;

function toCopyInput(p: ProductRow): ProductForCopy {
  const sizes = Array.isArray(p.additionalSizes) ? (p.additionalSizes as Array<{ label?: string }>) : [];
  const variants = sizes.map((s) => s.label).filter((l): l is string => Boolean(l && l.trim()));
  return {
    name: p.name,
    brand: p.collection,
    type: p.subcategory ?? p.category,
    variants: variants.length ? variants : null,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    lengthMm: p.lengthMm,
    sourceText: p.description,
  };
}

export type GenRunResult = {
  ok: boolean;
  disabled?: boolean;
  processed: number;
  failed: number;
  remaining: number;
  error?: string;
};

/**
 * Verwerk een batch meubels zonder unieke tekst: genereer `descriptionI18n` (4 talen)
 * en zet `description` op de NL-versie. Idempotent (alleen rijen met lege i18n).
 * Achter feature-flag `AI_DESCRIPTIONS_ENABLED` tenzij `force` is gezet.
 */
export async function runDescriptionGeneration(
  opts: { limit?: number; concurrency?: number; force?: boolean } = {},
): Promise<GenRunResult> {
  if (!opts.force && process.env.AI_DESCRIPTIONS_ENABLED !== "true") {
    return { ok: true, disabled: true, processed: 0, failed: 0, remaining: 0 };
  }
  if (!descriptionAiConfigured()) {
    return { ok: false, processed: 0, failed: 0, remaining: 0, error: "ANTHROPIC_API_KEY ontbreekt" };
  }

  const limit = opts.limit ?? 12;
  const concurrency = opts.concurrency ?? 3;

  // Alle actieve producten zonder unieke meertalige tekst (idempotent).
  const where = and(eq(products.isActive, true), isNull(products.descriptionI18n));

  const batch = await db.query.products.findMany({ where, limit });
  const remainingBefore = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(where);
  const totalRemaining = remainingBefore[0]?.n ?? batch.length;

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (p) => {
        const gen = await generateProductDescriptions(toCopyInput(p));
        if (!gen) {
          failed++;
          return;
        }
        await db
          .update(products)
          .set({ descriptionI18n: gen, description: gen.nl, updatedAt: new Date() })
          .where(eq(products.id, p.id));
        processed++;
      }),
    );
  }

  return { ok: true, processed, failed, remaining: Math.max(0, totalRemaining - processed) };
}
