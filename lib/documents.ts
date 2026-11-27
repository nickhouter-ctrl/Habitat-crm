/** Shared helpers for CRM documents (offertes / facturen). */
import type { DocumentLineItem } from "@/lib/db/schema";
import { LINE_CATEGORY_VALUES } from "@/lib/products";

export type DocKind =
  | "estimate"
  | "proforma"
  | "invoice"
  | "creditnote"
  | "salesreceipt"
  | "deliverynote"
  /** Provisión de fondos — voorschotdocument voor particulieren/buitenlandse
   * klanten zónder empresario-status (procedure boekhouder, juli 2026): factuur-
   * layout maar géén factuur, geen enkele BTW-vermelding, eigen PF-nummerreeks
   * buiten Holded om, en altijd eerst ter controle naar de boekhouder (Paco). */
  | "fondos";

export const DOC_KIND_PREFIX: Record<DocKind, string> = {
  estimate: "OFF",
  proforma: "PRO",
  invoice: "FAC",
  creditnote: "CN",
  salesreceipt: "BON",
  deliverynote: "PAK",
  fondos: "PF",
};

/** Round to cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clampPct(v: unknown): number {
  const n = Number(v) || 0;
  return Math.min(100, Math.max(0, n));
}

/** Effective unit price after the line discount. */
export function lineUnitPrice(item: Pick<DocumentLineItem, "price" | "discount">): number {
  return round2((Number(item.price) || 0) * (1 - clampPct(item.discount) / 100));
}

export function lineNet(item: Pick<DocumentLineItem, "units" | "price" | "discount">): number {
  return round2((Number(item.units) || 0) * lineUnitPrice(item));
}

export function lineTax(item: DocumentLineItem): number {
  return round2(lineNet(item) * ((Number(item.taxRate) || 0) / 100));
}

/** Arbeid-regels: hun kostprijs zit al in de uren (time_entries), dus tellen NIET
 *  mee in het project-kostentotaal (anders dubbel). */
const LABOR_CATEGORIES = new Set(["arbeid", "plaatsing"]);
export function isLaborLine(item: DocumentLineItem): boolean {
  return !!item.category && LABOR_CATEGORIES.has(item.category);
}

/** Own goods are a separate funding stream, even when their cost is unknown.
 * Catalog links and the explicit category take precedence over legacy names.
 * Do not turn installation, renovation, services or advance settlements into goods.
 */
export function isOwnProductLine(
  item: DocumentLineItem,
  productCost?: (item: DocumentLineItem) => number | undefined,
): boolean {
  if (isLaborLine(item) || item.advanceRef) return false;
  if (item.category === "eigen_producten") return true;
  if (item.productId || item.pricingBasis === "catalog") return true;
  if (["renovatie", "ontwerp", "transport"].includes(item.category ?? "")) return false;
  const name = String(item.name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(montage|plaatsing|installatie|installation|instalacion|werkzaamheden|arbeid|labor|labour|mano de obra|reeds betaald|verrekening)\b/.test(name)) return false;
  if (ownProductFamily(name)) return true;
  if (item.pricingBasis === "construction") return false;
  return Number(item.costEur) > 0 || productCost?.(item) != null;
}

/** Stable families let old supplier invoices and sales lines describe the same goods. */
export function ownProductFamily(raw: string): string | null {
  const name = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(kozijn(?:en)?|ramen|windows?|ventanas?)\b/.test(name)) return "windows";
  if (/\b(bal+ustrades?|balustradas?|barandillas?|railings?)\b/.test(name)) return "railings";
  if (/\b((?:binnen|buiten)?deur(?:en)?|doors|puertas?|(?:interior|exterior|front|entrance) door)\b/.test(name) || name.trim() === "door") return "doors";
  if (/\b(badkamer\w*|bathroom\w*|sanitair\w*|sanitarios?|sanitary|bano|banos|wastafels?|washbasins?|lavabos?|kranen?|taps?|griferia|douches?|showers?|duchas?|toilets?|inodoros?|bathtubs?|baden|baneras?)\b/.test(name)) return "bathroom";
  if (/\b(verlichting|lampen?|lighting|lights?|led|spots?|downlights?|luminarias?|iluminacion|lamparas?)\b/.test(name)) return "lighting";
  if (/\b(magic stone|flexib(?:el|le) stone)\b/.test(name)) return "stone";
  if (/\b(warmte\s*pomp(?:en)?|heat\s*pumps?|bomba(?:s)? de calor|air\s*flows?)\b/.test(name)) return "climate";
  if (/\b(planten|beplanting|plants|plantas|palmbomen|palmeras)\b/.test(name)) return "plants";
  return null;
}

