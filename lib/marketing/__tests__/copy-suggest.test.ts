/**
 * Unit tests voor de copy-suggestie (U1). Kern van brief §2: GEEN LLM in het
 * draaipad — suggesties komen deterministisch uit vastgelegde tekstblokken
 * met invulpatronen. Prijzen per taal correct genoteerd (§8c: Spaans
 * 1.250,00 € met de euro achteraan).
 */
import { describe, expect, it } from "vitest";

import {
  fillTokens,
  formatPriceFrom,
  getCopySuggestion,
  type CopyBlockLike,
} from "../copy-suggest";

/* ---------------------------------------------------------- formatPriceFrom */

describe("formatPriceFrom", () => {
  it("noteert Spaans met punt-duizendtallen, komma-decimalen en euro achteraan", () => {
    expect(formatPriceFrom("1250.5", "es")).toBe("1.250,50 €");
    expect(formatPriceFrom("999", "es")).toBe("999,00 €");
    expect(formatPriceFrom("1234567.89", "es")).toBe("1.234.567,89 €");
  });

  it("noteert Duits zoals Spaans (euro achteraan)", () => {
    expect(formatPriceFrom("12345.6", "de")).toBe("12.345,60 €");
  });

  it("noteert Nederlands met euro vooraan", () => {
    expect(formatPriceFrom("1250", "nl")).toBe("€ 1.250,00");
  });

  it("noteert Engels met komma-duizendtallen en punt-decimalen", () => {
    expect(formatPriceFrom("1250.5", "en")).toBe("€1,250.50");
  });

  it("rekent met strings, niet met floats (geen 1989,99…-artefacten)", () => {
    expect(formatPriceFrom("19.9", "es")).toBe("19,90 €");
    expect(formatPriceFrom("0.29", "nl")).toBe("€ 0,29");
  });
});

/* --------------------------------------------------------------- fillTokens */

describe("fillTokens", () => {
  it("vult {price_from}, {category} en {finish} in", () => {
    expect(
      fillTokens(
        "{category} desde {price_from} en acabado {finish}",
        { priceFrom: "1250", category: "Flexible Stone", finish: "mate" },
        "es",
      ),
    ).toBe("Flexible Stone desde 1.250,00 € en acabado mate");
  });

  it("geeft null terug als een benodigd token ontbreekt (nooit half invullen)", () => {
    expect(fillTokens("Desde {price_from}", {}, "es")).toBeNull();
    expect(fillTokens("Acabado {finish}", { priceFrom: "10" }, "es")).toBeNull();
  });

  it("laat tekst zonder tokens ongemoeid", () => {
    expect(fillTokens("Visítanos en Xàbia", {}, "es")).toBe("Visítanos en Xàbia");
  });
});

/* -------------------------------------------------------- getCopySuggestion */

function block(overrides: Partial<CopyBlockLike>): CopyBlockLike {
  return {
    angle: "price",
    locale: "es",
    role: "headline",
    text: "Texto",
    pattern: null,
    productId: null,
    ...overrides,
  };
}

const BLOCKS: CopyBlockLike[] = [
  block({ role: "eyebrow", text: "Oferta" }),
  block({ role: "headline", text: "Generiek A" }),
  block({ role: "headline", text: "Generiek B" }),
  block({ role: "headline", text: "Productspecifiek", productId: "prod-1" }),
  block({ role: "subline", pattern: "Desde {price_from}", text: "" }),
  block({ role: "cta", text: "Pide presupuesto" }),
  block({ role: "headline", text: "Nederlands", locale: "nl" }),
  block({ role: "headline", text: "Showroom", angle: "showroom" }),
];

describe("getCopySuggestion", () => {
  it("kiest per rol een blok en vult tokens (volledige suggestie)", () => {
    const s = getCopySuggestion(BLOCKS, {
      angle: "price",
      locale: "es",
      priceFrom: "1250",
    });
    expect(s.eyebrow).toBe("Oferta");
    expect(["Generiek A", "Generiek B"]).toContain(s.headline);
    expect(s.subline).toBe("Desde 1.250,00 €");
    expect(s.cta).toBe("Pide presupuesto");
  });

  it("verkiest productspecifieke blokken boven generieke", () => {
    const s = getCopySuggestion(BLOCKS, {
      angle: "price",
      locale: "es",
      productId: "prod-1",
      priceFrom: "1250",
    });
    expect(s.headline).toBe("Productspecifiek");
  });

  it("mengt talen en invalshoeken nooit", () => {
    const s = getCopySuggestion(BLOCKS, { angle: "price", locale: "es", priceFrom: "10" });
    expect(s.headline).not.toBe("Nederlands");
    expect(s.headline).not.toBe("Showroom");
  });

  it("is deterministisch: zelfde invoer → zelfde suggestie", () => {
    const a = getCopySuggestion(BLOCKS, { angle: "price", locale: "es", priceFrom: "10" });
    const b = getCopySuggestion(BLOCKS, { angle: "price", locale: "es", priceFrom: "10" });
    expect(a).toEqual(b);
  });

  it("shuffle-optie: een andere variant geeft een ander blok bij 2+ kandidaten", () => {
    const variants = new Set(
      [0, 1].map(
        (variant) =>
          getCopySuggestion(BLOCKS, { angle: "price", locale: "es", priceFrom: "10", variant })
            .headline,
      ),
    );
    expect(variants).toEqual(new Set(["Generiek A", "Generiek B"]));
  });

  it("slaat blokken over waarvan het patroon niet ingevuld kan worden", () => {
    // Geen priceFrom → het subline-patroon met {price_from} kan niet; de
    // suggestie laat de subline dan weg in plaats van half in te vullen.
    const s = getCopySuggestion(BLOCKS, { angle: "price", locale: "es" });
    expect(s.subline).toBeUndefined();
  });

  it("geeft een lege suggestie als er niets past", () => {
    expect(getCopySuggestion(BLOCKS, { angle: "seasonal", locale: "de" })).toEqual({});
  });
});
