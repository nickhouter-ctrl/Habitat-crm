import { describe, expect, it } from "vitest";
import { clientFundingProducts } from "../client-funding-products";
import { projectReceiptShares, splitProjectReceipts } from "../receipts";
import { clientFundingReport } from "../client-funding-report";

describe("customer product receipt specification", () => {
  const docs = [
    { id: "mixed", docNumber: "F-1", kind: "invoice", status: "paid", subtotal: "1000", items: [
      { name: "Kozijnen", units: 1, price: 600, costEur: 317.23, note: "private supplier detail" },
      { name: "Arbeid", category: "arbeid", units: 1, price: 400 },
    ] },
    { id: "unpaid", docNumber: "F-2", kind: "invoice", status: "sent", subtotal: "5000", items: [
      { name: "Deuren", units: 1, price: 5000 },
    ] },
  ];
  it("uses partial receipts and refunds, not invoiced totals or unpaid products", () => {
    const payments = [
      { documentId: "mixed", method: "invoice", amountEur: "605", vatRate: "21" },
      { documentId: "mixed", method: "invoice", amountEur: "-121", vatRate: "21" },
      { method: "advance", amountEur: "4000" },
    ];
    const shares = projectReceiptShares(docs, payments);
    const result = clientFundingProducts(docs, payments, shares);
    expect(result).toEqual([{ documentNumber: "F-1", products: ["Kozijnen"], received: 240,
      specifications: [{ documentId: "mixed", documentNumber: "F-1", items: [{ name: "Kozijnen", quantity: 1, unitPrice: 600, total: 600 }] }],
    }]);
    expect(result.reduce((s, r) => s + r.received, 0)).toBe(splitProjectReceipts(payments, shares).ownProductReceived);
    expect(JSON.stringify(result)).not.toMatch(/317|private|cost|Arbeid|Deuren/);
  });
  it("explains goods funded by a settled advance without counting the invoice again", () => {
    const settledDocs = [
      { id: "advance", docNumber: "PF-1", kind: "fondos", status: "paid", subtotal: "1000", items: [{ name: "Voorschot", units: 1, price: 1000 }] },
      { id: "final", docNumber: "F-3", kind: "invoice", status: "sent", subtotal: "1000", items: [
        { name: "Deuren", units: 1, price: 1200 },
        { name: "Arbeid", category: "arbeid", units: 1, price: 800 },
        { name: "Verrekend voorschot", units: 1, price: -1000, advanceRef: "advance" },
      ] },
    ];
    const payments = [{ documentId: "advance", method: "advance", amountEur: "1000", vatRate: "0" }];
    const shares = projectReceiptShares(settledDocs, payments);
    expect(clientFundingProducts(settledDocs, payments, shares)).toEqual([
      { documentNumber: "PF-1", products: ["Deuren"], received: 600,
        specifications: [{ documentId: "final", documentNumber: "F-3", items: [{ name: "Deuren", quantity: 1, unitPrice: 1200, total: 1200 }] }],
      },
    ]);
  });
  it.each(["nl", "en", "es"] as const)("shows discounted lines once across advances and final receipts in %s", locale => {
    const invoice = { id: "final", docNumber: "F-3", kind: "invoice", status: "paid", subtotal: "800", items: [
      { name: "Deuren", units: 2, price: 500, discount: 10, costEur: 173.29, note: "supplier secret" },
      { name: "Deuren", units: 1, price: 100, costEur: 31.23 },
      { name: "Arbeid", category: "arbeid", units: 1, price: 1000 },
      { name: "Verrekening", units: 1, price: -1200, advanceRef: "advance" },
    ] };
    const docs = [{ id: "advance", docNumber: "PF-1", kind: "fondos", status: "paid", subtotal: "1200", items: [] }, invoice];
    const payments = [{ documentId: "advance", method: "advance", amountEur: "1200", vatRate: "0" },
      { documentId: "final", method: "invoice", amountEur: "968", vatRate: "21" }];
    const shares = projectReceiptShares(docs, payments);
    const products = clientFundingProducts(docs, payments, shares);
    expect(products.reduce((sum, p) => sum + p.received, 0)).toBe(1000);
    const report = clientFundingReport({ projectName: "Test", clientName: null, generatedAt: new Date(), locale,
      amounts: { received: 2000, products: 1000, work: 1000, remaining: 0, labor: 1000, materials: 0, other: 0 }, products });
    const rows = report.tables.filter(t => t.columns.length === 4).flatMap(t => t.rows);
    expect(rows).toEqual([
      ["Deuren", "2", "€\u00a0450,00", "€\u00a0900,00"],
      ["Deuren", "1", "€\u00a0100,00", "€\u00a0100,00"],
      [expect.any(String), "", "", "€\u00a01.000,00"],
    ]);
    expect(JSON.stringify(products)).not.toMatch(/costEur|supplier secret|173.29|31.23/);
    if (locale !== "nl") expect(JSON.stringify(report)).not.toMatch(/Productregels|Per eenheid|Factuurbedragen/);
  });
  it("keeps different documents with the same number separate", () => {
    const docs = ["a", "b"].map((id, i) => ({ id, docNumber: "F-1", kind: "invoice", status: "paid", subtotal: "100", items: [
      { name: `Product-${i}`, category: "eigen_producten", units: 1, price: 100 },
    ] }));
    const payments = docs.map(d => ({ documentId: d.id, method: "invoice", amountEur: "121", vatRate: "21" }));
    const products = clientFundingProducts(docs, payments, projectReceiptShares(docs, payments));
    const report = clientFundingReport({ projectName: "Test", clientName: null, generatedAt: new Date(), locale: "nl",
      amounts: { received: 200, products: 200, work: 0, remaining: 0, labor: 0, materials: 0, other: 0 }, products });
    const rows = report.tables.filter(t => t.columns.length === 4).flatMap(t => t.rows);
    expect(rows.filter(r => r[0].startsWith("Product-"))).toHaveLength(2);
  });
  it.each(["nl", "en", "es"] as const)("shows every product once and one reconciled total in %s, even across long specifications", locale => {
    const products = Array.from({ length: 12 }, (_, i) => ({ documentNumber: `F-${i}`, products: Array.from({ length: 5 }, (_, j) => `Item-${i}-${j}`), received: 100 }));
    const report = clientFundingReport({ projectName: "Test", clientName: null, generatedAt: new Date(), locale,
      amounts: { received: 2000, products: 1200, work: 300, remaining: 500, labor: 300, materials: 0, other: 0 }, products });
    const rows = report.tables.filter(t => t.columns.length === 3).flatMap(t => t.rows);
    expect(rows.filter(r => r[2] === "€\u00a01.200,00")).toHaveLength(1);
    expect(rows.filter(r => r[2] === "€\u00a0100,00")).toHaveLength(12);
    for (const p of products) for (const name of p.products) expect(rows.filter(r => r[1].split(" · ").includes(name))).toHaveLength(1);
    if (locale !== "nl") expect(JSON.stringify(report)).not.toMatch(/Specificatie van de productbedragen|Ontvangen productbedrag/);
  });
  it("refuses a specification that does not reconcile with the customer balance", () => {
    expect(() => clientFundingReport({ projectName: "Test", clientName: null, generatedAt: new Date(), locale: "nl",
      amounts: { received: 2000, products: 1200, work: 300, remaining: 500, labor: 300, materials: 0, other: 0 },
      products: [{ documentNumber: "F-1", products: ["Kozijnen"], received: 1199.99 }],
    })).toThrow(/does not reconcile/);
  });
});
