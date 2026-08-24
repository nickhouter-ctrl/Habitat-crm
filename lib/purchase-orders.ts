/** Helpers for purchase orders ("binnenkomende bestellingen" — supplier orders). */
import type { BadgeTone } from "@/components/ui";
import type { PurchaseOrderAttachment, PurchaseOrderLineItem } from "@/lib/db/schema";

export const PO_STATUSES = [
  "draft",
  "ordered",
  "in_transit",
  "received",
  "cancelled",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_META: Record<PoStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Concept", tone: "neutral" },
  ordered: { label: "Besteld", tone: "info" },
  in_transit: { label: "Onderweg", tone: "warning" },
  received: { label: "Ontvangen", tone: "success" },
  cancelled: { label: "Geannuleerd", tone: "danger" },
};

/** Statuses that mean "still expected" — used on the dashboard. */
export const PO_OPEN_STATUSES: PoStatus[] = ["ordered", "in_transit"];

export function poLineTotal(it: { units: number; unitPrice: number }): number {
  return (Number(it.units) || 0) * (Number(it.unitPrice) || 0);
}

export function poTotal(items: PurchaseOrderLineItem[]): number {
  return items.reduce((s, it) => s + poLineTotal(it), 0);
}

/** Standaard Spaans btw-tarief — alleen gebruikt waar we ZEKER weten dat er btw op zit. */
export const PO_ASSUMED_VAT_RATE = 0.21;

export type PoExVat = {
  amount: number;
  /** true = de btw stond niet op de inkooporder; `amount` is het totaal, dus mogelijk incl. btw. */
  vatUnknown: boolean;
};

/**
 * Bedrag EX. BTW van een inkooporder — de enige juiste basis voor kosten en marge.
 *
 * Volgorde:
 *  1. subtotaal (door Holded/AI uitgelezen)            → hard cijfer
 *  2. totaal − btw                                     → hard cijfer
 *  3. bestelling met CATALOGUSREGELS                   → stukprijzen zijn inkoopprijzen, al ex. btw
 *  4. anders                                           → totaal, met `vatUnknown`
 *
 * Bewust GEEN blinde ÷1,21 in stap 4: veel inkoop is import (China) of btw-verlegd
 * en draagt helemaal geen btw — daar zou delen de kost 21% te LAAG maken. Wat we
 * niet weten, tonen we als onbekend zodat het te corrigeren is, i.p.v. te gokken.
 */
export function poExVat(po: {
  subtotal?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  items?: unknown;
}): PoExVat {
  // Let op: bedragen kunnen negatief zijn (creditnota van een leverancier) —
  // vergelijk daarom op "≠ 0", niet op "> 0".
  const sub = Number(po.subtotal) || 0;
  const tax = Number(po.tax) || 0;
  const tot = Number(po.total) || 0;
  if (sub !== 0) return { amount: sub, vatUnknown: false };
  if (tot !== 0 && tax !== 0) return { amount: round2(tot - tax), vatUnknown: false };
  if (tot === 0) return { amount: 0, vatUnknown: false };
  if (hasCatalogueLines(po.items)) return { amount: tot, vatUnknown: false };
  return { amount: tot, vatUnknown: true };
}

/**
 * Zelfde als {@link poExVat}, maar voor inkoop waarvan vaststaat dat er Spaanse
 * btw op zit (bv. een uren-/arbeidsfactuur van een lokale bouwer): is de btw niet
 * uitgelezen, dan 21% aannemen i.p.v. het incl.-btw-totaal als kost boeken.
 */
export function poExVatAssumingSpanishVat(po: Parameters<typeof poExVat>[0]): {
  amount: number;
  vatAssumed: boolean;
} {
  const ex = poExVat(po);
  if (!ex.vatUnknown) return { amount: ex.amount, vatAssumed: false };
  return { amount: round2(ex.amount / (1 + PO_ASSUMED_VAT_RATE)), vatAssumed: true };
}

