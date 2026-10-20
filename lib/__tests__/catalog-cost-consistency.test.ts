import { describe, expect, it } from "vitest";
import { catalogLineCost, invoiceProductMargin } from "../catalog-line-cost";
import { repairCatalogCosts } from "../catalog-cost-repair";
import { docProductMargin, lineMaterialCostEur } from "../documents";
import { projectOwnProducts } from "../project-cost-streams";
import { landedCost } from "../pricing";
import type { Product } from "../db/schema";

const product = { id: "stone", sku: "MS-291", name: "Rowena", costEur: "75.63", additionalSizes: [
  { sku: "MS-291-1", label: "1200*600", costEur: 10.37 },
  { sku: "MS-291-2", label: "Unknown", costEur: null },
] };
const resolve = catalogLineCost([product]);
const line = { name: "Rowena", productId: "stone", description: "1200*600 · MS-291-1", units: 2, price: 43.76, discount: 10, category: "eigen_producten" };

describe("consistent product accounting", () => {
  it("uses the same selected size for invoices, contacts, projects, funding and credits", () => {
    expect(lineMaterialCostEur(line, resolve)).toBe(20.74);
    expect(docProductMargin([line], resolve)).toEqual({ revenue: 78.76, cost: 20.74, uncostedRevenue: 0 });
    const docs = [
      { kind: "invoice", status: "paid", issueDate: "2026-10-20", items: [line] },
      { kind: "creditnote", status: "paid", issueDate: "2026-10-20", items: [{ ...line, units: 1 }] },
    ];
    const project = projectOwnProducts(docs, new Map(), resolve);
    expect(project.cost).toBe(10.37);
    expect(invoiceProductMargin(docs, resolve, "2026-10-01").all.cost).toBe(10.37);
  });
  it("respects saved cost snapshots and recognises a variant without a product id", () => {
    expect(lineMaterialCostEur({ ...line, costEur: 12 }, resolve)).toBe(24);
    expect(lineMaterialCostEur({ ...line, productId: undefined }, resolve)).toBe(20.74);
  });
  it("excludes labor and unknown cost from product margin instead of reporting free profit", () => {
    const docs = [{ kind: "invoice", issueDate: "2026-10-20", items: [line,
      { ...line, description: "Unknown · MS-291-2", price: 1000 },
      { name: "Arbeid", category: "arbeid", units: 1, price: 1000 },
    ] }];
    const result = invoiceProductMargin(docs, resolve, "2026-10-01");
    expect(result.all).toEqual({ revenue: 78.76, cost: 20.74, uncostedLines: 1, marginPct: 74 });
    expect(result.month).toEqual(result.all);
    expect(invoiceProductMargin(docs, resolve, "2026-11-01").month.marginPct).toBeNull();
  });
});

describe("conservative catalogue repairs", () => {
  const p = (v: Partial<Product>) => ({ collection: "Wandpanelen", widthMm: "600", heightMm: "1200", costEur: "47.50", purchaseCostEur: "29.20", ...v }) as Product;
  it("uses an exact supplier SKU and preserves sales price", () => {
    const result = repairCatalogCosts(p({ collection: "Caracole", additionalSizes: [
      { sku: "CHAIR-B", label: "Blue", priceEur: 400 }, { sku: "CHAIR-C", label: "Red", priceEur: 500 },
    ] }), new Map([["CHAIR-B", 100]]));
    expect(result.set.additionalSizes?.[0]).toEqual({ sku: "CHAIR-B", label: "Blue", priceEur: 400, purchaseEur: 100, costEur: 100 });
    expect(result.set.additionalSizes?.[1].costEur).toBeUndefined();
    expect(result.set.priceEur).toBeUndefined();
  });
  it("only backfills the same panel dimensions, without inferring area-based costs", () => {
    const result = repairCatalogCosts(p({ additionalSizes: [
      { sku: "A", label: "1200*600" }, { sku: "B", label: "2400*600" },
    ] }), new Map());
    expect(result.set.additionalSizes?.[0].costEur).toBe(47.5);
    expect(result.set.additionalSizes?.[1].costEur).toBeUndefined();
  });
  it("aligns the base and its editable breakdown with the unique known size, idempotently", () => {
    const original = p({ additionalSizes: [{ sku: "MS-308-1", label: "1200*600", costEur: 11.88, purchaseEur: 7.3 }] });
    const result = repairCatalogCosts(original, new Map());
    expect(Number(result.set.costEur)).toBe(11.88);
    expect(landedCost(result.set)).toBe(11.88);
    expect(repairCatalogCosts({ ...original, ...result.set }, new Map()).reasons).toEqual([]);
  });
});
