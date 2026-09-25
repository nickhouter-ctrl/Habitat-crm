/**
 * Dezelfde factuur die twee keer in de projectkosten staat.
 *
 * Ontstaat zo: een factuur wordt met de hand als urenregel ingetypt ("Factuur
 * A0010 — Silvestre"), en later komt dezelfde factuur via de inkoopmail binnen
 * en maakt daar zijn eigen, aan de inkooporder gekoppelde regel. Niets verbindt
 * die twee: de handmatige regel noemt het factuurnummer alleen in zijn TEKST.
 * Op Silvestre en Finca Lisa stond op die manier € 19.421,56 te veel aan kosten.
 *
 * De regel die het onderscheid maakt: één gekoppelde regel naast één handmatige
 * met hetzelfde factuurnummer én (vrijwel) hetzelfde bedrag. Twee gekoppelde
 * regels zijn de delen van één verdeelde factuur, en twee handmatige regels met
 * hetzelfde bedrag zijn meestal gewoon weken van dezelfde weekfactuur — daar
 * zou een melding elke week opnieuw over gaan.
 */

/** Regel uit de projectkosten die naar een factuur kán verwijzen. */
export type KostenRegel = {
  id: string;
  soort: "uren" | "kosten";
  werf: string;
  datum: string;
  bedrag: number;
  /** Notitie/omschrijving plus de referentie van de inkooporder. */
  tekst: string;
  /** Hangt deze regel aan een inkooporder? */
  gekoppeld: boolean;
};

export type DubbeleFactuur = {
  werf: string;
  nummer: string;
  bedrag: number;
  gekoppeldeRegel: KostenRegel;
  handmatigeRegel: KostenRegel;
};

/**
 * Factuurnummers uit vrije tekst: A0010, 0-04, 260053, 0023/2026, FV26/2416.
 * Jaartallen en te korte reeksen vallen af — anders is "2026" een factuurnummer.
 */
export function factuurNummers(tekst: string | null | undefined): string[] {
  if (!tekst) return [];
  const uit = new Set<string>();
  for (const m of tekst.matchAll(/\b([A-Z]{0,3}\d{2,6}(?:\/\d{2,4})?|\d-\d{2})\b/gi)) {
    const n = m[1].toUpperCase();
    if (/^(19|20)\d{2}$/.test(n)) continue;
    if (n.replace(/\D/g, "").length < 2) continue;
    if (n.length < 3) continue;
    uit.add(n);
  }
  return [...uit];
}

/** Zoek paren: één gekoppelde en één handmatige regel voor dezelfde factuur. */
export function zoekDubbeleFacturen(regels: KostenRegel[], marge = 0.1): DubbeleFactuur[] {
  const perSleutel = new Map<string, KostenRegel[]>();
  for (const r of regels) {
    for (const nummer of factuurNummers(r.tekst)) {
      const sleutel = `${r.werf}||${nummer}`;
      perSleutel.set(sleutel, [...(perSleutel.get(sleutel) ?? []), r]);
    }
  }

  const uit: DubbeleFactuur[] = [];
  const gezien = new Set<string>();
  for (const [sleutel, lijst] of perSleutel) {
    const [werf, nummer] = sleutel.split("||");
    for (const a of lijst.filter((r) => r.gekoppeld)) {
      for (const b of lijst.filter((r) => !r.gekoppeld)) {
        if (Math.abs(a.bedrag - b.bedrag) > marge) continue;
        // Eén paar per regelcombinatie, ook als beide teksten meerdere
        // factuurnummers noemen.
        const paar = `${a.id}|${b.id}`;
        if (gezien.has(paar)) continue;
        gezien.add(paar);
        uit.push({ werf, nummer, bedrag: a.bedrag, gekoppeldeRegel: a, handmatigeRegel: b });
      }
    }
  }
  return uit.sort((x, y) => y.bedrag - x.bedrag);
}
