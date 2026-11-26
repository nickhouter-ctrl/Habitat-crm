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

/**
 * Contante uren (afspraak Nick, 26-11-2026): ALTIJD € 28 doorberekenen aan de
 * klant (daar komt de projectopslag van 15% nog bovenop) en ALTIJD € 20 als
 * werkelijk betaald. Wijkt het af, dan passen ze de regel zelf aan.
 */
export const CASH_BILLED_RATE_EUR = 28;
export const CASH_ACTUAL_RATE_EUR = 20;

/**
 * Tarieven voor een nieuwe urenregel: `hourlyCostEur` = doorberekend tarief,
 * `actualHourlyCostEur` = wat de arbeider echt krijgt (null = gelijk).
 * Per factuur: het factuurtarief van de ploegkaart, geen apart werkelijk tarief.
 */
export function timeEntryRates(
  worker: WorkerRates | null | undefined,
  paymentMethod: "cash" | "invoice",
): { hourlyCostEur: string; actualHourlyCostEur: string | null } | null {
  if (paymentMethod === "cash") {
    return { hourlyCostEur: String(CASH_BILLED_RATE_EUR), actualHourlyCostEur: String(CASH_ACTUAL_RATE_EUR) };
  }
  const rate = workerRate(worker, "invoice");
  return rate == null ? null : { hourlyCostEur: String(rate), actualHourlyCostEur: null };
}
