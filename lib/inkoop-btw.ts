/**
 * De btw op een inkoopfactuur of bon vastleggen.
 *
 * Staat er geen btw-uitsplitsing op een bon, dan weet het CRM niet of het
 * bedrag incl. of ex. btw is. Voor een arbeidsfactuur van een lokale ploeg
 * nemen we dan 21% aan (`poExVatAssumingSpanishVat`) — dat is voor die
 * facturen juister dan het totaal als kost boeken. Maar een contant betaalde
 * bon van een zelfstandige draagt vaak helemaal geen btw, en dan is die aanname
 * precies fout: de kost komt 21% te laag op de werf te staan, en correcties
 * worden bij de volgende herberekening weer teruggerekend.
 *
 * Daarom kun je het per bon zeggen. Dit rekent uit wat er dan in `subtotal` en
 * `tax` moet staan; puur, zodat het te testen is.
 */

/** Tarieven die op een Spaanse factuur voorkomen, plus "geen btw". */
export const BTW_KEUZES = [
  { key: "geen", label: "Geen btw", tarief: 0 },
  { key: "21", label: "21% btw", tarief: 0.21 },
  { key: "10", label: "10% btw", tarief: 0.1 },
  { key: "4", label: "4% btw", tarief: 0.04 },
] as const;

export type BtwKeuze = (typeof BTW_KEUZES)[number]["key"];

export function isBtwKeuze(waarde: string): waarde is BtwKeuze {
  return BTW_KEUZES.some((k) => k.key === waarde);
}

export interface BtwUitsplitsing {
  /** Bedrag ex. btw — de basis voor kosten, marge en de verdeling over werven. */
  subtotal: number;
  /** Het btw-bedrag; 0 bij een bon zonder btw. */
  tax: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits een factuurtotaal in ex. btw en btw.
 *
 * Het totaal is wat er betaald is; bij "geen btw" is dat dus ook het bedrag ex.
 * btw en blijft er niets over voor de fiscus.
 */
export function splitsBtw(totaal: number | string | null | undefined, keuze: BtwKeuze): BtwUitsplitsing {
  const tot = Number(totaal) || 0;
  const tarief = BTW_KEUZES.find((k) => k.key === keuze)?.tarief ?? 0;
  if (tarief === 0) return { subtotal: r2(tot), tax: 0 };
  const subtotal = r2(tot / (1 + tarief));
  // De btw is het verschil, niet nog een afronding: samen moeten ze exact het
  // betaalde totaal zijn, anders klopt de bon niet met de bank.
  return { subtotal, tax: r2(tot - subtotal) };
}

/**
 * Bestaande werfregels meeschalen als de basis verandert.
 *
 * Stond er 2.555,10 verdeeld over twee werven en blijkt het bedrag 3.091,67 ex.
 * btw te zijn, dan moeten die regels mee — anders staat de verdeling lager dan
 * de bon en gaat het verschil nergens heen. Verhoudingen blijven gelijk; het
 * laatste deel vangt de afrondingscenten op zodat de som exact klopt.
 */
export function schaalVerdeling(bedragen: number[], nieuwTotaal: number): number[] {
  const som = bedragen.reduce((s, b) => s + b, 0);
  if (bedragen.length === 0) return [];
  if (som <= 0) {
    // Niets om op te schalen: gelijk verdelen, met de rest op de laatste.
    const deel = r2(nieuwTotaal / bedragen.length);
    const uit = bedragen.map(() => deel);
    uit[uit.length - 1] = r2(nieuwTotaal - deel * (bedragen.length - 1));
    return uit;
  }
  const uit = bedragen.map((b) => r2((b / som) * nieuwTotaal));
  const verschil = r2(nieuwTotaal - uit.reduce((s, b) => s + b, 0));
  uit[uit.length - 1] = r2(uit[uit.length - 1] + verschil);
  return uit;
}
