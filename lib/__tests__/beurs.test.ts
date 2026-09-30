/**
 * Wat er van een beursbezoeker in het CRM terechtkomt.
 *
 * De stand werkte met visitekaartjes in een map en een handgeschreven notitie;
 * bij het opvolgen bleek het e-mailadres soms niet te lezen. Daarom ter plekke
 * intypen — en dan moet wel kloppen wát er wordt vastgelegd: de rol als tag
 * (architecten krijgen straks een andere opvolging dan wederverkopers) en een
 * bevestigingsmail in de taal van de bezoeker.
 */
import { describe, expect, it } from "vitest";

import { BEURS, ROLLEN, beursMail, contactNotitie, contactSoort, rolLabel, rolOmschrijving } from "@/lib/beurs";

describe("rollen", () => {
  it("heeft de groepen die op de stand langskomen", () => {
    const keys = ROLLEN.map((r) => r.key);
    expect(keys).toContain("architect");
    expect(keys).toContain("ontwerper");
    expect(keys).toContain("wederverkoper");
    expect(keys).toContain("particulier");
  });

  it("vertaalt de rol voor het scherm", () => {
    expect(rolLabel("architect")).toBe("Architect");
    expect(rolLabel("wederverkoper", "es")).toBe("Quiere vender nuestros productos");
    // Onbekende sleutel valt terug op zichzelf in plaats van leeg te zijn.
    expect(rolLabel("bestaat-niet")).toBe("bestaat-niet");
  });
});

describe("wat 'anders' dan wel is", () => {
  it("zet de toelichting achter de rol", () => {
    expect(rolOmschrijving("anders", "fotograaf")).toBe("Anders (fotograaf)");
    expect(rolOmschrijving("anders", "   ")).toBe("Anders");
    expect(rolOmschrijving("architect")).toBe("Architect");
  });

  it("zet hem ook in de notitie op het contact", () => {
    const n = contactNotitie({ rol: "anders", rolAnders: "pers" });
    expect(n).toContain("Anders (pers)");
  });
});

describe("soort contact", () => {
  it("maakt van wie ons wil verkopen een wederverkoper", () => {
    expect(contactSoort("wederverkoper")).toBe("reseller");
  });

  it("houdt de rest een lead — ook een architect, die koopt zelf niet", () => {
    expect(contactSoort("architect")).toBe("lead");
    expect(contactSoort("particulier")).toBe("lead");
  });
});

describe("notitie op het contact", () => {
  it("zegt wie het is, waar we elkaar spraken en wat hij wil", () => {
    const n = contactNotitie({
      rol: "architect",
      bedrijf: "Estudio Bonet",
      wens: "Zoekt SPC-vloeren voor een villa in Moraira",
    });
    expect(n).toContain("Architect");
    expect(n).toContain(BEURS.naam);
    expect(n).toContain(`stand ${BEURS.stand}`);
    expect(n).toContain("Estudio Bonet");
    expect(n).toContain("Moraira");
  });

  it("blijft leesbaar zonder bedrijf of wens", () => {
    const n = contactNotitie({ rol: "particulier" });
    expect(n).toContain("Particulier");
    expect(n).not.toContain("Bedrijf:");
    expect(n.trim().split("\n")).toHaveLength(1);
  });
});

describe("bevestigingsmail", () => {
  it("spreekt de bezoeker aan in zijn eigen taal", () => {
    expect(beursMail({ naam: "Carlos Bonet", taal: "es" }).subject).toContain("conocerte");
    expect(beursMail({ naam: "Carlos Bonet", taal: "en" }).subject).toContain("meet you");
    expect(beursMail({ naam: "Carlos Bonet", taal: "nl" }).subject).toContain("ontmoeten");
  });

  it("gebruikt de voornaam en noemt de stand", () => {
    const m = beursMail({ naam: "Carlos Bonet", taal: "es" });
    expect(m.alineas[0]).toContain("Carlos");
    expect(m.alineas[0]).not.toContain("Bonet");
    expect(m.alineas.join(" ")).toContain(BEURS.stand);
  });

  it("legt zakelijke prijzen en de mogelijkheid tot winkelverkoop uit", () => {
    const m = beursMail({ naam: "Ana", taal: "nl", rol: "wederverkoper" });
    expect(m.alineas.join(" ")).toContain("na de beurs");
    expect(m.alineas.join(" ")).toContain("20% korting op de retailprijs");
    expect(m.alineas.join(" ")).toContain("betere inkoopprijzen");
  });
});
