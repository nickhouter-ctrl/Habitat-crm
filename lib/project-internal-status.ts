import type { AdvanceCover, ProjectMargins } from "@/lib/project-financials";

/**
 * Interne stand van een project: wat we ÉCHT kwijt zijn naast wat we
 * doorberekenen. Zelfde bronnen als het voorschotoverzicht (loadProjectFunding),
 * plus het verschil tussen het doorberekende en het werkelijk betaalde
 * uurtarief (time_entries.actual_hourly_cost_eur).
 *
 * Nooit naar de klant: hier staan onze kostprijzen en marges in.
 */
export type InternalStatus = {
  labor: { cost: number; charged: number };
  materials: { cost: number; charged: number };
  other: { cost: number; charged: number };
  work: { cost: number; charged: number };
  products: number;
  totalCost: number;
  totalCharged: number;
  received: number;
  /** Wat er netto uit eigen zak is gegaan (positief = voorgeschoten). */
  prefinancedReal: number;
  /** Wat de klant volgens het voorschotoverzicht nog moet aanvullen (positief = tekort). */
  prefinancedClient: number;
  /** Uitsplitsing van het verschil tussen beide. */
  markup: number;
  laborRateGain: number;
  /** Overige verrekeningen (tegoed, productontvangsten boven kostprijs). */
  adjustments: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100 || 0; // geen -0

export function deriveInternalStatus(i: {
  cover: Pick<AdvanceCover, "totalReceived" | "saldo">;
  margins: Pick<ProjectMargins, "laborCost" | "laborRevenue" | "purchaseCost" | "purchaseRevenue" | "otherCost" | "otherRevenue">;
  ownProductCost: number;
  /** Doorberekend − werkelijk betaald uurloon (≥ 0 als we minder betalen dan we rekenen). */
  laborRateGain: number;
}): InternalStatus {
  const { margins: m } = i;
  const labor = { cost: r2(m.laborCost - i.laborRateGain), charged: r2(m.laborRevenue) };
  const materials = { cost: r2(m.purchaseCost), charged: r2(m.purchaseRevenue) };
  const other = { cost: r2(m.otherCost), charged: r2(m.otherRevenue) };
  const work = { cost: r2(labor.cost + materials.cost + other.cost), charged: r2(labor.charged + materials.charged + other.charged) };
  const products = r2(i.ownProductCost);
  const totalCost = r2(work.cost + products);
  const totalCharged = r2(work.charged + products);
  const received = r2(i.cover.totalReceived);
  const prefinancedReal = r2(totalCost - received);
  const prefinancedClient = r2(-i.cover.saldo);
  const markup = r2(work.charged - (m.laborCost + m.purchaseCost + m.otherCost));
  const laborRateGain = r2(i.laborRateGain);
  const adjustments = r2(prefinancedClient - prefinancedReal - markup - laborRateGain);
  return { labor, materials, other, work, products, totalCost, totalCharged, received, prefinancedReal, prefinancedClient, markup, laborRateGain, adjustments };
}
