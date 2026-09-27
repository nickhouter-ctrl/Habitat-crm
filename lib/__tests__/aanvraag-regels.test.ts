/**
 * Van webaanvraag naar offerteregels — met de echte aanvraag van Donny Verboom
 * (26-09-2026) als maat: negen uitvoeringscodes van Brauer en één productcode.
 * Daar kwamen negen van de tien regels zonder prijs binnen, omdat het voorladen
 * alleen in `products` zocht.
 */
import { describe, expect, it } from "vitest";

import {
  aantalUitNaam,
  codeSleutel,
  offerteRegelsUitAanvraag,
  type CatalogusTreffer,
} from "@/lib/aanvraag-regels";

const treffers = new Map<string, CatalogusTreffer>([
  [
    codeSleutel("BRA-5-GK-159"),
    {
      productId: "p1",
      naam: "Altijd open waste",
      uitvoering: "Geborsteld koper",
      code: "BRA-5-GK-159",
      prijsEur: 58.68,
      btw: 21,
    },
  ],
  [
    codeSleutel("DR-002-SET"),
    { productId: "p2", naam: "Binnendeur compleet", prijsEur: 1234.5, btw: 21, categorie: "Binnendeuren" },
  ],
]);

describe("offerteregels uit een aanvraag", () => {
  it("zet de uitvoering in de naam en haar prijs op de regel", () => {
    const [r] = offerteRegelsUitAanvraag([{ sku: "BRA-5-GK-159", naam: "Altijd open waste — Geborsteld koper" }], treffers);
    expect(r.name).toBe("Altijd open waste — Geborsteld koper");
    expect(r.price).toBe(58.68);
    expect(r.taxRate).toBe(21);
    expect(r.productId).toBe("p1");
    // De uitvoeringscode hoort erbij: zonder die code is de regel niet te bestellen.
    expect(r.description).toBe("Geborsteld koper · BRA-5-GK-159");
  });

  it("werkt net zo goed voor een gewoon product zonder uitvoering", () => {
    const [r] = offerteRegelsUitAanvraag([{ sku: "DR-002-SET", naam: "Binnendeur" }], treffers);
    expect(r.name).toBe("Binnendeur compleet");
    expect(r.price).toBe(1234.5);
    expect(r.description).toBe("Binnendeuren");
  });

  it("let niet op hoofdletters of spaties in de code", () => {
    const [r] = offerteRegelsUitAanvraag([{ sku: " bra-5-gk-159 ", naam: null }], treffers);
    expect(r.price).toBe(58.68);
  });

  it("laat een onbekende code staan met de naam uit de aanvraag", () => {
    const [r] = offerteRegelsUitAanvraag([{ sku: "XYZ-1", naam: "Handdoekrek — Geborsteld koper" }], treffers);
    expect(r.name).toBe("Handdoekrek — Geborsteld koper");
    expect(r.price).toBe(0);
    expect(r.description).toContain("XYZ-1");
    expect(r.productId).toBeUndefined();
  });

  it("houdt de volgorde van de aanvraag aan", () => {
    const regels = offerteRegelsUitAanvraag(
      [
        { sku: "DR-002-SET", naam: null },
        { sku: "BRA-5-GK-159", naam: null },
        { sku: "XYZ-1", naam: "Onbekend" },
      ],
      treffers,
    );
    expect(regels.map((r) => r.price)).toEqual([1234.5, 58.68, 0]);
  });

  it("valt terug op de naam als de aanvraag geen codes heeft", () => {
    const [r] = offerteRegelsUitAanvraag([{ sku: null, naam: "Losse post" }], treffers);
    expect(r.name).toBe("Losse post");
    expect(r.price).toBe(0);
    expect(r.description).toBeUndefined();
  });
});

describe("aantal uit de naam", () => {
  it("leest het aantal achter de naam", () => {
    expect(aantalUitNaam("Binnendeur Compleet 720×2600 (bronze) × 7")).toEqual({
      naam: "Binnendeur Compleet 720×2600 (bronze)",
      aantal: 7,
    });
    expect(aantalUitNaam("Doucherek x 3")).toEqual({ naam: "Doucherek", aantal: 3 });
  });

  it("ziet een maat niet aan voor een aantal", () => {
    expect(aantalUitNaam("Spiegel 120×80")).toEqual({ naam: "Spiegel 120×80", aantal: 1 });
    expect(aantalUitNaam("Altijd open waste")).toEqual({ naam: "Altijd open waste", aantal: 1 });
    expect(aantalUitNaam(null)).toEqual({ naam: "", aantal: 1 });
  });

  it("zet dat aantal op de offerteregel", () => {
    const [r] = offerteRegelsUitAanvraag(
      [{ sku: "DR-002-SET", naam: "Binnendeur Compleet 720×2600 (bronze) × 7" }],
      treffers,
    );
    expect(r.units).toBe(7);
    expect(r.name).toBe("Binnendeur compleet");
    expect(r.price).toBe(1234.5);
  });
});
