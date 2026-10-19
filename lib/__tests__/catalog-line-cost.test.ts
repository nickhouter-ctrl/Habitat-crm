import { describe, expect, it } from "vitest";
import { catalogLineCost } from "../catalog-line-cost";
import { lineCostEur, normaliseLineItem } from "../documents";

const products = [
  { id: "rock", sku: "MS-340", name: "Rock Cut Lime Stone - Off-white", costEur: "37.81", additionalSizes: [
    { sku: "MS-340-1", label: "900*600", costEur: 12.16 },
  ] },
  { id: "rowena", sku: "MS-291", name: "Rowena Travertine - Beige", costEur: "75.63", additionalSizes: [
    { sku: "MS-291-1", label: "1200*600", costEur: 10.37 },
    { sku: "MS-291-5", label: "2900*1200", costEur: 75.63 },
    { sku: "MS-291-2", label: "Unknown cost", costEur: null },
  ] },
];
const resolve = catalogLineCost(products);

describe("catalog line costs", () => {
  it("uses the two selected sizes instead of their parent costs", () => {
    const rock = resolve({ productId: "rock", description: "900*600 · MS-340-1" });
    const rowena = resolve({ productId: "rowena", description: "1200*600 · MS-291-1" });
    expect(rock).toBe(12.16);
    expect(rowena).toBe(10.37);
    expect((41.28 - rock!) / 41.28 * 100).toBeCloseTo(70.54, 2);
    expect((43.76 - rowena!) / 43.76 * 100).toBeCloseTo(76.3, 1);
  });
  it("keeps base-product costs and identifies exact size codes without prefix collisions", () => {
    expect(resolve({ productId: "rowena", description: "Travertine" })).toBe(75.63);
    expect(resolve({ productId: "rowena", description: "2900*1200 · MS-291-5" })).toBe(75.63);
    expect(resolve({ productId: "rowena", description: "Other · MS-291-10" })).toBeUndefined();
    expect(resolve({ productId: "rowena", description: "Wrong product · MS-340-1" })).toBeUndefined();
  });
  it("does not fall back to the parent when the chosen size has no cost", () => {
    expect(resolve({ productId: "rowena", description: "Unknown cost · MS-291-2" })).toBeUndefined();
  });
  it("recognises old size labels and SKU descriptions", () => {
    expect(resolve({ productId: "rock", description: "900*600" })).toBe(12.16);
    expect(resolve({ productId: "rock", name: "Rock Cut Lime Stone - Off-white — 900*600" })).toBe(12.16);
    expect(resolve({ description: "1200*600 · MS-291-1" })).toBe(10.37);
    expect(resolve({ description: "MS-291" })).toBe(75.63);
  });
  it("preserves a saved cost snapshot and leaves its sale price unchanged", () => {
    const saved = normaliseLineItem({ name: "Rowena", productId: "rowena", description: "1200*600 · MS-291-1", units: 2, price: 43.76, costEur: 10.37 });
    expect(saved?.price).toBe(43.76);
    expect(saved?.costEur).toBe(10.37);
    expect(lineCostEur(saved!, () => 999)).toBe(20.74);
    expect(lineCostEur({ ...saved!, costEur: undefined }, resolve)).toBe(20.74);
  });
});
