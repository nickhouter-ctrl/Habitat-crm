import { describe, expect, it } from "vitest";
import { docOwnShare, docProductMargin, isOwnProductLine } from "../documents";
import { splitProjectReceipts, splitReceipt } from "../receipts";
import { deriveAdvanceCover, deriveProjectMargins, projectWorkProfit } from "../project-financials";
import type { DocumentLineItem } from "../db/schema";

const line = (name: string, price = 100, extra: Partial<DocumentLineItem> = {}): DocumentLineItem =>
  ({ name, units: 1, price, taxRate: 21, ...extra });

describe("own goods independent of known product cost", () => {
  it.each(["kozijnen Finca Lisa", "Ballustrade", "Binnen deuren", "Buiten deur", "Badkamer artikelen", "Ventanas", "Puerta exterior", "Bathroom products", "Magic stone", "Verlichting", "Lighting", "Iluminación"])("recognizes %s", name => {
    expect(isOwnProductLine(line(name))).toBe(true);
    expect(docOwnShare([line(name)], 100)).toBe(1);
  });
  it("includes catalog goods and an explicit custom product category without cost", () => {
    expect(docOwnShare([line("Custom cabinet", 100, { productId: "catalog-id" })], 100)).toBe(1);
    expect(docOwnShare([line("Custom item", 100, { category: "eigen_producten" })], 100)).toBe(1);
    expect(docProductMargin([line("Custom item", 100, { category: "eigen_producten", pricingBasis: "construction", costEur: 60 })]))
      .toEqual({ revenue: 100, cost: 60, uncostedRevenue: 0 });
  });
  it.each([
    line("voorschot werkzaamheden", 15000, { category: "overig", marginPct: 15 }),
    line("montage kozijnen"), line("Warmte pomp installatie / Air flows"),
    line("Architect"), line("Topograaf"), line("1st term exterior works according design"),
    line("Puertas", 100, { category: "plaatsing" }),
    line("Bouwmaterialen gekocht door ons", 100, { pricingBasis: "construction", costEur: 50 }),
    line("verrekening voorschot", -100, { advanceRef: "previous-invoice" }),
  ])("keeps work, third parties and settlements out of our goods: $name", item => {
    expect(isOwnProductLine(item)).toBe(false);
  });
  it("keeps unknown costs outside measured margin, while reserving the full selling price", () => {
    const items = [line("kozijnen", 24029.84), line("voorschot werkzaamheden", 15000)];
    expect(docProductMargin(items)).toEqual({ revenue: 0, cost: 0, uncostedRevenue: 24029.84 });
    expect(docOwnShare(JSON.stringify(JSON.stringify(items)), 39029.84)).toBeCloseTo(24029.84 / 39029.84);
  });
  it("handles discounted goods, returned quantities and negative credit subtotals", () => {
    const goods = line("doors", 100, { units: -2, discount: 10, costEur: 30 });
    expect(docProductMargin([goods])).toEqual({ revenue: -180, cost: -60, uncostedRevenue: 0 });
    expect(docOwnShare([goods], -180)).toBe(1);
    expect(docOwnShare([line("doors", 200), line("reeds betaald", -100)], 100)).toBe(1);
    expect(docOwnShare([line("doors")], 0)).toBe(0);
  });
});

