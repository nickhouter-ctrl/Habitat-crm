/** Shared helpers for CRM documents (offertes / facturen). */
import type { DocumentLineItem } from "@/lib/db/schema";

export type DocKind = "estimate" | "proforma" | "invoice" | "creditnote" | "salesreceipt";

export const DOC_KIND_PREFIX: Record<DocKind, string> = {
  estimate: "OFF",
  proforma: "PRO",
  invoice: "FAC",
  creditnote: "CN",
  salesreceipt: "BON",
};

/** Round to cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineNet(item: Pick<DocumentLineItem, "units" | "price">): number {
  return round2((Number(item.units) || 0) * (Number(item.price) || 0));
}

export function lineTax(item: DocumentLineItem): number {
  return round2(lineNet(item) * ((Number(item.taxRate) || 0) / 100));
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
  return {
    name: name.slice(0, 300),
    description:
      typeof r.description === "string" && r.description.trim()
        ? r.description.trim().slice(0, 2000)
        : undefined,
    units: Number.isFinite(units) && units > 0 ? units : 1,
    price: Number.isFinite(price) ? round2(price) : 0,
    taxRate: Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 21,
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
