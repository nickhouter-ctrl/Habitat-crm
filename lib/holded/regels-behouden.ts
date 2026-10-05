import type { DocumentLineItem } from "@/lib/db/schema";

/**
 * Wat alleen het CRM van een factuurregel weet. Holded kent deze velden niet,
 * dus bij het ophalen uit Holded komen ze leeg terug.
 */
const ALLEEN_LOKAAL = [
  "category",
  "productId",
  "costEur",
  "pricingBasis",
  "supplierPriceEur",
  "marginPct",
  "phase",
  "advanceRef",
  "unit",
] as const;

/** Dezelfde regel = dezelfde naam en dezelfde stuksprijs (op de cent). */
const sleutel = (r: DocumentLineItem) =>
  `${(r.name ?? "").trim().toLowerCase()}|${Math.round(Number(r.price ?? 0) * 100)}`;

/**
 * Bij het opnieuw ophalen van een factuur uit Holded: de regels van Holded
 * nemen, maar de CRM-kennis per regel bewaren.
 *
 * Zonder dit verdween bij elke sync de koppeling naar het product en de
 * kostprijs. Op een project viel daarmee "producten uit eigen voorraad" stil
 * terug naar nul, terwijl de factuur zelf niet veranderd was.
 *
 * Een regel die in Holded is aangepast (andere naam of prijs) krijgt bewust
 * níets mee: dan is het een andere regel, en een oude kostprijs zou liegen.
 */
export function behoudLokaleRegelinfo(uitHolded: DocumentLineItem[], lokaal: DocumentLineItem[]): DocumentLineItem[] {
  const gebruikt = new Set<number>();
  return uitHolded.map((regel, i) => {
    let j = -1;
    // Gewone situatie: dezelfde regel op dezelfde plek.
    if (lokaal[i] && sleutel(lokaal[i]) === sleutel(regel)) j = i;
    // Regels verschoven in Holded: zoek dezelfde regel elders.
    if (j < 0 || gebruikt.has(j)) j = lokaal.findIndex((l, k) => !gebruikt.has(k) && sleutel(l) === sleutel(regel));
    if (j < 0) return regel;
    gebruikt.add(j);
    const extra: Partial<DocumentLineItem> = {};
    for (const veld of ALLEEN_LOKAAL) {
      const waarde = lokaal[j][veld];
      if (waarde !== undefined && waarde !== null) (extra as Record<string, unknown>)[veld] = waarde;
    }
    return { ...regel, ...extra };
  });
}
