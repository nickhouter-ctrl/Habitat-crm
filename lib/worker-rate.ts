/**
 * Welk uurtarief geldt er voor deze arbeider bij deze betaalwijze?
 *
 * Contant werken tegen een ander tarief dan op factuur is normaal in de bouw.
 * Dat stond tot 24-08-2026 als twee ploegkaarten met dezelfde naam in de lijst
 * (imad € 24 per factuur naast imad € 20 contant) — met als gevolg dat zijn
 * uren over twee kaarten verspreid raakten en geen van beide zijn hele werk
 * liet zien. Eén kaart, twee tarieven.
 *
 * Geen apart contant tarief ingevuld? Dan geldt het factuurtarief; zo verandert
 * er niets voor de arbeiders die maar één tarief hebben.
 */
export type WorkerRates = {
  hourlyCostEur: string | number | null;
  hourlyCostCashEur: string | number | null;
};

export function workerRate(
  worker: WorkerRates | null | undefined,
  paymentMethod: "cash" | "invoice",
): number | null {
  if (!worker) return null;
  const factuur = getal(worker.hourlyCostEur);
  const contant = getal(worker.hourlyCostCashEur);
  if (paymentMethod === "cash") return contant ?? factuur;
  return factuur ?? contant;
}

function getal(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
