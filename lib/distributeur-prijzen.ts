/**
 * Distributeurprijzen voor Flexibel Stone.
 *
 * Een verkooppunt koopt bij ons in en verkoopt door tegen de vaste
 * adviesprijs. Twee afspraken (Nick, 29-09-2026):
 *
 *  - **verkooppunt: 50% van de adviesprijs.** De adviesprijs ligt vast, dus de
 *    marge van het verkooppunt is precies de helft. Geen staffels, geen
 *    onderhandeling per order — dat is het hele punt van een prijslijst die je
 *    zo aan een architect op de beurs kunt meegeven.
 *  - **showroommateriaal: 30% van de adviesprijs (70% korting).** Platen die aan
 *    de muur gaan om te laten zien, niet om door te verkopen.
 *
 * De berekening staat los van de database en van het PDF, zodat de afspraak in
 * één oogopslag te lezen en te testen is.
 */

/** Wat een verkooppunt betaalt, als deel van de adviesprijs. */
export const DEEL_VERKOOPPUNT = 0.5;
/** Wat showroommateriaal kost, als deel van de adviesprijs. */
export const DEEL_SHOWROOM = 0.3;

/** Kortingspercentages zoals ze in het document staan. */
export const KORTING_VERKOOPPUNT = Math.round((1 - DEEL_VERKOOPPUNT) * 100);
export const KORTING_SHOWROOM = Math.round((1 - DEEL_SHOWROOM) * 100);

/**
 * Afronden op € 0,05. Een halve adviesprijs geeft bedragen als € 24,975; op een
 * prijslijst wil je € 24,95 zien. Naar beneden afronden, zodat het verkooppunt
 * nooit meer betaalt dan de afgesproken helft.
 */
export function afrondPrijs(bedrag: number): number {
  return Math.floor(bedrag * 20) / 20;
}

export interface Distributeurprijs {
  /** Vaste adviesprijs (ex btw) — wat de klant in de winkel betaalt, ex btw. */
  adviesEx: number;
  /** Adviesprijs incl. btw, zoals hij op de website staat. */
  adviesIncl: number;
  /** Inkoopprijs voor het verkooppunt (ex btw). */
  verkooppunt: number;
  /** Prijs voor showroommateriaal (ex btw). */
  showroom: number;
}

const BTW = 1.21;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** De drie prijzen bij één adviesprijs (ex btw). */
export function distributeurPrijzen(adviesEx: number | null | undefined): Distributeurprijs | null {
  const advies = Number(adviesEx);
  if (!Number.isFinite(advies) || advies <= 0) return null;
  return {
    adviesEx: r2(advies),
    adviesIncl: r2(advies * BTW),
    verkooppunt: afrondPrijs(advies * DEEL_VERKOOPPUNT),
    showroom: afrondPrijs(advies * DEEL_SHOWROOM),
  };
}

/** Marge van het verkooppunt in euro's: wat er overblijft bij doorverkoop. */
export function margeVerkooppunt(prijs: Distributeurprijs): number {
  return r2(prijs.adviesEx - prijs.verkooppunt);
}
