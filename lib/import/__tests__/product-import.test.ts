import { describe, expect, it } from "vitest";

import { planImport, productSku, type BestaandeVariant, type ImportRow } from "@/lib/import/product-import";

const OPTIES = { skuPrefix: "BRA", dealerDiscountPct: 40 };

function rij(over: Partial<ImportRow> & { code: string }): ImportRow {
  return {
    productName: "Lage opbouw wastafelmengkraan",
    series: "Edition",
    collection: "Badkamer",
    category: "Wastafelkranen",
    unit: "stuk",
    options: { Kleur: "Chroom" },
    listPriceEur: 144.9,
    ...over,
  };
}

const leeg = new Map<string, BestaandeVariant>();

describe("productSku", () => {
  it("is stabiel, zodat een tweede import geen tweede product maakt", () => {
    const a = productSku("BRA", "Edition", "Lage opbouw wastafelmengkraan");
    expect(productSku("BRA", "Edition", "Lage opbouw wastafelmengkraan")).toBe(a);
    expect(a.startsWith("BRA-EDITION-LAGE-OPBOUW")).toBe(true);
  });

  it("onderscheidt series van elkaar", () => {
    expect(productSku("BRA", "Edition", "X")).not.toBe(productSku("BRA", "Carving", "X"));
  });
});

describe("planImport", () => {
  it("maakt van zes kleuren één product met zes uitvoeringen", () => {
    const kleuren = ["Chroom", "Mat zwart", "Koper", "Goud", "Gunmetal", "RVS"];
    const plan = planImport(
      kleuren.map((k, i) => rij({ code: `5-X${i}-001`, options: { Kleur: k } })),
      leeg,
      OPTIES,
    );
    expect(plan.producten).toHaveLength(1);
    expect(plan.producten[0].varianten).toHaveLength(6);
    expect(plan.producten[0].optionAxes.map((a) => a.label)).toEqual(["Kleur"]);
    expect(plan.nieuweUitvoeringen).toBe(6);
  });

  it("houdt series uit elkaar als losse producten", () => {
    const plan = planImport(
      [rij({ code: "5-CE-001" }), rij({ code: "5-CE-101", series: "Carving" })],
      leeg,
      OPTIES,
    );
    expect(plan.producten.map((p) => p.name).sort()).toEqual([
      "Carving Lage opbouw wastafelmengkraan",
      "Edition Lage opbouw wastafelmengkraan",
    ]);
  });

  it("maakt alleen een keuze van wat écht varieert", () => {
    const plan = planImport(
      [
        rij({ code: "5-CE-001", options: { Kleur: "Chroom", Glijstang: "Ja" } }),
        rij({ code: "5-S-001", options: { Kleur: "Mat zwart", Glijstang: "Ja" } }),
      ],
      leeg,
      OPTIES,
    );
    // Glijstang is bij beide "Ja" → geen keuzelijst met één optie.
    expect(plan.producten[0].optionAxes.map((a) => a.label)).toEqual(["Kleur"]);
  });

  it("stelt het label samen uit de keuzes", () => {
    const plan = planImport(
      [
        rij({ code: "5-CE-001", options: { Kleur: "Chroom", Hoofddouche: "20 cm" } }),
        rij({ code: "5-CE-002", options: { Kleur: "Chroom", Hoofddouche: "30 cm" } }),
      ],
      leeg,
      OPTIES,
    );
    expect(plan.producten[0].varianten.map((v) => v.label)).toEqual(["20 cm", "30 cm"]);
  });

  it("rekent de inkoopprijs uit de dealerkorting", () => {
    const plan = planImport([rij({ code: "5-CE-001", listPriceEur: 100 })], leeg, OPTIES);
    expect(plan.producten[0].varianten[0].purchaseCostEur).toBe(60);
  });

  it("laat een ingevulde inkoopprijs voorgaan op de berekening", () => {
    const plan = planImport([rij({ code: "5-CE-001", purchaseEur: 55 })], leeg, OPTIES);
    expect(plan.producten[0].varianten[0].purchaseCostEur).toBe(55);
  });

  it("verandert niets als hetzelfde bestand nog een keer wordt ingeladen", () => {
    const rijen = [rij({ code: "5-CE-001" })];
    const eerste = planImport(rijen, leeg, OPTIES);
    const v = eerste.producten[0].varianten[0];
    const bestaand = new Map<string, BestaandeVariant>([
      [
        v.code,
        {
          code: v.code,
          productId: "p1",
          priceEur: v.priceEur,
          purchaseCostEur: v.purchaseCostEur,
          label: v.label,
          imageUrl: null,
        },
      ],
    ]);
    const tweede = planImport(rijen, bestaand, OPTIES);
    expect(tweede.nieuweUitvoeringen).toBe(0);
    expect(tweede.bijgewerkteUitvoeringen).toBe(0);
    expect(tweede.ongewijzigdeUitvoeringen).toBe(1);
    expect(tweede.wijzigingen).toEqual([]);
  });

  it("meldt een gewijzigde prijs met oud en nieuw", () => {
    const bestaand = new Map<string, BestaandeVariant>([
      ["5-CE-001", { code: "5-CE-001", productId: "p1", priceEur: 130, purchaseCostEur: 78, label: "", imageUrl: null }],
    ]);
    const plan = planImport([rij({ code: "5-CE-001", listPriceEur: 144.9 })], bestaand, OPTIES);
    expect(plan.bijgewerkteUitvoeringen).toBe(1);
    expect(plan.wijzigingen).toContainEqual({ code: "5-CE-001", veld: "verkoopprijs", oud: "130", nieuw: "144.9" });
  });

  it("laat een bestaande prijs staan als de cel leeg is", () => {
    const bestaand = new Map<string, BestaandeVariant>([
      ["5-CE-001", { code: "5-CE-001", productId: "p1", priceEur: 130, purchaseCostEur: 78, label: "", imageUrl: null }],
    ]);
    const plan = planImport([rij({ code: "5-CE-001", listPriceEur: null })], bestaand, OPTIES);
    expect(plan.wijzigingen.filter((w) => w.veld === "verkoopprijs")).toEqual([]);
  });

  it("weigert dezelfde code met verschillende gegevens", () => {
    const plan = planImport(
      [rij({ code: "5-CE-001", listPriceEur: 100 }), rij({ code: "5-CE-001", listPriceEur: 200 })],
      leeg,
      OPTIES,
    );
    expect(plan.conflicten).toHaveLength(1);
    expect(plan.conflicten[0].code).toBe("5-CE-001");
    expect(plan.producten).toHaveLength(0);
  });

  it("accepteert een letterlijke dubbele regel, maar meldt het", () => {
    const plan = planImport([rij({ code: "5-CE-001" }), rij({ code: "5-CE-001" })], leeg, OPTIES);
    expect(plan.conflicten).toHaveLength(0);
    expect(plan.producten[0].varianten).toHaveLength(1);
    expect(plan.waarschuwingen.join(" ")).toContain("5-CE-001");
  });

  it("normaliseert de code, zodat spaties en kleine letters niets dubbel maken", () => {
    const plan = planImport([rij({ code: " 5-ce-001 " }), rij({ code: "5-CE-001" })], leeg, OPTIES);
    expect(plan.producten[0].varianten).toHaveLength(1);
    expect(plan.producten[0].varianten[0].code).toBe("5-CE-001");
  });

  it("meldt een regel zonder artikelcode in plaats van hem stil te laten vallen", () => {
    const plan = planImport([rij({ code: "" })], leeg, OPTIES);
    expect(plan.conflicten[0].reden).toContain("zonder artikelcode");
  });
});
