import { describe, expect, it } from "vitest";

import { filterOptions, type ComboOption } from "@/components/combobox";

/** Zoals de werflijst er bij inkoop uitziet, met de namen van de leverancier erbij. */
const WERVEN: ComboOption[] = [
  { value: "1", label: "Pand gata de gorgos", terms: ["cata Gorg (Pieter Hoogendijk)"], hint: "ook: cata Gorg (Pieter Hoogendijk)" },
  { value: "2", label: "Villa Hans van Dalen", terms: ["CHARLES IV (Pieter Hoogendijk)"], hint: "ook: CHARLES IV (Pieter Hoogendijk)" },
  { value: "3", label: "Finca Lisa", terms: ["cap. Negre (Pieter Hoogendijk)"], hint: "ook: cap. Negre (Pieter Hoogendijk)" },
  { value: "4", label: "Showroom & kantoor Donny", terms: ["HAB ONE (Pieter Hoogendijk)", "Habitat O (Pieter Hoogendijk)"] },
  { value: "5", label: "Silvestre", terms: ["SILVSTER (Pieter Hoogendijk)"] },
  { value: "6", label: "Javea Hotel" },
];

const namen = (q: string) => filterOptions(WERVEN, q).map((o) => o.label);

describe("werf zoeken in de keuzelijst", () => {
  it("vindt de werf op de naam die de leverancier gebruikt", () => {
    // Dit is de fout die dit moet voorkomen: "cata Gorg" van de urenlijst
    // hoort Pand gata de gorgos te geven, niet de showroom.
    expect(namen("cata Gorg")).toEqual(["Pand gata de gorgos"]);
    expect(namen("CHARLES")).toEqual(["Villa Hans van Dalen"]);
    expect(namen("cap. Negre")).toEqual(["Finca Lisa"]);
    expect(namen("HAB ONE")).toEqual(["Showroom & kantoor Donny"]);
    expect(namen("SILVSTER")).toEqual(["Silvestre"]);
  });

  it("werkt ook met een halve naam en andere hoofdletters", () => {
    expect(namen("cata")).toEqual(["Pand gata de gorgos"]);
    expect(namen("charles iv")).toEqual(["Villa Hans van Dalen"]);
    expect(namen("habitat o")).toEqual(["Showroom & kantoor Donny"]);
  });

  it("blijft op de eigen naam werken", () => {
    expect(namen("Silvestre")).toEqual(["Silvestre"]);
    expect(namen("Javea")).toEqual(["Javea Hotel"]);
  });

  it("vindt ook op de naam van de leverancier, handig bij een weekfactuur", () => {
    expect(namen("Pieter")).toHaveLength(5);
  });

  it("geeft alles bij een leeg zoekveld", () => {
    expect(filterOptions(WERVEN, "")).toHaveLength(WERVEN.length);
    expect(filterOptions(WERVEN, "   ")).toHaveLength(WERVEN.length);
  });

  it("geeft niets bij een naam die nergens voorkomt — geen gok", () => {
    expect(namen("Villa Onbekend")).toEqual([]);
  });

  it("houdt de gekozen optie in de lijst", () => {
    const uit = filterOptions(WERVEN, "Finca Lisa", "3");
    expect(uit.map((o) => o.label)).toContain("Finca Lisa");
  });
});
