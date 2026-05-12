/** Helpers for purchase orders ("binnenkomende bestellingen" — supplier orders). */
import type { BadgeTone } from "@/components/ui";
import type { PurchaseOrderLineItem } from "@/lib/db/schema";

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
export function parsePoLineItems(raw: unknown): PurchaseOrderLineItem[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
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
