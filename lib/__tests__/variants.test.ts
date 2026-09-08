import { describe, expect, it } from "vitest";

import { brauerAxes, brauerModelKey, brauerOptions, parseBrauerCode } from "@/lib/brauer";
import {
  axisCombinations,
  buildVariantLabel,
  buildVariantSku,
  inkoopUitKorting,
  normalizeCode,
  optionProblems,
  toAdditionalSizes,
} from "@/lib/variants";
import type { ProductOptionAxis } from "@/lib/db/schema";

const KLEUR: ProductOptionAxis = {
  key: "kleur",
  label: "Kleur",
  values: [
    { value: "CE", label: "Chroom" },
    { value: "GM", label: "Gunmetal" },
  ],
};
const MODEL: ProductOptionAxis = {
  key: "model",
  label: "Model",
  values: [
    { value: "A", label: "Model A" },
    { value: "HD5", label: "Model B" },
  ],
};

describe("normalizeCode", () => {
  it("maakt van dezelfde code uit catalogus, sheet en feed één sleutel", () => {
    expect(normalizeCode(" 5 - ce - 001 ")).toBe("5-CE-001");
    expect(normalizeCode("5-CE-001")).toBe("5-CE-001");
    expect(normalizeCode("5--CE--001")).toBe("5-CE-001");
  });

  it("laat leeg leeg", () => {
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("buildVariantSku", () => {
  it("zet het merkvoorvoegsel ervoor, zodat Brauers DR- niet botst met onze deuren", () => {
    expect(buildVariantSku("BRA", "DR-012")).toBe("BRA-DR-012");
  });

  it("plakt het voorvoegsel er niet twee keer voor", () => {
    expect(buildVariantSku("BRA", "BRA-5-CE-001")).toBe("BRA-5-CE-001");
  });

  it("zonder voorvoegsel blijft de code zoals hij is", () => {
    expect(buildVariantSku(null, "5-CE-001")).toBe("5-CE-001");
  });
});

describe("buildVariantLabel", () => {
  it("volgt de volgorde van de assen, niet die van het object", () => {
    expect(buildVariantLabel([KLEUR, MODEL], { model: "HD5", kleur: "GM" })).toBe(
      "Gunmetal · Model B",
    );
  });

  it("slaat assen zonder keuze over", () => {
    expect(buildVariantLabel([KLEUR, MODEL], { kleur: "CE" })).toBe("Chroom");
  });

  it("toont een onbekende waarde zoals hij is in plaats van hem te verbergen", () => {
    expect(buildVariantLabel([KLEUR], { kleur: "XX" })).toBe("XX");
  });
});

describe("optionProblems", () => {
  it("meldt een onbekende as en een onbekende waarde", () => {
    expect(optionProblems([KLEUR], { kleur: "CE" })).toEqual([]);
    expect(optionProblems([KLEUR], { maat: "90" })).toEqual(['onbekende optie "maat"']);
    expect(optionProblems([KLEUR], { kleur: "ZZ" })).toEqual(['"ZZ" is geen waarde van Kleur']);
  });
});

describe("axisCombinations", () => {
  it("geeft het kruisproduct van de assen", () => {
    const combos = axisCombinations([KLEUR, MODEL]);
    expect(combos).toHaveLength(4);
    expect(combos).toContainEqual({ kleur: "GM", model: "HD5" });
  });

  it("een as zonder waarden telt niet mee", () => {
    expect(axisCombinations([KLEUR, { key: "x", label: "X", values: [] }])).toHaveLength(2);
  });
});

describe("toAdditionalSizes", () => {
  const basis = [
    { code: "5-CE-001", sku: "BRA-5-CE-001", label: "Chroom", priceEur: "144.9000", purchaseCostEur: "84.04", sortOrder: 0 },
    { code: "5-GM-001", sku: "BRA-5-GM-001", label: "Gunmetal", priceEur: "218.9000", purchaseCostEur: "126.96", sortOrder: 1 },
  ];

  it("behoudt de bestaande sleutels met hun betekenis", () => {
    const [eerste] = toAdditionalSizes(basis);
    expect(eerste.sku).toBe("BRA-5-CE-001");
    expect(eerste.label).toBe("Chroom");
    expect(eerste.priceEur).toBe(144.9);
    expect(eerste.purchaseEur).toBe(84.04);
    expect(eerste.inStock).toBe(false);
    expect(eerste.code).toBe("5-CE-001");
  });

  it("laat inactieve uitvoeringen weg", () => {
    expect(toAdditionalSizes([...basis, { code: "5-S-001", label: "Mat zwart", isActive: false }])).toHaveLength(2);
  });

  it("sorteert op sortOrder", () => {
    const omgekeerd = toAdditionalSizes([basis[1], basis[0]]);
    expect(omgekeerd.map((r) => r.label)).toEqual(["Chroom", "Gunmetal"]);
  });

  it("maakt dubbele labels uniek — /bestellen zoekt een uitvoering op zijn label", () => {
    const rijen = toAdditionalSizes([
      { code: "5-CE-001", label: "Chroom" },
      { code: "5-CE-002", label: "Chroom" },
    ]);
    expect(rijen[0].label).toBe("Chroom · 5-CE-001");
    expect(rijen[1].label).toBe("Chroom · 5-CE-002");
    expect(new Set(rijen.map((r) => r.label)).size).toBe(2);
  });

  it("valt terug op de code als er geen eigen sku is", () => {
    expect(toAdditionalSizes([{ code: "5-CE-001", label: "Chroom" }])[0].sku).toBe("5-CE-001");
  });

  it("inStock volgt de voorraad", () => {
    expect(toAdditionalSizes([{ code: "A-1", label: "x", stockQty: "3" }])[0].inStock).toBe(true);
    expect(toAdditionalSizes([{ code: "A-1", label: "x", stockQty: "0" }])[0].inStock).toBe(false);
  });
});

describe("inkoopUitKorting", () => {
  it("rekent de dealerkorting van de adviesprijs af, op hele centen", () => {
    expect(inkoopUitKorting(218.9, 42)).toBe(126.96);
    expect(inkoopUitKorting("144,90".replace(",", "."), 42)).toBe(84.04);
  });

  it("zonder korting blijft de adviesprijs staan", () => {
    expect(inkoopUitKorting(218.9, null)).toBe(218.9);
  });

  it("zonder adviesprijs komt er niets uit", () => {
    expect(inkoopUitKorting(null, 42)).toBeNull();
  });
});

describe("Brauer-codes", () => {
  it("haalt kleur, nummer en hendel uit een kranencode", () => {
    expect(parseBrauerCode("5-CE-001")).toEqual({ prefix: "5", kleur: "CE", nummer: "001", hendel: "A" });
    expect(parseBrauerCode("5-GM-001-HD5")).toEqual({ prefix: "5", kleur: "GM", nummer: "001", hendel: "HD5" });
  });

  it("herkent hoofdletterloze en gespatieerde invoer", () => {
    expect(parseBrauerCode(" 5-gm-001-hd5 ")?.kleur).toBe("GM");
  });

  it("laat meubel-, glas- en vreemde codes met rust", () => {
    expect(parseBrauerCode("OK-DL80MW")).toBeNull();
    expect(parseBrauerCode("GS-OBI1B90200CE")).toBeNull();
    expect(parseBrauerCode("DR-012")).toBeNull();
    expect(parseBrauerCode("5-ZZ-001")).toBeNull();
  });

  it("laat zes kleuren op één product vallen, maar houdt de hendel als aparte as", () => {
    expect(brauerModelKey("5-CE-001")).toBe("5-*-001");
    expect(brauerModelKey("5-GM-001")).toBe("5-*-001");
    expect(brauerModelKey("5-GM-001-HD5")).toBe("5-*-001");
    expect(brauerModelKey("5-GM-002")).toBe("5-*-002");
    expect(brauerModelKey("OK-DL80MW")).toBeNull();
  });

  it("leidt de assen af uit de codes die er echt zijn", () => {
    const assen = brauerAxes(["5-CE-001", "5-GM-001", "5-GM-001-HD5"]);
    expect(assen.map((a) => a.key)).toEqual(["kleur", "model"]);
    expect(assen[0].values.map((v) => v.value)).toEqual(["CE", "GM"]);
    expect(assen[1].values.map((v) => v.label)).toEqual(["Model A", "Model B"]);
  });

  it("laat de model-as weg als er maar één hendel is", () => {
    expect(brauerAxes(["5-CE-001", "5-GM-001"]).map((a) => a.key)).toEqual(["kleur"]);
  });

  it("geeft per code de keuze per as", () => {
    expect(brauerOptions("5-GM-001-HD5")).toEqual({ kleur: "GM", model: "HD5" });
    expect(brauerOptions("OK-DL80MW")).toBeNull();
  });
});