describe("liquid project funds", () => {
  it.each(["Kozijnen", "Balustrades", "Binnen deuren", "Buiten deuren", "Badkamer artikelen", "Verlichting", "Magic stone"])("excludes the full paid selling price of %s, not just its cost", name => {
    const items=[line(name,10000,{costEur:2000}),line("voorschot werkzaamheden",5000)];
    const receipt=splitReceipt({amountEur:18150,method:"bank",vatRate:"21",documentId:"sale"},new Map([["sale",docOwnShare(items,15000)]]));
    expect(receipt).toEqual({totalReceived:15000,ownProductReceived:10000,liquidReceived:5000});
  });
  it("shows Finca work profit separately from money remaining for costs", () => {
    const cover=deriveAdvanceCover({laborCost:99409.079492,purchaseCost:24635.35,coverReceivedEx:163156.74,ownProductReceivedEx:81824.73,requiredRevenue:142651.10});
    expect(projectWorkProfit(cover)).toBe(18606.67);
    expect(cover.saldo).toBe(20505.64);
    expect(projectWorkProfit(cover)).not.toBe(cover.costSaldo);
    expect(Math.round((cover.received-cover.prefinanced-projectWorkProfit(cover))*100)/100).toBe(cover.saldo);
  });
  const ownShareByDoc = new Map([
    ["mixed", docOwnShare([line("kozijnen", 24029.84), line("voorschot werkzaamheden", 15000)], 39029.84)],
    ["goods", 1], ["work", 0], ["credit", 1],
  ]);
  it("splits Finca Lisa's paid mixed invoice into goods and work, excluding VAT", () => {
    expect(splitReceipt({ amountEur: "47226.11", method: "bank", documentId: "mixed", docSubtotal: "39029.84", docTotal: "47226.11" }, ownShareByDoc))
      .toEqual({ totalReceived: 39029.84, ownProductReceived: 24029.84, liquidReceived: 15000 });
  });
  it("allocates each partial payment proportionally and reconciles to the cent", () => {
    const receipt = splitReceipt({ amountEur: "15742.04", method: "bank", documentId: "mixed", vatRate: "21" }, ownShareByDoc);
    expect(receipt.ownProductReceived).toBe(8009.95);
    expect(receipt.liquidReceived).toBe(5000);
    expect(receipt.totalReceived).toBe(13009.95);
  });
  it("keeps actual refunds, cash, unlinked advances and explicit mixed VAT amounts", () => {
    expect(splitProjectReceipts([
      { amountEur: 1210, method: "bank", documentId: "goods", vatRate: "21" },
      { amountEur: -121, method: "bank", documentId: "credit", vatRate: "21" },
      { amountEur: 1210, method: "advance", vatRate: "21" },
      { amountEur: 500, method: "cash" },
      { amountEur: 120, method: "bank", documentId: "work", vatAmountEur: "15", vatRate: "21" },
    ], ownShareByDoc)).toEqual({ totalReceived: 2505, ownProductReceived: 900, liquidReceived: 1605 });
  });
  it("does not count unpaid invoices or credit notes as cash receipts", () => {
    expect(splitProjectReceipts([], ownShareByDoc)).toEqual({ totalReceived: 0, ownProductReceived: 0, liquidReceived: 0 });
  });
  it("reserves goods once, then compares liquid funds with labour and external costs", () => {
    const receipts = splitProjectReceipts([{ amountEur: 47226.11, method: "bank", documentId: "mixed", vatRate: "21" }], ownShareByDoc);
    const margins = deriveProjectMargins({ laborCost: 5000, purchaseCost: 3000, productRevenue: 0, productCost: 0 });
    const cover = deriveAdvanceCover({ laborCost: 5000, purchaseCost: 3000, coverReceivedEx: receipts.liquidReceived,
      ownProductReceivedEx: receipts.ownProductReceived, requiredRevenue: margins.totalRevenue });
    expect(cover.totalReceived).toBe(39029.84);
    expect(cover.ownProductReceived).toBe(24029.84);
    expect(cover.received).toBe(15000);
    expect(cover.costSaldo).toBe(7000);
    expect(cover.saldo).toBe(5800);
    expect(cover.suggestedRequestEur).toBe(0);
  });
  it("cannot fund labour from a fully paid goods-only invoice", () => {
    const receipt = splitReceipt({ amountEur: 6050, method: "bank", documentId: "goods", vatRate: "21" }, ownShareByDoc);
    const cover = deriveAdvanceCover({ laborCost: 1000, purchaseCost: 0, coverReceivedEx: receipt.liquidReceived,
      ownProductReceivedEx: receipt.ownProductReceived, requiredRevenue: 1150 });
    expect(cover.totalReceived).toBe(5000);
    expect(cover.costSaldo).toBe(-1000);
    expect(cover.saldo).toBe(-1150);
    expect(cover.status).toBe("voorgeschoten");
  });
});
