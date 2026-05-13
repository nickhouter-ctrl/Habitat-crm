/** Line-item categories and their default Spanish IVA rate. Editable per line. */
export const LINE_CATEGORIES = [
  { value: "materiaal", label: "Materiaal / levering", vat: 21 },
  { value: "renovatie", label: "Renovatie / verbouwing", vat: 10 },
  { value: "arbeid", label: "Arbeid / uitvoering", vat: 10 },
  { value: "plaatsing", label: "Plaatsing / montage", vat: 10 },
  { value: "ontwerp", label: "Ontwerp / advies", vat: 21 },
  { value: "transport", label: "Transport / logistiek", vat: 21 },
  { value: "overig", label: "Overig", vat: 21 },
] as const;

export type LineCategory = (typeof LINE_CATEGORIES)[number]["value"];

export const LINE_CATEGORY_VALUES = LINE_CATEGORIES.map((c) => c.value) as readonly string[];

export function vatForCategory(category: string | null | undefined): number {
  return LINE_CATEGORIES.find((c) => c.value === category)?.vat ?? 21;
}

export function labelForCategory(category: string | null | undefined): string {
  return LINE_CATEGORIES.find((c) => c.value === category)?.label ?? category ?? "—";
}

/** Common product units (free text allowed too). */
export const PRODUCT_UNITS = ["stuk", "m²", "m", "m³", "kg", "uur", "dag", "pakket", "set"];

/**
 * Format dimensies tot een korte string als "60 × 120 mm · t 8 mm" of `null`
 * als alle waardes ontbreken.
 */
export function formatDimensions(d: {
  widthMm?: string | number | null;
  heightMm?: string | number | null;
  lengthMm?: string | number | null;
  thicknessMm?: string | number | null;
}): string | null {
  const w = numOrNull(d.widthMm);
  const h = numOrNull(d.heightMm);
  const l = numOrNull(d.lengthMm);
  const t = numOrNull(d.thicknessMm);
  const main = [l, w, h].filter((v): v is number => v != null);
  const head = main.length ? main.join(" × ") + " mm" : "";
  const tail = t != null ? `${head ? " · " : ""}t ${t} mm` : "";
  const out = head + tail;
  return out.length ? out : null;
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Bepaal de volgende vrije SKU voor een prefix (bv. "MS"). Pakt 1 + het
 * hoogste nummer dat al in gebruik is. Gaten in de reeks worden NIET
 * opgevuld — dat zou een toekomstige assignering kunnen overrijden.
 */
export function nextSequentialSku(
  prefix: string,
  existingSkus: Array<string | null | undefined>,
  pad = 3,
): string {
  const re = new RegExp(`^${escapeRegex(prefix)}-?(\\d+)$`, "i");
  let max = 0;
  for (const s of existingSkus) {
    if (!s) continue;
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
