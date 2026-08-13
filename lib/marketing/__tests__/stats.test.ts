/**
 * Unit tests voor de rekenlogica van de leerlaag (brief §8): Wilson lower
 * bound voor CTR, empirical-Bayes-shrinkage voor kosten-per-lead, de
 * oordeeldrempels en de facet-extractie. Dit is de statistiek die voorkomt
 * dat "3 klikken op 11 impressies" bovenaan de ranglijst belandt.
 */
import { describe, expect, it } from "vitest";

import { facetsForSpec, headlineLengthBucket, type FacetSource } from "../facets";
import {
  MIN_AD_DAYS,
  MIN_IMPRESSIONS,
  empiricalBayesCpl,
  meetsVerdictThreshold,
  wilsonLowerBound,
} from "../stats";

/* --------------------------------------------------------- wilsonLowerBound */

describe("wilsonLowerBound", () => {
  it("komt overeen met het klassieke voorbeeld 1/10 ≈ 0,0179", () => {
    // met exacte z (1.9599639…) i.p.v. afgerond 1.96
    expect(wilsonLowerBound(1, 10)).toBeCloseTo(0.017876, 5);
  });

  it("drukt de 3-klikken-op-11-impressies-wonder ver onder de rauwe 27%", () => {
    const lb = wilsonLowerBound(3, 11);
    expect(lb).toBeLessThan(0.11); // rauwe CTR zou 0,27 zijn
    expect(lb).toBeGreaterThan(0.05);
  });

  it("beloont volume: zelfde rauwe CTR, meer data → hogere lower bound", () => {
    expect(wilsonLowerBound(20, 1000)).toBeGreaterThan(wilsonLowerBound(2, 100));
  });

  it("is 0 zonder impressies en blijft binnen [0, 1]", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(0, 50)).toBe(0);
    expect(wilsonLowerBound(50, 50)).toBeLessThan(1);
    expect(wilsonLowerBound(50, 50)).toBeGreaterThan(0.9);
  });
});

/* -------------------------------------------------------- empiricalBayesCpl */

describe("empiricalBayesCpl", () => {
  it("trekt weinig leads sterk naar het accountgemiddelde", () => {
    // rauwe CPL €50 op 2 leads, account €30 → dichter bij €30 dan bij €50
    const shrunk = empiricalBayesCpl(100, 2, 30);
    expect(shrunk).toBeGreaterThan(30);
    expect(shrunk).toBeLessThan(40);
  });

  it("laat veel volume vrijwel ongemoeid", () => {
    // rauwe CPL €20 op 50 leads, account €30 → vrijwel €20
    const shrunk = empiricalBayesCpl(1000, 50, 30);
    expect(shrunk).toBeGreaterThan(20);
    expect(shrunk).toBeLessThan(22);
  });

  it("blijft eindig zonder leads (besteding zonder resultaat)", () => {
    const shrunk = empiricalBayesCpl(200, 0, 30);
    expect(Number.isFinite(shrunk)).toBe(true);
    expect(shrunk).toBeGreaterThan(30); // duurder dan het gemiddelde
  });

  it("weegt naar volume: meer leads → dichter bij de rauwe CPL", () => {
    const raw = 60;
    const few = empiricalBayesCpl(raw * 3, 3, 30);
    const many = empiricalBayesCpl(raw * 30, 30, 30);
    expect(Math.abs(many - raw)).toBeLessThan(Math.abs(few - raw));
  });
});

/* -------------------------------------------------------------- drempels */

describe("meetsVerdictThreshold", () => {
  it("eist minimaal 1.000 impressies én 7 advertentie-dagen", () => {
    expect(MIN_IMPRESSIONS).toBe(1000);
    expect(MIN_AD_DAYS).toBe(7);
    expect(meetsVerdictThreshold(1000, 7)).toBe(true);
    expect(meetsVerdictThreshold(999, 30)).toBe(false);
    expect(meetsVerdictThreshold(50_000, 6)).toBe(false);
    expect(meetsVerdictThreshold(0, 0)).toBe(false);
  });
});

/* ----------------------------------------------------- headlineLengthBucket */

describe("headlineLengthBucket", () => {
  it("verdeelt koppen in kort/middel/lang", () => {
    expect(headlineLengthBucket(10)).toBe("kort");
    expect(headlineLengthBucket(35)).toBe("kort");
    expect(headlineLengthBucket(36)).toBe("middel");
    expect(headlineLengthBucket(60)).toBe("middel");
    expect(headlineLengthBucket(61)).toBe("lang");
  });
});

/* ------------------------------------------------------------ facetsForSpec */

const source: FacetSource = {
  template: "swatch",
  palette: "diep",
  format: "1080x1080",
  locale: "es",
  copyAngle: "material",
  productCategory: "Keukenbladen",
  assetSource: "instagram",
  badge: "v.a. 1.250 €",
  headline: "Piedra Flexible desde 1.250 €",
  audienceSegment: "local_es",
};

describe("facetsForSpec", () => {
  it("levert alle tien facetten uit de brief (§8 + §8c)", () => {
    const facets = facetsForSpec(source);
    const names = facets.map((f) => f.facet);
    expect(names).toEqual([
      "template",
      "palette",
      "format",
      "locale",
      "copy_angle",
      "product_category",
      "asset_source",
      "has_price_badge",
      "headline_length_bucket",
      "audience_segment",
    ]);
    expect(facets.find((f) => f.facet === "has_price_badge")?.value).toBe("ja");
    expect(facets.find((f) => f.facet === "headline_length_bucket")?.value).toBe("kort");
    expect(facets.find((f) => f.facet === "audience_segment")?.value).toBe("local_es");
  });

  it("slaat onbekende waarden over in plaats van 'null' te tellen", () => {
    const facets = facetsForSpec({
      ...source,
      copyAngle: null,
      productCategory: null,
      audienceSegment: null,
    });
    const names = facets.map((f) => f.facet);
    expect(names).not.toContain("copy_angle");
    expect(names).not.toContain("product_category");
    expect(names).not.toContain("audience_segment");
  });

  it("telt een lege badge als 'nee'", () => {
    const facets = facetsForSpec({ ...source, badge: null });
    expect(facets.find((f) => f.facet === "has_price_badge")?.value).toBe("nee");
  });
});
