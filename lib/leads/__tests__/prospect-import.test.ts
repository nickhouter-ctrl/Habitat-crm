import { describe, expect, it } from "vitest";

import { prospectCompanyKey } from "@/lib/leads/normalize";
import { aantalOvergeslagen, planProspectImport, type BekendeGegevens } from "@/lib/leads/prospect-import";
import type { ProspectRowIn } from "@/lib/leads/prospect-columns";

const geenKennis = (): BekendeGegevens => ({
  prospectEmails: new Set(),
  contactEmails: new Set(),
  suppressed: new Set(),
  prospectCompanyKeys: new Set(),
});

const r = (companyName: string, email?: string, city?: string): ProspectRowIn => ({ companyName, email, city });

describe("planProspectImport", () => {
  it("laat een schone lijst in zijn geheel door", () => {
    const plan = planProspectImport([r("A SL", "a@x.es"), r("B SL", "b@x.es")], geenKennis());
    expect(plan.nieuw).toHaveLength(2);
    expect(aantalOvergeslagen(plan)).toBe(0);
  });

  it("noemt elk van de zes redenen bij naam", () => {
    const bekend = geenKennis();
    bekend.prospectEmails.add("bestaat@x.es");
    bekend.contactEmails.add("klant@x.es");
    bekend.suppressed.add("weg@x.es");

    const plan = planProspectImport(
      [
        r("A SL", "a@x.es"),
        r("A SL", "A@X.ES"), // zelfde adres, andere hoofdletters
        r("", "geenNaam@x.es"),
        r("C SL", "bestaat@x.es"),
        r("D SL", "klant@x.es"),
        r("E SL", "weg@x.es"),
        r("F SL", "noreply@x.es"),
        r("G SL", "kapot@"),
      ],
      bekend,
    );

    expect(plan.overgeslagen).toEqual({
      "zonder-naam": 1,
      "dubbel-in-bestand": 1,
      "al-prospect": 1,
      "al-contact": 1,
      afgemeld: 1,
      "ongeldig-adres": 1,
      "rol-adres": 1,
    });
    // G SL komt er wél in, maar zonder adres.
    expect(plan.nieuw.map((n) => n.companyName)).toEqual(["A SL", "G SL"]);
    expect(plan.zonderEmail).toBe(1);
  });

  it("geeft per reden voorbeelden met rijnummer, maar niet eindeloos", () => {
    const rijen = Array.from({ length: 30 }, () => r("A SL", "zelfde@x.es"));
    const plan = planProspectImport(rijen, geenKennis());
    const dubbel = plan.voorbeelden.filter((v) => v.reden === "dubbel-in-bestand");
    expect(plan.overgeslagen["dubbel-in-bestand"]).toBe(29);
    expect(dubbel).toHaveLength(10);
    expect(dubbel[0].rij).toBe(2);
  });

  it("dedupeert bedrijven zonder adres op naam en plaats", () => {
    const plan = planProspectImport(
      [
        r("Reformas García S.L.", undefined, "Dénia"),
        r("reformas garcia sl", undefined, "denia"),
        r("Reformas García", undefined, "Alicante"),
      ],
      geenKennis(),
    );
    expect(plan.nieuw).toHaveLength(2);
    expect(plan.overgeslagen["dubbel-in-bestand"]).toBe(1);
  });

  it("kent een bedrijf zonder adres dat al in de lijst staat", () => {
    const bekend = geenKennis();
    bekend.prospectCompanyKeys.add(prospectCompanyKey("Reformas García S.L.", "Dénia"));
    const plan = planProspectImport([r("REFORMAS GARCIA SL", undefined, "denia")], bekend);
    expect(plan.nieuw).toHaveLength(0);
    expect(plan.overgeslagen["al-prospect"]).toBe(1);
  });

  it("levert bij een tweede keer dezelfde invoer niets nieuws op", () => {
    const rijen = [r("A SL", "a@x.es"), r("B SL", "b@x.es")];
    const eerste = planProspectImport(rijen, geenKennis());
    expect(eerste.nieuw).toHaveLength(2);

    const bekend = geenKennis();
    for (const n of eerste.nieuw) if (n.email) bekend.prospectEmails.add(n.email);
    const tweede = planProspectImport(rijen, bekend);
    expect(tweede.nieuw).toHaveLength(0);
    expect(tweede.overgeslagen["al-prospect"]).toBe(2);
  });

  it("normaliseert het adres dat straks wordt weggeschreven", () => {
    const plan = planProspectImport([{ companyName: "A SL", email: " Ana <ANA@Empresa.ES> " }], geenKennis());
    expect(plan.nieuw[0].email).toBe("ana@empresa.es");
  });

  it("houdt labels bij de rij", () => {
    const plan = planProspectImport([{ companyName: "A SL", email: "a@x.es", tags: ["Nº empleados: 10-50"] }], geenKennis());
    expect(plan.nieuw[0].tags).toEqual(["Nº empleados: 10-50"]);
  });
});