/** Heeft de bestelling regels die aan een catalogusproduct hangen (= inkoopprijzen, ex. btw)? */
function hasCatalogueLines(items: unknown): boolean {
  return parsePoLineItems(items).some((it) => !!it.productId);
}

/** Kortweg: alleen het bedrag ex. btw (zie {@link poExVat}). */
export function poExVatAmount(po: Parameters<typeof poExVat>[0]): number {
  return poExVat(po).amount;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format an amount in the order's currency (USD orders are common here). */
export function formatMoney(amount: number | string | null | undefined, currency = "EUR"): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Parse a JSON line-items payload coming from a form field. */
/**
 * Lees bijlagen robuust uit. Sommige oude rijen staan in de DB als (dubbel)
 * ge-encode JSON-string i.p.v. een array — die zouden anders `.map` laten
 * crashen op de detailpagina. Pelt tot 3 string-lagen af en valideert.
 */
export function normalizePoAttachments(raw: unknown): PurchaseOrderAttachment[] {
  let val: unknown = raw;
  for (let i = 0; i < 3 && typeof val === "string"; i++) {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  const out: PurchaseOrderAttachment[] = [];
  for (const r of val) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const path = String(o.path ?? "").trim();
    if (!path) continue;
    out.push({
      name: String(o.name ?? "").trim() || path,
      path,
      size: typeof o.size === "number" ? o.size : undefined,
      uploadedAt: o.uploadedAt ? String(o.uploadedAt) : undefined,
    });
  }
  return out;
}

export function parsePoLineItems(raw: unknown): PurchaseOrderLineItem[] {
  let arr: unknown = raw;
  // Pel (dubbel) ge-encode JSON-strings af — sommige oude rijen staan zo opgeslagen.
  for (let i = 0; i < 3 && typeof arr === "string"; i++) {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: PurchaseOrderLineItem[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const units = Number(o.units);
    const unitPrice = Number(o.unitPrice);
    if (!name && !Number.isFinite(units)) continue;
    out.push({
      name: name || "(naamloos)",
      sku: o.sku ? String(o.sku).trim() : undefined,
      productId: o.productId ? String(o.productId) : undefined,
      units: Number.isFinite(units) ? units : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      note: o.note ? String(o.note).trim() : undefined,
    });
  }
  return out;
}

/** Naam → losse woorden, hoofdletters en leestekens weg. */
export function naamWoorden(naam: string | null | undefined): string[] {
  return (naam ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Hoort deze leveranciersnaam bij deze arbeider? Elk woord van de ploegnaam moet
 * in de andere naam voorkomen.
 *
 * Woord-voor-woord en niet "bevat elkaar", want de factuur draagt vaak een naam
 * méér dan de ploegkaart: "Wilhelmus Mark Strijks" tegenover "Wilhelmus
 * Strijks". Aan elkaar geplakt bevat de een de ander niet, dus die vergelijking
 * liet zijn hele overzicht leeg — precies zoals bij "Zerghini Abdelmjid" naast
 * arbeider "Abdelmjid".
 *
 * Korte woorden (≤ 2 letters) tellen niet mee: "de", "el", initialen.
 */
export function naamHoortBij(ploegNaam: string | null | undefined, andereNaam: string | null | undefined): boolean {
  const ploeg = naamWoorden(ploegNaam).filter((w) => w.length >= 3);
  const ander = naamWoorden(andereNaam);
  if (ploeg.length === 0 || ander.length === 0) return false;
  return ploeg.every((w) => ander.includes(w));
}

/**
 * Zoekt bij een leveranciersnaam de arbeider uit de eigen ploeg.
 *
 * Bij twijfel (geen match of meer dan één) geeft dit `null` terug: liever laten
 * kiezen dan de uren onder de verkeerde naam boeken.
 */
export function matchWorkerByName<T extends { id: string; name: string }>(
  supplier: string | null | undefined,
  workers: T[],
): T | null {
  const treffers = workers.filter((w) => naamHoortBij(w.name, supplier));
  return treffers.length === 1 ? treffers[0] : null;
}
