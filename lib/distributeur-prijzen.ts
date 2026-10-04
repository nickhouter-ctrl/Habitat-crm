/** Prijsvoorstel per paneelmaat, met een ondergrens voor onze brutomarge.
 * Adviesprijzen zijn vrijblijvend. Dit wijzigt geen bestaande contracten. */
export const DEALER_STAFFELS = [
  { id: "start", vanafM2: 0, totM2: 500, kortingPct: 35 },
  { id: "groei", vanafM2: 500, totM2: 1000, kortingPct: 37.5 },
  { id: "partner", vanafM2: 1000, totM2: 2000, kortingPct: 40 },
  { id: "plus", vanafM2: 2000, totM2: 5000, kortingPct: 42.5 },
  { id: "volume", vanafM2: 5000, totM2: null, kortingPct: 45 },
] as const;
export type DealerStaffelId = typeof DEALER_STAFFELS[number]["id"];
export const KORTING_VERKOOPPUNT = 35;
export const KORTING_SHOWROOM = 60;
export const MIN_MARGE_VERKOOPPUNT = 35;
export const MIN_MARGE_SHOWROOM = 30;
export const DEEL_VERKOOPPUNT = 1 - KORTING_VERKOOPPUNT / 100;
export const DEEL_SHOWROOM = 1 - KORTING_SHOWROOM / 100;

export function staffelVoorVolume(m2: number) {
  if (!Number.isFinite(m2) || m2 < 0) throw new Error("Ongeldige jaarafname.");
  return [...DEALER_STAFFELS].reverse().find(s => m2 >= s.vanafM2)!;
}
export function staffelMetId(id: unknown) {
  return DEALER_STAFFELS.find(s => s.id === id) ?? DEALER_STAFFELS[0];
}
export const afrondPrijs = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const omhoog = (n: number) => Math.ceil((n - 1e-9) * 100) / 100;
export type PrijsOpties = { staffelId?: DealerStaffelId; extraKostenPerM2?: number };
export type VeiligePrijs = {
  ex: number | null; incl: number | null; kortingPct: number | null;
  bijdrage: number | null; margePct: number | null; begrensd: boolean;
};
export interface Distributeurprijs {
  adviesEx: number; adviesIncl: number; vatRate: number;
  verkooppunt: number | null; verkooppuntIncl: number | null;
  showroom: number | null; showroomIncl: number | null; kostEx: number | null;
  dealer: VeiligePrijs; display: VeiligePrijs;
}
/** Marge = bijdrage / verkoopprijs. Opslag op de kostprijs is een ander getal. */
export function brutomarge(prijs: number, kost: number) {
  return { eur: afrondPrijs(prijs - kost), pct: ((prijs - kost) / prijs) * 100 };
}
export function veiligePrijs(advies: number, kost: number | null, korting: number, minimumMarge: number, vatRate: number): VeiligePrijs {
  const leeg: VeiligePrijs = { ex: null, incl: null, kortingPct: null, bijdrage: null, margePct: null, begrensd: false };
  if (!Number.isFinite(advies) || advies <= 0 || kost == null || !Number.isFinite(kost) || kost <= 0 ||
      !Number.isFinite(korting) || korting < 0 || korting >= 100 ||
      !Number.isFinite(minimumMarge) || minimumMarge < 0 || minimumMarge >= 100 ||
      !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return leeg;
  // Naar boven afronden voorkomt dat centafronding onze minimum-marge aantast.
  const minimum = omhoog(kost / (1 - minimumMarge / 100));
  if (minimum > afrondPrijs(advies)) return { ...leeg, begrensd: true };
  const doel = afrondPrijs(advies * (1 - korting / 100));
  const ex = Math.max(doel, minimum);
  const marge = brutomarge(ex, kost);
  return { ex, incl: afrondPrijs(ex * (1 + vatRate / 100)),
    kortingPct: Math.max(0, (1 - ex / advies) * 100), bijdrage: marge.eur,
    margePct: marge.pct, begrensd: minimum > doel };
}
/** Zonder kostprijs: adviesprijs beschikbaar, inkoop alleen op aanvraag. */
export function distributeurPrijzen(adviesEx: number | null | undefined, kostEx: number | null = null, opties: PrijsOpties = {}, vatRate = 21): Distributeurprijs | null {
  const advies = Number(adviesEx);
  if (!Number.isFinite(advies) || advies <= 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return null;
  const kost = kostEx != null && Number.isFinite(kostEx) && kostEx > 0 ? kostEx : null;
  const dealer = veiligePrijs(advies, kost, staffelMetId(opties.staffelId).kortingPct, MIN_MARGE_VERKOOPPUNT, vatRate);
  const display = veiligePrijs(advies, kost, KORTING_SHOWROOM, MIN_MARGE_SHOWROOM, vatRate);
  return { adviesEx: afrondPrijs(advies), adviesIncl: afrondPrijs(advies * (1 + vatRate / 100)), vatRate,
    verkooppunt: dealer.ex, verkooppuntIncl: dealer.incl, showroom: display.ex, showroomIncl: display.incl, kostEx: kost, dealer, display };
}
export function margeVerkooppunt(prijs: Distributeurprijs): number | null {
  return prijs.verkooppunt == null ? null : afrondPrijs(prijs.adviesEx - prijs.verkooppunt);
}
