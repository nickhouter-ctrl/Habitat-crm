import { describe, expect, it } from "vitest";
import { sizeDims, sizeIsProductFormat, withProductStock } from "../size-stock";

describe("voorraad per maat", () => {
  it("herkent het eigen formaat in beide richtingen", () => {
    expect(sizeDims("1200*600")).toEqual([1200, 600]);
    expect(sizeIsProductFormat("1200*600", "600.00", "1200.00")).toBe(true);
    expect(sizeIsProductFormat("2900*1200", "600.00", "1200.00")).toBe(false);
    expect(sizeIsProductFormat("Mat zwart", 600, 1200)).toBe(false);
  });
  it("geeft de eigen maat altijd de productvoorraad, andere maten houden hun getal", () => {
    const sizes = [{ label: "1200*600" }, { label: "2900*1200", stockQty: 3 }, { label: "600x1200", stockQty: 77 }];
    expect(withProductStock(sizes, { stockQty: "57.000", widthMm: "600.00", heightMm: "1200.00" }).map(s => s.stockQty ?? null)).toEqual([57, 3, 57]);
    expect(withProductStock(sizes, { stockQty: null, widthMm: 600, heightMm: 1200 })).toBe(sizes);
  });
});
