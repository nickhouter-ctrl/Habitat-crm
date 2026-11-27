import { describe, expect, it } from "vitest";

import { documentSummary, lineDiscountAmount, lineTotalIncl, orderDiscountEligible, orderDiscountPctForAmount, orderDiscountPlan } from "@/lib/documents";

const items = [
  { name: "Paneel", units: 24, price: 89.5, discount: 10, taxRate: 21 },
  { name: "Plaatsing", units: 16, price: 45, discount: 10, taxRate: 10 },
  { name: "Bezorgkosten", units: 1, price: 75, taxRate: 21 },
];

describe("orderkorting en factuurtotalen", () => {
  it("regel: korting in euro's en totaal incl. btw", () => {
    expect(lineDiscountAmount(items[0])).toBe(214.8);
    expect(lineTotalIncl(items[0])).toBe(2339.17);
  });

  it("totaalblok: bruto, korting, subtotaal en btw per tarief", () => {
    const s = documentSummary(items);
    expect(s.gross).toBe(2943);
    expect(s.discount).toBe(286.8);
    expect(s.subtotal).toBe(2656.2);
    expect(s.taxByRate).toEqual([
      { rate: 21, base: 2008.2, tax: 421.72 },
      { rate: 10, base: 648, tax: 64.8 },
    ]);
    expect(s.total).toBe(round2(s.subtotal + s.tax));
  });

  it("€-korting wordt een percentage dat op de cent na uitkomt", () => {
    const zonder = items.map((it) => ({ ...it, discount: 0 }));
    const plan = orderDiscountPlan(zonder, 500)!;
    const metKorting = zonder.map((it, i) => ({ ...it, discount: plan[i] }));
    const s = documentSummary(metKorting);
    expect(s.discount).toBe(500);
  });

  it("verrekenregels en negatieve regels doen niet mee", () => {
    expect(orderDiscountEligible({ price: 100, advanceRef: "x" })).toBe(false);
    expect(orderDiscountEligible({ price: -1000 })).toBe(false);
    expect(orderDiscountEligible({ price: 100 })).toBe(true);
    expect(orderDiscountPctForAmount([{ units: 1, price: -500 }], 100)).toBeNull();
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
