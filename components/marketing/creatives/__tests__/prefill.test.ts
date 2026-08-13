/**
 * Unit tests voor de copy-prefill van de creative-editor (brief §7):
 * tekstblokken per taal en hoek, invulpatronen met tokens, en de Spaanse
 * prijsconventie 1.250,00 € (brief §8c).
 */
import { describe, expect, it } from "vitest";

import {
  fillPattern,
  formatPriceForLocale,
  resolveCopyPrefill,
  type CopyBlockRow,
  type ProductTokens,
} from "../prefill";

const product: ProductTokens = {
  name: "Flexible Stone",
  nameI18n: { es: "Piedra Flexible", de: "Flexibler Stein" },
  priceFromEur: "1250.00",
  unit: "m²",
  specs: { finish: "mat", material: "kalksteen" },
};

/* ------------------------------------------------------- prijs per locale */

describe("formatPriceForLocale", () => {
  it("gebruikt de Spaanse conventie met de euro achteraan", () => {
    expect(formatPriceForLocale("1250.00", "es")).toBe("1.250,00 €");
  });

  it("formatteert per taal", () => {
    expect(formatPriceForLocale("1250.00", "nl")).toMatch(/^€\s?1\.250,00$/);
    expect(formatPriceForLocale("1250.00", "de")).toBe("1.250,00 €");
    expect(formatPriceForLocale("1250.00", "en")).toBe("€1,250.00");
  });

  it("houdt cent-precisie aan (geen float-artefacten)", () => {
    expect(formatPriceForLocale("19.99", "es")).toBe("19,99 €");
    expect(formatPriceForLocale("0.10", "es")).toBe("0,10 €");
  });
});

/* ------------------------------------------------------------ fillPattern */

describe("fillPattern", () => {
  it("vult {price_from}, {product} en {unit} in", () => {
    expect(
      fillPattern("{product} vanaf {price_from} per {unit}", { product, locale: "nl" }),
    ).toMatch(/^Flexible Stone vanaf €\s?1\.250,00 per m²$/);
  });

  it("gebruikt de vertaalde productnaam van de locale", () => {
    expect(fillPattern("{product} desde {price_from}", { product, locale: "es" })).toBe(
      "Piedra Flexible desde 1.250,00 €",
    );
  });

  it("vult product-specs in ({finish})", () => {
    expect(fillPattern("Afwerking: {finish}", { product, locale: "nl" })).toBe(
      "Afwerking: mat",
    );
  });

  it("geeft null als een token niet invulbaar is — nooit '{token}' in een advertentie", () => {
    expect(fillPattern("Korting: {discount}", { product, locale: "nl" })).toBeNull();
    expect(fillPattern("Vanaf {price_from}", { product: { name: "X" }, locale: "nl" })).toBeNull();
  });

  it("laat tekst zonder tokens ongemoeid", () => {
    expect(fillPattern("Bezoek de showroom", { product, locale: "nl" })).toBe(
      "Bezoek de showroom",
    );
  });
});

/* ----------------------------------------------------- resolveCopyPrefill */

const blocks: CopyBlockRow[] = [
  { angle: "price", locale: "es", role: "headline", text: "Generiek ES prijs-kop", productId: null, pattern: null },
  { angle: "price", locale: "es", role: "headline", text: "n.v.t.", productId: "prod-1", pattern: "{product} desde {price_from}" },
  { angle: "price", locale: "es", role: "cta", text: "Pide presupuesto", productId: null, pattern: null },
  { angle: "price", locale: "nl", role: "headline", text: "NL prijs-kop", productId: null, pattern: null },
  { angle: "material", locale: "es", role: "headline", text: "Materiaal-kop ES", productId: null, pattern: null },
];

describe("resolveCopyPrefill", () => {
  it("kiest per rol het productspecifieke blok boven het generieke", () => {
    const copy = resolveCopyPrefill(blocks, {
      locale: "es",
      angle: "price",
      productId: "prod-1",
      product,
    });
    expect(copy.headline).toBe("Piedra Flexible desde 1.250,00 €");
    expect(copy.cta).toBe("Pide presupuesto");
  });

  it("valt terug op het generieke blok zonder productmatch", () => {
    const copy = resolveCopyPrefill(blocks, { locale: "es", angle: "price", productId: null });
    expect(copy.headline).toBe("Generiek ES prijs-kop");
  });

  it("mengt geen talen — elke locale is gelijkwaardig, geen vertaalfallback", () => {
    const copy = resolveCopyPrefill(blocks, { locale: "de", angle: "price", productId: null });
    expect(copy.headline).toBeUndefined();
    expect(copy.cta).toBeUndefined();
  });

  it("slaat een productblok met onvulbaar patroon over en pakt het generieke", () => {
    const copy = resolveCopyPrefill(blocks, {
      locale: "es",
      angle: "price",
      productId: "prod-1",
      product: { name: "Zonder prijs" }, // geen priceFromEur → patroon onvulbaar
    });
    expect(copy.headline).toBe("Generiek ES prijs-kop");
  });

  it("filtert op hoek", () => {
    const copy = resolveCopyPrefill(blocks, { locale: "es", angle: "material", productId: null });
    expect(copy.headline).toBe("Materiaal-kop ES");
    expect(copy.cta).toBeUndefined();
  });
});
