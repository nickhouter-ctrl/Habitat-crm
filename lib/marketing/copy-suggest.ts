/**
 * Copy-suggesties voor de creative-editor — zonder LLM in het draaipad
 * (brief §2): suggesties komen deterministisch uit vastgelegde tekstblokken
 * (`copy_blocks`) met invulpatronen ({price_from}, {finish}, {category}).
 *
 * Deterministisch: dezelfde invoer geeft dezelfde suggestie (stabiele hash);
 * de `variant`-optie ("shuffle") roteert door de kandidaten. Prijzen worden
 * per taal genoteerd — Spaans/Duits `1.250,00 €` met de euro achteraan
 * (brief §8c), en er komt geen float aan te pas (§9).
 */

/** Blokvorm zoals `copy_blocks` hem levert (subset, ook bruikbaar in tests). */
export interface CopyBlockLike {
  angle: "material" | "price" | "showroom" | "project" | "seasonal";
  locale: "nl" | "en" | "es" | "de";
  role: "eyebrow" | "headline" | "subline" | "cta";
  /** Letterlijke tekst (gebruikt als er geen pattern is). */
  text: string;
  /** Invulpatroon met tokens; heeft voorrang op `text` als hij er is. */
  pattern: string | null;
  /** Null = generiek; anders alleen voor dat product. */
  productId: string | null;
}

/** Contextwaarden om tokens mee te vullen. */
export interface CopyTokenValues {
  /** Vanafprijs als db-`numeric`-string (punt-decimaal), bv. "1250.00". */
  priceFrom?: string | null;
  finish?: string | null;
  category?: string | null;
}

export interface CopySuggestionOptions extends CopyTokenValues {
  angle: CopyBlockLike["angle"];
  locale: CopyBlockLike["locale"];
  productId?: string | null;
  /** Shuffle-optie: 0 = eerste keuze, 1 = volgende variant, enz. */
  variant?: number;
}

/** Suggestie per rol; een rol ontbreekt als er geen passend blok is. */
export interface CopySuggestion {
  eyebrow?: string;
  headline?: string;
  subline?: string;
  cta?: string;
}

/* ------------------------------------------------------------------- prijs */

/**
 * Formatteer een vanafprijs per taal, met stringrekenen (nooit floats):
 * es/de `1.250,00 €` (euro achteraan, §8c), nl `€ 1.250,00`, en `€1,250.00`.
 */
export function formatPriceFrom(eur: string, locale: CopyBlockLike["locale"]): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(eur.trim());
  if (!m) throw new Error(`Ongeldige prijs voor {price_from}: "${eur}"`);
  const frac = (m[2] ?? "").padEnd(2, "0");
  const thousandsSep = locale === "en" ? "," : ".";
  const grouped = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  const amount = locale === "en" ? `${grouped}.${frac}` : `${grouped},${frac}`;
  switch (locale) {
    case "es":
    case "de":
      return `${amount} €`;
    case "nl":
      return `€ ${amount}`;
    case "en":
      return `€${amount}`;
  }
}

/* ------------------------------------------------------------------ tokens */

/**
 * Vul de tokens in een patroon in. Ontbreekt een benodigde waarde, dan is de
 * uitkomst `null` — een half ingevuld patroon mag nooit in een advertentie
 * belanden (zelfde geest als "kap nooit stil af", brief §6b).
 */
export function fillTokens(
  template: string,
  values: CopyTokenValues,
  locale: CopyBlockLike["locale"],
): string | null {
  let missing = false;
  const result = template.replace(/\{(price_from|finish|category)\}/g, (_, token: string) => {
    if (token === "price_from") {
      if (!values.priceFrom) {
        missing = true;
        return "";
      }
      return formatPriceFrom(values.priceFrom, locale);
    }
    const value = token === "finish" ? values.finish : values.category;
    if (!value) {
      missing = true;
      return "";
    }
    return value;
  });
  return missing ? null : result;
}

/* --------------------------------------------------------------- suggestie */

/** Stabiele 32-bit hash (FNV-1a) — determinisme zonder Math.random. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ROLES: Array<CopyBlockLike["role"]> = ["eyebrow", "headline", "subline", "cta"];

/**
 * Kies per rol een passend blok en vul de tokens. Productspecifieke blokken
 * gaan vóór generieke; binnen de kandidaten kiest een stabiele hash (op
 * invalshoek/taal/product/rol) + `variant` het blok. Blokken waarvan het
 * patroon niet volledig ingevuld kan worden, worden overgeslagen.
 */
export function getCopySuggestion(
  blocks: CopyBlockLike[],
  opts: CopySuggestionOptions,
): CopySuggestion {
  const suggestion: CopySuggestion = {};

  for (const role of ROLES) {
    const matching = blocks.filter(
      (b) => b.angle === opts.angle && b.locale === opts.locale && b.role === role,
    );
    const productSpecific = opts.productId
      ? matching.filter((b) => b.productId === opts.productId)
      : [];
    const pool = productSpecific.length > 0 ? productSpecific : matching.filter((b) => !b.productId);

    // Vul kandidaten in en gooi onvulbare patronen weg (nooit half invullen).
    const candidates = pool
      .map((b) => fillTokens(b.pattern ?? b.text, opts, opts.locale))
      .filter((t): t is string => t !== null && t.length > 0);
    if (candidates.length === 0) continue;

    const seed = hash(`${opts.angle}|${opts.locale}|${opts.productId ?? ""}|${role}`);
    const index = (seed + (opts.variant ?? 0)) % candidates.length;
    suggestion[role] = candidates[index];
  }

  return suggestion;
}