export function ownProductGroup(item: DocumentLineItem): string {
  return ownProductFamily(item.name) ?? (item.productId ? `product:${item.productId}` : item.description?.trim() ? `sku:${item.description.trim()}` : `name:${item.name.trim().toLowerCase()}`);
}

/**
 * Kostprijs van een regel voor de MARGE-weergave (per document): eigen kostprijs
 * (costEur) > afgeleid uit regel-marge% > catalogus-kostprijs. `null` = onbekend
 * (dan telt de regel niet mee, i.p.v. als 100% marge).
 */
export function lineCostEur(
  item: DocumentLineItem,
  productCost?: (item: DocumentLineItem) => number | undefined,
): number | null {
  const units = Number(item.units) || 0;
  if (item.costEur != null && Number(item.costEur) > 0) return round2(Number(item.costEur) * units);
  if (item.marginPct != null && Number(item.marginPct) > 0) return round2(lineNet(item) / (1 + Number(item.marginPct) / 100));
  const pc = productCost?.(item);
  if (pc != null && pc > 0) return round2(pc * units);
  return null;
}

/**
 * Materiaal-/productkostprijs voor het PROJECT-kostentotaal: eigen kostprijs >
 * catalogus-kostprijs. Arbeid-regels → 0 (die komen uit de uren) en géén
 * marge%-afleiding (dat is arbeid). Onbekend → 0.
 */
export function lineMaterialCostEur(
  item: DocumentLineItem,
  productCost?: (item: DocumentLineItem) => number | undefined,
): number {
  if (isLaborLine(item) || (item.pricingBasis === "construction" && !isOwnProductLine(item, productCost))) return 0;
  const units = Number(item.units) || 0;
  if (item.costEur != null && Number(item.costEur) > 0) return round2(Number(item.costEur) * units);
  const pc = productCost?.(item);
  if (pc != null && pc > 0) return round2(pc * units);
  return 0;
}

/**
 * Omzet én kostprijs van de EIGEN PRODUCTEN op een document — de basis voor
 * "wat verdienen we op wat we zelf leveren".
 *
 * Arbeid-regels tellen niet mee (hun kost zit in de uren, hun marge in de
 * uren-norm). Regels zonder bekende kostprijs tellen ook niet mee in de marge —
 * die zouden anders als 100% marge binnenkomen; hun omzet komt apart terug in
 * `uncostedRevenue` zodat zichtbaar blijft hoeveel er buiten de meting valt.
 */
export function docProductMargin(
  items: unknown,
  productCost?: (item: DocumentLineItem) => number | undefined,
): { revenue: number; cost: number; uncostedRevenue: number } {
  let revenue = 0;
  let cost = 0;
  let uncostedRevenue = 0;
  for (const it of normalizeDocItems(items)) {
    if (!isOwnProductLine(it, productCost)) continue;
    const net = lineNet(it);
    const c = lineMaterialCostEur(it, productCost);
    if (c !== 0) {
      revenue += net;
      cost += c;
    } else {
      uncostedRevenue += net;
    }
  }
  return { revenue: round2(revenue), cost: round2(cost), uncostedRevenue: round2(uncostedRevenue) };
}

/**
 * Eigen-productaandeel van een document, voor de voorschotdekking: welk deel van
 * het subtotaal is verkoop van eigen (voorraad)producten? Een betaling op dit
 * document telt dan voor (1 − aandeel) mee als dekking van uren + inkoop derden.
 *
 * Alle eigen productregels tellen, ook maatwerk zonder bekende kostprijs.
 * Een onbekende kostprijs sluit alleen de marge-meting uit, niet de reservering.
 * Geklemd op [0,1]: eindafrekeningen met
 * negatieve verrekenregels drukken het subtotaal en zouden anders boven de 1
 * uitkomen.
 */
export function docOwnShare(
  items: unknown,
  subtotalEur: number,
  productCost?: (item: DocumentLineItem) => number | undefined,
): number {
  if (!Number.isFinite(subtotalEur) || subtotalEur === 0) return 0;
  const ownRevenue = normalizeDocItems(items).reduce((sum, it) =>
    sum + (isOwnProductLine(it, productCost) ? lineNet(it) : 0), 0);
  return Math.min(1, Math.max(0, round2(ownRevenue) / subtotalEur));
}

type AddressParts = { addressLine?: string | null; postalCode?: string | null; city?: string | null };

/**
 * Factuuradres in twee regels (straat / postcode + plaats), net als ons eigen
 * bedrijfsadres. Zakelijke klant: bedrijfsadres heeft voorrang, anders het
 * contactadres. Geeft `null` per regel als die leeg is.
 */
