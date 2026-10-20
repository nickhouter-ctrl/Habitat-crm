import type { Product } from "./db/schema";

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dimensions = (s: string) => {
  const m = s.trim().match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
  return m ? m.slice(1).map(Number).sort((a, b) => a - b).join("x") : null;
};

/** Conservative reconciliation of existing records; no price or historical document edits. */
export function repairCatalogCosts(p: Product, caracoleCosts: Map<string, number>) {
  const reasons: string[] = [];
  const set: Partial<Product> = {};
  const sizes = Array.isArray(p.additionalSizes) ? p.additionalSizes : [];
  const baseDimensions = Number(p.widthMm) > 0 && Number(p.heightMm) > 0
    ? [Number(p.widthMm), Number(p.heightMm)].sort((a, b) => a - b).join("x") : null;
  const updated = sizes.map(s => {
    if (Number(s.costEur) > 0) return s;
    if (p.collection === "Caracole" && s.sku && caracoleCosts.has(s.sku)) {
      const purchase = caracoleCosts.get(s.sku)!;
      // Existing import policy: purchase is landed cost when no separate freight is known.
      reasons.push("Caracole: exact supplier SKU");
      return { ...s, purchaseEur: purchase, costEur: purchase };
    }
    if (p.collection === "Wandpanelen" && baseDimensions && dimensions(s.label) === baseDimensions && Number(p.costEur) > 0) {
      reasons.push("Panel: exact base dimensions");
      return { ...s, costEur: Number(p.costEur), ...(Number(p.purchaseCostEur) > 0 ? { purchaseEur: Number(p.purchaseCostEur) } : {}) };
    }
    return s;
  });
  if (reasons.length) set.additionalSizes = updated;
  // Only an original known variant can correct the base, never the values just backfilled above.
  const canonical = sizes.filter(s => baseDimensions && dimensions(s.label) === baseDimensions && Number(s.costEur) > 0 && Number(s.purchaseEur) > 0);
  if (p.collection === "Wandpanelen" && canonical.length === 1 && Math.abs(Number(p.costEur) - canonical[0].costEur!) > 0.011) {
    const size = canonical[0];
    if (size.costEur! >= size.purchaseEur!) {
      reasons.push("Panel: base aligned to exact canonical size");
      set.costEur = String(size.costEur);
      set.purchaseCostEur = String(size.purchaseEur);
      // Canonical sizes contain total landed cost, not a verified customs breakdown.
      // Store the known remainder as aggregate costs so editing cannot restore the old total.
      set.otherCostEur = String(round(size.costEur! - size.purchaseEur!));
      set.freightCostEur = null;
      set.transportCostEur = null;
      set.dutyPct = null;
    }
  }
  return { set, reasons };
}
