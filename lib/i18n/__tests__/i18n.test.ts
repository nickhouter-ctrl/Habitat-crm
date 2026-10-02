import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { dateLocale, isLocale, LOCALES, maakT, vertaal } from "@/lib/i18n";

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
    // Reviewed shared terminology: product/brand names, codes, units and
    // international words keep their spelling. Each target also has source
    // labels already written in that language (e.g. Spanish “Fase”).
    const gelijk = new Set([
  "· IP",
  "CC:",
  "kB ·",
  "Cc:",
  "impr.",
  "incl.",
  "Factor",
  "(id",
  ") — commit",
  "GS1 Excel ▾",
  "/m²",
  "proforma",
  "auto",
  "cata Gorg",
  "Pieter Hoogendijk",
  "Google Analytics (GA4)",
  "Google Business Profile",
  "Google Search Console",
  "1200x600",
  "3D Big Panel Series",
  "Travertine",
  "Pure White",
  "/ min",
  "?key=<HOLDED_WEBHOOK_SECRET>",
  ".env.local",
  "Windows:",
  " (USD)",
  "→ EUR",
  "Expat NL",
  "Expat EN",
  "Expat DE",
  "https://…",
  "· page-id",
  "KingKonree International (H.K) Limited",
  "33#kkr20251126xm",
  "1200×600",
  "MS-200-1",
  "5-GM-001",
  "m² ·",
  "· v",
  " (id {v0})",
  " · {v0} kB",
  "BRA",
  "BRAUER",
  "CTR",
  "Coffee",
  "Google Analytics (GA4) · {v0}",
  "Google Search Console · {v0}",
  "HAB-001",
  "Habitat One",
  "Leads",
  "Marketing",
  "SEO",
  "SKU",
  "Villa",
  "Xàbia — Montgó",
  "es",
  "nl",
  "{v0} d",
  "{v0} excl.",
  "{v0} excl. · ",
  "{v0}d",
  "{v0} kB",
  "{v0} × {v1}",
  "{v0} m²",
  "Broadcast",
  "30 min",
  "Showroom Jávea"
]);
    const dezelfdeTaal = { es: new Set([
  "Fase",
  "Serie",
  "Foto",
  "Fases",
  "+ Fase",
  "fase",
  "provisión de fondos",
  "fases",
  "(inversión del sujeto pasivo)",
  "Foto (URL)",
  "Algo salió mal. Inténtalo de nuevo o escríbenos.",
  "Elige un momento",
  "Rol",
  "de",
  "foto",
  "honorarios de arquitecto y dirección técnica, facturados a través nuestro",
  "imprevistos"
]), en: new Set(["document",
  "Type",
  "Open in inbox →",
  "Open",
  "Bounces:",
  "Details",
  "prospects",
  "Download",
  "Basis",
  "orders ·",
  "Open project →",
  "Review",
  "Document",
  "contact",
  "product",
  "Project",
  "Deal",
  "open",
  "Mailbox",
  "Overhead ratio",
  "Per-product impact",
  "project",
  "prospects.",
  "Labels",
  "prospect",
  "Prospects (",
  "→ contact",
  "in",
  "Status (Meta)",
  "Sets",
  "Ads",
  "Logo",
  "Code",
  "Showroom −",
  "Download PDF",
  "Download brochure",
  "Barcode",
  "per set",
  "← Project",
  "Browsers",
  "Label",
  "Sample",
  "sample",
  "samples",
  "Open product →",
  "account",
  "accounts",
  "Event",
  "mail ·",
  "+ Account",
  "Postcode",
  "Website:",
  "% handling",
  "Sync website",
  "Sync Instagram",
  "Segment",
  "Tag",
  "Live preview",
  "per",
  "Sync Holded",
  "Orders",
  "Download .xlsx",
  "Account",
  " · per {v0}",
  " · start {v0}",
  "Analytics",
  "Architect",
  "Bounce",
  "Business",
  "Carport",
  "Barcode (EAN-13)",
  "Creative: {v0}",
  "Creatives",
  "Dashboard",
  "Dealers",
  "Lead",
  "Live",
  "Mail — detail",
  "Microcement",
  "On hold",
  "Partner",
  "Pick a time",
  "SKU / code",
  "Samples",
  "Shipments",
  "Something went wrong. Please try again or email us.",
  "Toilet",
  "Video: {v0}",
  "Week",
  "architect's fee and technical supervision, invoiced through us",
  "contingency",
  "dealer",
  "{v0} per {v1} (€)",
  " in {v0}",
  "Browser",
  "Barcode {waarde}",
  "Contact",
  "Status",
  "Website",
  "{n} project",
  "Prospects",
  "Filter"
]) };
    for (const [naam, dict] of [["en", en], ["es", es]] as const) {
      const verdacht = Object.entries(dict).filter(([k, v]) => k === v && !gelijk.has(k) && !dezelfdeTaal[naam].has(k));
      expect(verdacht, `${naam}`).toEqual([]);
    }
  });
});


describe("CRM locale coverage", () => {
  it("formats dates with the selected locale", () => {
    expect(LOCALES.map(dateLocale)).toEqual(["nl-NL", "en-GB", "es-ES"]);
  });
  it("preserves all named placeholders in both dictionaries", () => {
    const vars = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const dict of [en, es]) {
      const mismatches = Object.entries(dict).filter(([key,value]) => JSON.stringify(vars(key)) !== JSON.stringify(vars(value)));
      expect(mismatches).toEqual([]);
    }
  });
  it("translates shared controls and complete plural phrases", () => {
    const t = maakT("es");
    expect(t("Nog niet gepland")).toBe("Sin programar");
    expect(t("Uit")).toBe("Desactivado");
    expect(t("{n} producten toegevoegd", { n: 2 })).toBe("2 productos añadidos");
    expect(t("Sorteren op {kolom}", { kolom: "empresa" })).toBe("Ordenar por empresa");
  });
});
