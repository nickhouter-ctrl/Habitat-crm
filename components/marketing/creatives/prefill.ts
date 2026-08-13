/**
 * Copy-prefill voor de creative-editor (brief §7): lost herbruikbare
 * tekstblokken (`copy_blocks`) op naar concrete tekst per rol, met
 * invulpatronen ({price_from}, {product}, {unit}, {finish}, …) en de juiste
 * prijsconventie per taal (§8c: Spaans = "1.250,00 €", euro achteraan).
 *
 * Puur en isomorf: geen database of Node-API's, zodat de client-editor bij
 * het wisselen van taal of hoek direct opnieuw kan prefills berekenen met de
 * blokken die de server al meegaf.
 */

export type CreativeLocale = "nl" | "en" | "es" | "de";

/** De velden uit `copy_blocks` die prefill nodig heeft. */
export interface CopyBlockRow {
  angle: string;
  locale: string;
  role: string;
  text: string;
  productId: string | null;
  /** Invulpatroon met tokens; null = `text` letterlijk gebruiken. */
  pattern: string | null;
}

/** Product-gegevens waar patronen tokens uit vullen. */
export interface ProductTokens {
  name?: string | null;
  nameI18n?: Partial<Record<CreativeLocale, string>> | null;
  /** Numeric-string uit de database — geld blijft een string, nooit float. */
  priceFromEur?: string | null;
  unit?: string | null;
  specs?: Record<string, string | number> | null;
}

/**
 * Formatteer een eurobedrag volgens de conventie van de advertentietaal.
 * Spaans en Duits zetten de euro achteraan ("1.250,00 €", brief §8c),
 * Nederlands en Engels ervoor. Bewust handmatig i.p.v. Intl: Node's
 * es-ES-CLDR groepeert viercijferige bedragen niet ("1250,00 €"), terwijl de
 * brief expliciet "1.250,00 €" eist. Het bedrag komt als numeric-string
 * binnen en wordt als string verwerkt — geld blijft cent-precies, geen
 * float-rekenwerk.
 */
export function formatPriceForLocale(
  amount: string | number,
  locale: CreativeLocale,
): string {
  const raw = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  const intPart = match?.[2] ?? "0";
  const cents = (match?.[3] ?? "").padEnd(2, "0");
  const sign = match?.[1] ? "-" : "";

  const group = (digits: string, sep: string) =>
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

  switch (locale) {
    case "es":
    case "de":
      return `${sign}${group(intPart, ".")},${cents} €`;
    case "nl":
      return `€ ${sign}${group(intPart, ".")},${cents}`;
    case "en":
      return `€${sign}${group(intPart, ",")}.${cents}`;
  }
}

/** Productnaam in de gevraagde taal, met `name` als terugval. */
function productName(product: ProductTokens, locale: CreativeLocale): string | null {
  return product.nameI18n?.[locale] ?? product.name ?? null;
}

/**
 * Vul de tokens in een patroon in. Geeft `null` zodra één token niet
 * invulbaar is: een advertentie met een letterlijke "{finish}" erin mag
 * nooit ontstaan — dan liever géén prefill.
 */
export function fillPattern(
  pattern: string,
  ctx: { product?: ProductTokens | null; locale: CreativeLocale },
): string | null {
  let failed = false;
  const filled = pattern.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_, rawToken: string) => {
    const token = rawToken.toLowerCase();
    const product = ctx.product;
    let value: string | null = null;
    if (token === "price_from" && product?.priceFromEur != null) {
      value = formatPriceForLocale(product.priceFromEur, ctx.locale);
    } else if (token === "product" && product) {
      value = productName(product, ctx.locale);
    } else if (token === "unit" && product?.unit) {
      value = product.unit;
    } else if (product?.specs && product.specs[token] != null) {
      value = String(product.specs[token]);
    }
    if (value == null) {
      failed = true;
      return "";
    }
    return value;
  });
  return failed ? null : filled;
}

const COPY_ROLES = ["eyebrow", "headline", "subline", "cta"] as const;
export type PrefillRole = (typeof COPY_ROLES)[number];

/**
 * Kies per tekstrol het beste blok voor taal + hoek: productspecifiek wint
 * van generiek; een blok met onvulbaar patroon wordt overgeslagen. Talen
 * zijn gelijkwaardig (§8c) — er is bewust géén vertaal-terugval naar een
 * andere locale.
 */
export function resolveCopyPrefill(
  blocks: CopyBlockRow[],
  opts: {
    locale: CreativeLocale;
    angle: string;
    productId: string | null;
    product?: ProductTokens | null;
  },
): Partial<Record<PrefillRole, string>> {
  const result: Partial<Record<PrefillRole, string>> = {};
  for (const role of COPY_ROLES) {
    const candidates = blocks
      .filter(
        (b) =>
          b.role === role &&
          b.locale === opts.locale &&
          b.angle === opts.angle &&
          (b.productId === null || b.productId === opts.productId),
      )
      // productspecifiek eerst
      .sort((a, b) => Number(b.productId !== null) - Number(a.productId !== null));
    for (const block of candidates) {
      const text = block.pattern
        ? fillPattern(block.pattern, { product: opts.product, locale: opts.locale })
        : block.text;
      if (text) {
        result[role] = text;
        break;
      }
    }
  }
  return result;
}
