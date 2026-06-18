/** Shared helpers for CRM documents (offertes / facturen). */
import type { DocumentLineItem } from "@/lib/db/schema";
import { LINE_CATEGORY_VALUES } from "@/lib/products";

export type DocKind =
  | "estimate"
  | "proforma"
  | "invoice"
  | "creditnote"
  | "salesreceipt"
  | "deliverynote";

export const DOC_KIND_PREFIX: Record<DocKind, string> = {
  estimate: "OFF",
  proforma: "PRO",
  invoice: "FAC",
  creditnote: "CN",
  salesreceipt: "BON",
  deliverynote: "PAK",
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
  return {
    name: name.slice(0, 300),
    description:
      typeof r.description === "string" && r.description.trim()
        ? r.description.trim().slice(0, 2000)
        : undefined,
    units: Number.isFinite(units) && units > 0 ? units : 1,
    price: Number.isFinite(price) ? round2(price) : 0,
    discount: discount > 0 ? round2(discount) : undefined,
    taxRate: Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 21,
    category,
    productId,
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
