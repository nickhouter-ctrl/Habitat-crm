import { describe, expect, it } from "vitest";

import { normaliseerLabel, zoekProject, zoektermenPerProject, type Alias } from "@/lib/project-aliases";

const a = (label: string, projectNaam: string, supplier: string | null = null, id = label): Alias => ({
  id,
  projectId: projectNaam,
  projectNaam,
  label,
  supplier,
});

const LIJST: Alias[] = [
  a("cata Gorg", "Pand gata de gorgos", "Pieter Hoogendijk"),
  a("CHARLES IV", "Villa Hans van Dalen", "Pieter Hoogendijk"),
  a("cap. Negre", "Finca Lisa", "Pieter Hoogendijk"),
  a("HAB ONE", "Showroom & kantoor Donny", "Pieter Hoogendijk"),
];

describe("normaliseerLabel", () => {
  it("laat schrijfwijzen samenvallen", () => {
    const k = normaliseerLabel("cata Gorg");
    for (const v of ["Cata gorg", "CATA-GORG", " cata  gorg ", "cata.gorg"]) {
      expect(normaliseerLabel(v), v).toBe(k);
    }
  });

  it("haalt accenten weg", () => {
    expect(normaliseerLabel("cap. Nègre")).toBe(normaliseerLabel("cap negre"));
  });

  it("geeft een lege sleutel bij niets bruikbaars", () => {
    for (const v of ["", "   ", "—", "..."]) expect(normaliseerLabel(v)).toBe("");
  });
});

describe("zoekProject", () => {
  it("vindt de werf achter de kolomnaam van de leverancier", () => {
    expect(zoekProject(LIJST, "cata Gorg", "Pieter Hoogendijk")?.projectNaam).toBe("Pand gata de gorgos");
    expect(zoekProject(LIJST, "CHARLES IV", "Pieter Hoogendijk")?.projectNaam).toBe("Villa Hans van Dalen");
    expect(zoekProject(LIJST, "cap. Negre", "Pieter Hoogendijk")?.projectNaam).toBe("Finca Lisa");
  });

  it("trekt zich niets aan van hoofdletters, punten en spaties", () => {
    expect(zoekProject(LIJST, "  catagorg ", "Pieter Hoogendijk")?.projectNaam).toBe("Pand gata de gorgos");
  });

  it("geeft null bij een onbekende naam — liever niets dan de verkeerde werf", () => {
    expect(zoekProject(LIJST, "Villa Onbekend", "Pieter Hoogendijk")).toBeNull();
    expect(zoekProject(LIJST, "", "Pieter Hoogendijk")).toBeNull();
  });

  it("laat de naam van de leverancier voorgaan op een algemene", () => {
    const met = [...LIJST, a("cata Gorg", "Javea Boxing", null, "algemeen")];
    expect(zoekProject(met, "cata Gorg", "Pieter Hoogendijk")?.projectNaam).toBe("Pand gata de gorgos");
    // Een andere leverancier krijgt de algemene betekenis.
    expect(zoekProject(met, "cata Gorg", "Iemand Anders")?.projectNaam).toBe("Javea Boxing");
    expect(zoekProject(met, "cata Gorg")?.projectNaam).toBe("Javea Boxing");
  });
});

describe("zoektermenPerProject", () => {
  it("zet de leverancier achter de naam, zodat je in de lijst ziet van wie hij komt", () => {
    const m = zoektermenPerProject(LIJST);
    expect(m.get("Pand gata de gorgos")).toEqual(["cata Gorg (Pieter Hoogendijk)"]);
  });

  it("bundelt meerdere namen per werf", () => {
    const m = zoektermenPerProject([...LIJST, a("Habitat O", "Showroom & kantoor Donny", "Pieter Hoogendijk", "x")]);
    expect(m.get("Showroom & kantoor Donny")).toHaveLength(2);
  });
});
