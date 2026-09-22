import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { isLocale, LOCALES, maakT, vertaal } from "@/lib/i18n";

describe("vertalen", () => {
  it("laat Nederlands ongemoeid", () => {
    expect(vertaal("nl", "Mail-inbox")).toBe("Mail-inbox");
  });

  it("gebruikt het woordenboek van de taal", () => {
    expect(vertaal("en", "Mail-inbox")).toBe("Mail inbox");
    expect(vertaal("es", "Mail-inbox")).toBe("Bandeja de entrada");
  });

  it("valt terug op het Nederlands bij een tekst die nog niet vertaald is", () => {
    // Beter een Nederlandse zin dan een sleutelnaam op het scherm.
    expect(vertaal("es", "Deze zin bestaat nog niet in het woordenboek")).toBe(
      "Deze zin bestaat nog niet in het woordenboek",
    );
  });

  it("laat de verduidelijking voor de vertaler weg op het scherm", () => {
    expect(vertaal("en", "Open|factuur")).toBe("Open");
    expect(vertaal("nl", "Open|factuur")).toBe("Open");
  });

  it("laat haakjes in een sleutel met een variabele met rust", () => {
    // Regressie: met haakjes als context-markering verdween hier de variabele.
    expect(vertaal("nl", "Alle functies ({n})", { n: 3 })).toBe("Alle functies (3)");
  });

  it("vult variabelen in, ook in de vertaling", () => {
    expect(vertaal("nl", "Alle functies ({n})", { n: 12 })).toBe("Alle functies (12)");
    expect(vertaal("en", "Alle functies ({n})", { n: 12 })).toBe("All features (12)");
    expect(vertaal("es", "van {wie}", { wie: "Nick" })).toBe("de Nick");
  });

  it("laat een onbekende variabele staan in plaats van hem te wissen", () => {
    expect(vertaal("nl", "Alle functies ({n})", { anders: 1 })).toBe("Alle functies ({n})");
  });

  it("herkent geldige taalcodes", () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
    for (const l of ["de", "fr", "", null, 3]) expect(isLocale(l)).toBe(false);
  });

  it("geeft met maakT dezelfde uitkomst", () => {
    expect(maakT("es")("Instellingen")).toBe("Ajustes");
  });
});

describe("woordenboeken", () => {
  it("hebben voor elke sleutel een echte vertaling", () => {
    for (const [naam, dict] of [["en", en], ["es", es]] as const) {
      const leeg = Object.entries(dict).filter(([, v]) => !v.trim());
      expect(leeg, `${naam} heeft lege waarden`).toEqual([]);
    }
  });

  it("dekken in beide talen dezelfde sleutels", () => {
    // Anders staat een scherm half in het Engels en half in het Nederlands.
    const alleenEn = Object.keys(en).filter((k) => !(k in es));
    const alleenEs = Object.keys(es).filter((k) => !(k in en));
    expect({ alleenEn, alleenEs }).toEqual({ alleenEn: [], alleenEs: [] });
  });

  it("vertalen geen sleutel naar zichzelf zonder reden", () => {
    // Een paar woorden zijn in alle talen gelijk; die staan hier bij naam.
    const gelijk = new Set([
      "Leads", "Marketing", "SEO", "Analytics", "Dashboard", "Samples", "Shipments", "Creatives", "Account", "Rol",
      "{n} project", // in het Engels toevallig gelijk
      // Productnamen blijven in elke taal hetzelfde: Teresa en Nick zoeken
      // hetzelfde menu-item, en een vertaald kopje maakt overleg lastiger.
      "Broadcast",
      "Prospects",
      // Tijd- en plaatsnamen zijn in alle drie de talen gelijk.
      "Filter",
      "30 min",
      "Showroom Jávea",
    ]);
    for (const [naam, dict] of [["en", en], ["es", es]] as const) {
      const verdacht = Object.entries(dict).filter(([k, v]) => k === v && !gelijk.has(k));
      expect(verdacht, `${naam}`).toEqual([]);
    }
  });
});
