/** Landed-cost & price helpers for the product catalogue. */

function num(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type CostBreakdownInput = {
  purchaseCostEur?: string | number | null;
  freightCostEur?: string | number | null;
  transportCostEur?: string | number | null;
  otherCostEur?: string | number | null;
  dutyPct?: string | number | null;
};

/** Landed cost per unit = purchase + freight + transport + other + duty% on (purchase + freight). */
export function landedCost(p: CostBreakdownInput): number {
  const purchase = num(p.purchaseCostEur);
  const freight = num(p.freightCostEur);
  const transport = num(p.transportCostEur);
  const other = num(p.otherCostEur);
  const duty = num(p.dutyPct);
  const dutyAmount = (purchase + freight) * (duty / 100);
  return round2(purchase + freight + transport + other + dutyAmount);
}

export function hasCostBreakdown(p: CostBreakdownInput): boolean {
  return (
    num(p.purchaseCostEur) > 0 ||
    num(p.freightCostEur) > 0 ||
    num(p.transportCostEur) > 0 ||
    num(p.otherCostEur) > 0
  );
}

/**
 * Suggested ex-VAT sales price from a target margin %.
 * "Marge" = profit as a percentage of the **selling price** (the usual retail
 * definition, and the max discount you can give): 65 % → price = cost / 0,35.
 */
export function suggestedPrice(cost: number, marginPct: number | null | undefined): number {
  const m = num(marginPct);
  if (cost <= 0) return 0;
  if (m <= 0 || m >= 100) return round2(cost);
  return round2(cost / (1 - m / 100));
}

/** Profit of `price` over `cost`, and that profit as a % of the selling price. */
export function marginOf(price: number, cost: number): { eur: number; pct: number } | null {
  if (!(price > 0) || !(cost > 0)) return null;
  const eur = round2(price - cost);
  return { eur, pct: Math.round((eur / price) * 100) };
}
