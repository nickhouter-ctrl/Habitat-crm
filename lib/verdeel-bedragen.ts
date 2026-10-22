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
    // Uren × tarief dekt vaak niet de hele factuur: Pieter Hoogendijk zet de
    // uren van zijn tweede man en het vervoer op dezelfde factuur. Dat restant
    // viel eerder weg (260076: € 1.260 geboekt van € 2.020). Het gaat nu mee naar
    // de regels zonder vast bedrag, naar rato van hun uren.
    const rest = Math.round((totaalExBtw - uitTarief.reduce((s, d) => s + d.amount, 0)) * 100) / 100;
    const ontvangers = delen.map((d, i) => (d.amount == null ? i : -1)).filter((i) => i >= 0);
    const urenOntvangers = ontvangers.reduce((s, i) => s + (delen[i].hours ?? 0), 0);
    if (rest > 0.01 && urenOntvangers > 0) {
      for (const i of ontvangers) {
        uitTarief[i] = {
          ...uitTarief[i],
          amount: Math.round((uitTarief[i].amount + (rest * (delen[i].hours ?? 0)) / urenOntvangers) * 100) / 100,
        };
      }
      return sluitAfOpCenten(uitTarief, totaalExBtw, ontvangers);
    }
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

  const ontvangers = delen.map((d, i) => (d.amount == null ? i : -1)).filter((i) => i >= 0);
  return begrens(rest > 0 ? sluitAfOpCenten(aangevuld, totaalExBtw, ontvangers) : aangevuld, totaalExBtw);
}

/** Afrondingscenten op de grootste ontvanger, zodat het geheel exact sluit. */
function sluitAfOpCenten<T extends { amount: number }>(delen: T[], totaalExBtw: number, ontvangers: number[]): T[] {
  const verschil = Math.round((totaalExBtw - delen.reduce((s, d) => s + d.amount, 0)) * 100) / 100;
  if (verschil === 0 || ontvangers.length === 0) return delen;
  const grootste = ontvangers.reduce((a, b) => (delen[b].amount > delen[a].amount ? b : a));
  return delen.map((d, i) => (i === grootste ? { ...d, amount: Math.round((d.amount + verschil) * 100) / 100 } : d));
}

/** Fout die de goedkeuring tegenhoudt omdat de verdeling niet op de factuur sluit. */
export class VerdelingFoutError extends Error {
  override name = "VerdelingFoutError";
}

/**
 * Waarom een goedkeuring níet door mag, of `null` als het klopt. De regel: wat
 * er op de werven komt is precies de factuur ex btw, op de cent. Een urenfactuur
 * moet op minstens één werf staan — behalve bij vaste lasten, uren die al via
 * het portaal of een goedgekeurde urenstaat op het project staan.
 */
export function verdelingFout(args: {
  kind: "labor" | "material" | null | undefined;
  verdelingen: { amount: number }[];
  exBtw: number;
  vrijgesteld: boolean;
}): string | null {
  if (args.vrijgesteld) return null;
  const eur = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (args.verdelingen.length === 0) {
    return args.kind === "labor"
      ? `Deze urenfactuur (${eur(args.exBtw)} ex btw) staat op geen enkele werf. Kies een werf, verdeel hem over werven, of vink "vaste lasten" aan.`
      : null;
  }
  const som = Math.round(args.verdelingen.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  if (Math.abs(som - args.exBtw) > 0.01) {
    return `De verdeling komt uit op ${eur(som)}, de factuur is ${eur(args.exBtw)} ex btw (verschil ${eur(Math.round((args.exBtw - som) * 100) / 100)}). Laat bij minstens één werf het bedrag leeg, of vul de bedragen zo in dat ze samen de factuur zijn.`;
  }
  return null;
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

/**
 * Een losse kostenpost op de factuur — transport, reiskosten — over dezelfde
 * werven verdelen als de rest. Naar rato van de uren als elke werf uren heeft
 * (wie meer dagen op een werf stond, reed er ook vaker heen), anders naar rato
 * van het bedrag per werf, en zonder iets bruikbaars gelijk op. Sluit op de cent.
 *
 * Wilhelmus 0-14: € 931,50 uren op Finca Lisa (5 u) en Thomas & Marit (29,5 u)
 * plus € 180 reiskosten — die € 180 hoort bij die twee werven, niet op een
 * derde regel zonder werf.
 */
export function verdeelOverWerven<T extends { hours?: number | null; amount: number }>(
  werven: T[],
  bedrag: number,
): (T & { amount: number })[] {
  if (werven.length === 0) return [];
  const opUren = werven.every((w) => (w.hours ?? 0) > 0);
  const opBedrag = werven.some((w) => w.amount > 0);
  const gewogen = verdeelBedragen(
    werven.map((w) => ({ w, hours: opUren ? w.hours : opBedrag ? Math.max(0, w.amount) : 1 })),
    bedrag,
  );
  return gewogen.map((g) => ({ ...g.w, amount: g.amount }));
}
