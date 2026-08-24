/**
 * Uren terugrekenen uit een factuurbedrag.
 *
 * Een bouwer factureert een weekbedrag en noemt zelden uren ("trabajos
 * realizados", € 4.750). Zonder urenopgave boekte het systeem het hele bedrag
 * als één post van 1 uur — de kost klopte, de urenstand van de werf niet.
 * Kennen we zijn tarief van de ploegkaart, dan volgen de uren daaruit.
 *
 * Altijd ex. btw rekenen: het uurtarief op een ploegkaart is dat ook.
 */
export function urenUitTarief(
  bedragExBtw: number | null | undefined,
  uurtarief: number | null | undefined,
): number | null {
  const bedrag = Number(bedragExBtw ?? 0);
  const tarief = Number(uurtarief ?? 0);
  if (!Number.isFinite(bedrag) || !Number.isFinite(tarief)) return null;
  if (bedrag <= 0 || tarief <= 0) return null;
  return Math.round((bedrag / tarief) * 100) / 100;
}

/**
 * Het tarief dat we bij die afgeronde uren wegschrijven. Niet het tarief van de
 * kaart: € 4.750 ÷ 169,64 u is € 28,000472, en met € 28,00 zou er € 4.749,92 op
 * de werf staan. De geboekte kost moet exact het factuurbedrag zijn, dus het
 * tarief draagt de afronding — daarom staan er zes decimalen in de database.
 */
export function tariefBijUren(bedragExBtw: number, uren: number): number {
  return uren > 0 ? bedragExBtw / uren : 0;
}
