/**
 * Dezelfde factuur twee keer in de projectkosten.
 *
 * De echte gevallen (Silvestre/Finca Lisa, juni–augustus 2026) én de twee
 * patronen die er op lijken maar het niet zijn: de weken van één weekfactuur, en
 * de delen van één factuur die over meerdere werven verdeeld is.
 */
import { describe, expect, it } from "vitest";

import { type KostenRegel, factuurNummers, zoekDubbeleFacturen } from "@/lib/dubbele-facturen";

const regel = (r: Partial<KostenRegel> & { id: string; tekst: string; bedrag: number }): KostenRegel => ({
  soort: "uren",
  werf: "Silvestre",
  datum: "2026-06-15",
  gekoppeld: false,
  ...r,
});

describe("factuurnummers uit vrije tekst", () => {
  it("herkent de vormen die leveranciers gebruiken", () => {
    expect(factuurNummers("Uren via inkoopfactuur Ahmed Bouzekri A0010")).toContain("A0010");
    expect(factuurNummers("Inkoopfactuur Pieter Hoogendijk 260053")).toContain("260053");
    expect(factuurNummers("Uren via inkoopfactuur Wilhelmus 0-04 — Silvestre")).toContain("0-04");
    expect(factuurNummers("Uren via inkoopfactuur Ferhaoui Mohamed 0023/2026")).toContain("0023/2026");
  });

  it("houdt jaartallen en losse getallen erbuiten", () => {
    expect(factuurNummers("uren 22-06 t/m 27-06-2026")).not.toContain("2026");
    expect(factuurNummers("Contant betaald")).toEqual([]);
    expect(factuurNummers(null)).toEqual([]);
  });
});

describe("dubbele facturen vinden", () => {
  it("vindt de handmatige regel naast de regel uit de inkoopfactuur", () => {
    const gevonden = zoekDubbeleFacturen([
      regel({ id: "auto", tekst: "Uren via inkoopfactuur Ahmed Bouzekri A0010", bedrag: 3600, gekoppeld: true }),
      regel({ id: "hand", tekst: "Factuur A0010 — Silvestre", bedrag: 3600 }),
    ]);
    expect(gevonden).toHaveLength(1);
    expect(gevonden[0]).toMatchObject({ werf: "Silvestre", nummer: "A0010", bedrag: 3600 });
    expect(gevonden[0].handmatigeRegel.id).toBe("hand");
    expect(gevonden[0].gekoppeldeRegel.id).toBe("auto");
  });

  it("vindt ook de materiaalfactuur die als uren én als kostenregel staat", () => {
    const gevonden = zoekDubbeleFacturen([
      regel({ id: "uren", tekst: "Uren via inkoopfactuur Ahmed Bouzekri A0015", bedrag: 825.58, gekoppeld: true }),
      regel({ id: "kost", soort: "kosten", tekst: "Materiaal Silvestre (factuur A0015)", bedrag: 825.58 }),
    ]);
    expect(gevonden).toHaveLength(1);
    expect(gevonden[0].handmatigeRegel.soort).toBe("kosten");
  });

  it("meldt de weken van één weekfactuur NIET", () => {
    // A157 van CSABAHOME: vijf weken, drie ervan met hetzelfde weekbedrag.
    const weken = [2, 9, 16].map((d) =>
      regel({ id: `w${d}`, tekst: `Factuur A157 — week ${d} februari`, bedrag: 1279.92, datum: `2026-02-${d}` }),
    );
    expect(zoekDubbeleFacturen(weken)).toEqual([]);
  });

  it("meldt de delen van één verdeelde factuur NIET", () => {
    // Wilhelmus 0-07: vier keer 8,5 uur op dezelfde werf, samen het factuurbedrag.
    const delen = [1, 2, 3, 4].map((i) =>
      regel({ id: `d${i}`, tekst: "Uren via inkoopfactuur Wilhelmus Mark Strijks 0-07", bedrag: 229.5, gekoppeld: true }),
    );
    expect(zoekDubbeleFacturen(delen)).toEqual([]);
  });

  it("kijkt per werf: dezelfde factuur op twee werven is een verdeling", () => {
    const gevonden = zoekDubbeleFacturen([
      regel({ id: "a", werf: "Silvestre", tekst: "Uren via inkoopfactuur A0009", bedrag: 1152, gekoppeld: true }),
      regel({ id: "b", werf: "Finca Lisa", tekst: "Factuur A0009 — Cap Negre", bedrag: 1152 }),
    ]);
    expect(gevonden).toEqual([]);
  });

  it("laat een afwijkend bedrag met rust", () => {
    const gevonden = zoekDubbeleFacturen([
      regel({ id: "auto", tekst: "Uren via inkoopfactuur A0011", bedrag: 1344, gekoppeld: true }),
      regel({ id: "deel", tekst: "deel betaling op factuur Ahmed A0011", bedrag: 672 }),
    ]);
    expect(gevonden).toEqual([]);
  });

  it("telt één paar, ook als de tekst meerdere factuurnummers noemt", () => {
    const gevonden = zoekDubbeleFacturen([
      regel({ id: "auto", tekst: "Uren via inkoopfactuur A0010 en A0013", bedrag: 3600, gekoppeld: true }),
      regel({ id: "hand", tekst: "Factuur A0010 / A0013 — Silvestre", bedrag: 3600 }),
    ]);
    expect(gevonden).toHaveLength(1);
  });
});
