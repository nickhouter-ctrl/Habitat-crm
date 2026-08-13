/**
 * Statistiek voor de leerlaag (brief §8) — de reden dat de ranglijst te
 * vertrouwen is bij showroombudgetten met kleine aantallen.
 *
 * - CTR wordt gerangschikt op de Wilson lower bound (95%), nooit op het rauwe
 *   percentage: "3 klikken op 11 impressies" wint dan niet meer van een
 *   advertentie met 2% CTR op 10.000 impressies.
 * - Kosten-per-lead worden met empirical Bayes naar het accountgemiddelde
 *   getrokken, gewogen naar volume: weinig leads → sterk geschrompeld, veel
 *   leads → vrijwel de rauwe waarde.
 * - Onder de oordeeldrempel (1.000 impressies én 7 advertentie-dagen) wordt
 *   geen oordeel getoond, alleen "nog te weinig data".
 *
 * Puur en zonder afhankelijkheden — de nachtelijke job en de UI delen deze
 * ene bron van waarheid.
 */

/** z-waarde voor 95%-betrouwbaarheid (tweezijdig). */
const Z_95 = 1.959963984540054;

/**
 * Wilson score-interval, ondergrens. Antwoord op: "hoe laag kan de échte CTR
 * zijn, gegeven deze steekproef, met 95% zekerheid?" Rangschik hierop.
 */
export function wilsonLowerBound(successes: number, trials: number, z = Z_95): number {
  if (trials <= 0 || successes <= 0) return 0;
  const n = trials;
  const p = Math.min(1, successes / n);
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denominator);
}

/**
 * Sterkte van de prior voor de CPL-shrinkage, uitgedrukt in "virtuele leads"
 * tegen het accountgemiddelde. Bij 5 echte leads weegt de eigen data dus
 * even zwaar als de prior; bij 50 leads domineert de eigen data.
 */
export const CPL_PRIOR_LEADS = 5;

/**
 * Kosten-per-lead met empirical-Bayes-shrinkage naar het accountgemiddelde,
 * gewogen naar volume: (besteding + k·accountCPL) / (leads + k).
 * Blijft eindig bij nul leads — besteding zonder resultaat wordt zichtbaar
 * duurder dan het gemiddelde, zonder deling door nul.
 */
export function empiricalBayesCpl(
  spendEur: number,
  leads: number,
  accountCplEur: number,
  priorLeads = CPL_PRIOR_LEADS,
): number {
  return (spendEur + priorLeads * accountCplEur) / (leads + priorLeads);
}

/** Oordeeldrempels (brief §8): minder dan dit = "nog te weinig data". */
export const MIN_IMPRESSIONS = 1000;
export const MIN_AD_DAYS = 7;

/** Mag er een oordeel getoond worden over deze facetwaarde? */
export function meetsVerdictThreshold(impressions: number, adDays: number): boolean {
  return impressions >= MIN_IMPRESSIONS && adDays >= MIN_AD_DAYS;
}
