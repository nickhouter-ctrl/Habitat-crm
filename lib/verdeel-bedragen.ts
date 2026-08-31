/**
 * Bedragen verdelen over de werven van één inkoopfactuur.
 *
 * Bij het goedkeuren vul je per werf een project, meestal uren, en soms een
 * bedrag. Wie de bedragen leeg laat bedoelt "verdeel het maar" — bij een
 * urenfactuur vul je uren per werf en niet de euro's. Eerder verdween zo'n regel
 * gewoon, en dan stond de factuur er zonder project in.
 *
 * De regels met een bedrag houden dat bedrag. Wat er van de factuur overblijft
 * gaat naar de regels zonder bedrag, naar rato van hun uren; heeft niemand uren,
 * dan gelijk op. En het geheel kan nooit meer worden dan de factuur ex btw waard
 * is — btw is geen kostprijs.
 */
export type Deel<T> = T & { hours?: number | null; amount?: number | null };

export function verdeelBedragen<T>(
  delen: Deel<T>[],
  totaalExBtw: number,
  /**
   * Uurtarief van de arbeider, als hij een ploegkaart heeft. Dan volgt het
   * bedrag rechtstreeks uit uren × tarief — dat is wat er is afgesproken, en
   * niet een verdeelsleutel. Naar rato verdelen blijft de terugval.
   */
  uurtarief?: number | null,
): (T & { hours?: number | null; amount: number })[] {
  const tarief = Number(uurtarief ?? 0);
  if (tarief > 0 && delen.some((d) => d.amount == null && (d.hours ?? 0) > 0)) {
    const uitTarief = delen.map((d) =>
      d.amount != null
        ? { ...d, amount: d.amount }
        : { ...d, amount: Math.round((d.hours ?? 0) * tarief * 100) / 100 },
    );
    return begrens(uitTarief, totaalExBtw);
  }

  const metBedrag = delen.filter((d) => d.amount != null);
  const zonder = delen.filter((d) => d.amount == null);
  const rest = Math.max(0, totaalExBtw - metBedrag.reduce((s, d) => s + (d.amount ?? 0), 0));
  const urenSom = zonder.reduce((s, d) => s + (d.hours ?? 0), 0);

  const aangevuld = delen.map((d) => {
    if (d.amount != null) return { ...d, amount: d.amount };
    const deel = urenSom > 0 ? (rest * (d.hours ?? 0)) / urenSom : zonder.length > 0 ? rest / zonder.length : 0;
    return { ...d, amount: Math.round(deel * 100) / 100 };
  });

  return begrens(aangevuld, totaalExBtw);
}

/** Nooit meer boeken dan de factuur ex btw waard is; verhoudingen blijven. */
function begrens<T extends { amount: number }>(delen: T[], totaalExBtw: number): T[] {
  const som = delen.reduce((s, d) => s + d.amount, 0);
  if (som > totaalExBtw + 0.01 && som > 0) {
    const factor = totaalExBtw / som;
    return delen.map((d) => ({ ...d, amount: Math.round(d.amount * factor * 100) / 100 }));
  }
  return delen;
}