export function billingAddressLines(
  company: AddressParts | null | undefined,
  contact: AddressParts | null | undefined,
): { line: string | null; region: string | null } {
  const src =
    company && (company.addressLine || company.postalCode || company.city) ? company : contact;
  const line = src?.addressLine?.trim() || null;
  const region =
    [src?.postalCode, src?.city]
      .map((x) => (x ? String(x).trim() : ""))
      .filter(Boolean)
      .join(" ") || null;
  return { line, region };
}

export function computeTotals(items: DocumentLineItem[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  let subtotal = 0;
  let tax = 0;
  for (const it of items) {
    subtotal += lineNet(it);
    tax += lineTax(it);
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** Regelbedrag vóór korting (aantal × stukprijs, ex. btw). */
export function lineGross(item: Pick<DocumentLineItem, "units" | "price">): number {
  return round2((Number(item.units) || 0) * (Number(item.price) || 0));
}

/** Kortingsbedrag van een regel in euro's (ex. btw). */
export function lineDiscountAmount(item: Pick<DocumentLineItem, "units" | "price" | "discount">): number {
  return round2(lineGross(item) - lineNet(item));
}

/** Regeltotaal inclusief btw (netto + btw van die regel). */
export function lineTotalIncl(item: DocumentLineItem): number {
  return round2(lineNet(item) + lineTax(item));
}

/**
 * Totaalblok zoals op een gewone factuur: bruto (zonder korting), korting,
 * subtotaal ex. btw, btw per tarief en totaal. `subtotal`/`tax`/`total` zijn
 * gelijk aan {@link computeTotals}.
 */
export function documentSummary(items: DocumentLineItem[]): {
  gross: number;
  discount: number;
  subtotal: number;
  taxByRate: { rate: number; base: number; tax: number }[];
  tax: number;
  total: number;
} {
  const { subtotal, tax, total } = computeTotals(items);
  const gross = round2(items.reduce((s, it) => s + lineGross(it), 0));
  const perRate = new Map<number, { base: number; tax: number }>();
  for (const it of items) {
    const rate = Number(it.taxRate) || 0;
    const cur = perRate.get(rate) ?? { base: 0, tax: 0 };
    cur.base += lineNet(it);
    cur.tax += lineTax(it);
    perRate.set(rate, cur);
  }
  const taxByRate = [...perRate.entries()]
    .map(([rate, v]) => ({ rate, base: round2(v.base), tax: round2(v.tax) }))
    .sort((a, b) => b.rate - a.rate);
  return { gross, discount: round2(gross - subtotal), subtotal, taxByRate, tax, total };
}

/**
 * Korting op de hele order: zet hetzelfde percentage op elke gewone regel.
 * Verrekenregels (aanbetaling wegstrepen) en negatieve regels blijven buiten
 * schot. Per regel en niet als losse totaalkorting, zodat Holded, marge en
 * btw per regel gewoon blijven kloppen.
 */
export function orderDiscountEligible(item: Pick<DocumentLineItem, "price" | "advanceRef">): boolean {
  return !item.advanceRef && (Number(item.price) || 0) > 0;
}

/**
 * Welk percentage geeft (zo dicht mogelijk) `amountEur` korting over de
 * bruto som van de regels die meedoen? Vier decimalen: € 500 op € 12.345
 * wordt 4,0502% — op de cent na exact (stukprijzen worden op centen afgerond).
 */
export function orderDiscountPctForAmount(
  items: Pick<DocumentLineItem, "units" | "price" | "advanceRef">[],
  amountEur: number,
): number | null {
  const gross = items.filter(orderDiscountEligible).reduce((s, it) => s + lineGross(it), 0);
  if (!(gross > 0) || !(amountEur > 0)) return null;
  return Math.min(100, Math.round((amountEur / gross) * 100 * 10000) / 10000);
}

/**
 * Percentages per regel voor een €-korting op de hele order. Eerst overal
 * hetzelfde percentage; omdat stukprijzen op centen worden afgerond blijft er
 * een restje over (€ 499,82 i.p.v. € 500). Dat restje gaat naar de regel met
 * het kleinste aantal — daar is de afronding het fijnst — zodat het totaal
 * op de cent klopt waar dat kan. Regels die niet meedoen krijgen `undefined`.
 */
export function orderDiscountPlan<T extends Pick<DocumentLineItem, "units" | "price" | "advanceRef">>(
  items: T[],
  amountEur: number,
): (number | undefined)[] | null {
  const pct = orderDiscountPctForAmount(items, amountEur);
  if (pct == null) return null;
  const plan = items.map((it) => (orderDiscountEligible(it) ? pct : undefined));
  const discountOf = (p: (number | undefined)[]) =>
    items.reduce((s, it, i) => s + (p[i] == null ? 0 : lineDiscountAmount({ ...it, discount: p[i] })), 0);
  const rest = round2(amountEur - discountOf(plan));
  if (Math.abs(rest) < 0.005) return plan;
  const kandidaten = items
    .map((it, i) => ({ i, units: Math.abs(Number(it.units) || 0), gross: lineGross(it) }))
    .filter((k) => plan[k.i] != null && k.gross > 0)
    .sort((a, b) => a.units - b.units || b.gross - a.gross);
  const k = kandidaten[0];
  if (!k) return plan;
  const doel = lineDiscountAmount({ ...items[k.i], discount: plan[k.i] }) + rest;
  const nieuw = Math.min(100, Math.max(0, Math.round((doel / k.gross) * 100 * 10000) / 10000));
  const poging = [...plan];
  poging[k.i] = nieuw;
  return Math.abs(amountEur - discountOf(poging)) < Math.abs(rest) ? poging : plan;
}

/**
 * Lees document-regels robuust uit. Sommige (geïmporteerde/legacy) rijen staan
 * als (dubbel) ge-encode JSON-string in de jsonb-kolom — die zouden `.map()`
 * laten crashen. Pelt tot 3 string-lagen af en valideert dat het een array is.
 */
export function normalizeDocItems(raw: unknown): DocumentLineItem[] {
  let val: unknown = raw;
  for (let i = 0; i < 3 && typeof val === "string"; i++) {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  return Array.isArray(val) ? (val as DocumentLineItem[]) : [];
}

/** Robuust een jsonb-stringlijst uitlezen (bv. quote_requests.productSkus). */
export function asStringArray(raw: unknown): string[] {
  let val: unknown = raw;
  for (let i = 0; i < 3 && typeof val === "string"; i++) {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  return Array.isArray(val) ? val.map((x) => String(x)) : [];
}

/** Suggest the next document number, e.g. "OFF-2026-0007". */
export function suggestDocNumber(kind: DocKind, existingCount: number, year = new Date().getFullYear()): string {
  return `${DOC_KIND_PREFIX[kind]}-${year}-${String(existingCount + 1).padStart(4, "0")}`;
}

/** Normalise/validate a raw line item from the form. Returns null if empty/invalid. */
export function normaliseLineItem(raw: unknown): DocumentLineItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const units = Number(r.units);
  const price = Number(r.price);
  if (!name && !units && !price) return null; // empty row
  if (!name) return null;
  const taxRate = r.taxRate === undefined || r.taxRate === null || r.taxRate === "" ? 21 : Number(r.taxRate);
  const discount = clampPct(r.discount);
  const category =
    typeof r.category === "string" && LINE_CATEGORY_VALUES.includes(r.category)
      ? r.category
      : undefined;
  const productId =
    typeof r.productId === "string" && r.productId.trim().length > 0
      ? r.productId.trim()
      : undefined;
  const numOrU = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? round2(n) : undefined;
  };
  return {
    name: name.slice(0, 300),
    description:
      typeof r.description === "string" && r.description.trim()
        ? r.description.trim().slice(0, 2000)
        : undefined,
    // Negatieve aantallen zijn geldig (retour-/correctieregels); alleen een
    // niet-numerieke invoer valt terug op 1.
    units: Number.isFinite(units) ? units : 1,
    unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim().slice(0, 12) : undefined,
    price: Number.isFinite(price) ? round2(price) : 0,
    discount: discount > 0 ? round2(discount) : undefined,
    taxRate: Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 21,
    category,
    productId,
    costEur: numOrU(r.costEur),
    pricingBasis: r.pricingBasis === "construction" || r.pricingBasis === "catalog" ? r.pricingBasis : undefined,
    supplierPriceEur: numOrU(r.supplierPriceEur),
    marginPct: numOrU(r.marginPct),
    // Fase-koppeling en voorschot-verwijzing moeten het opslaan overleven:
    // fase-facturatie filtert op `phase`, en `advanceRef` markeert het voorschot
    // als verrekend (anders dubbele aftrek op de volgende factuur).
    phase: typeof r.phase === "string" && r.phase.trim() ? r.phase.trim().slice(0, 100) : undefined,
    advanceRef:
      typeof r.advanceRef === "string" && r.advanceRef.trim() ? r.advanceRef.trim() : undefined,
  };
}

export function parseLineItems(json: string | null | undefined): DocumentLineItem[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normaliseLineItem)
    .filter((x): x is DocumentLineItem => x !== null)
    .slice(0, 200);
}
