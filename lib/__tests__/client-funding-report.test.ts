import { describe, expect, it } from "vitest";
import { clientFundingAmounts, clientFundingPayments, clientFundingReport } from "../client-funding-report";
import { deriveAdvanceCover, deriveProjectMargins } from "../project-financials";

describe("customer advance statement", () => {
  function fixture(received = 10000) {
    const margins = deriveProjectMargins({ laborCost: 4000, purchaseCost: 2000, otherCost: 500, productRevenue: 3000, productCost: 1733.21 });
    const cover = deriveAdvanceCover({ laborCost: 4000, purchaseCost: 2500, coverReceivedEx: received - 3000,
      ownProductReceivedEx: 3000, requiredRevenue: margins.laborRevenue + margins.purchaseRevenue + margins.otherRevenue });
    return { margins, cover, amounts: clientFundingAmounts(cover, margins) };
  }
  it("reconciles to the CRM balance, including the client price of work, and only exposes client amounts", () => {
    const { amounts, cover } = fixture();
    expect(amounts).toEqual({ received: 10000, products: 3000, work: 7475, advanceCredit: 0, advanceCreditDescription: null, unpaidProducts: 0, remaining: -475, labor: 4600, materials: 2300, other: 575 });
    expect(amounts.received - amounts.products - amounts.work).toBe(cover.saldo);
    expect(amounts.labor + amounts.materials + amounts.other).toBe(amounts.work);
  });
  it.each(["nl", "en", "es"] as const)("keeps internal cost and profit data out of the %s report", locale => {
    const { amounts } = fixture();
    const report = clientFundingReport({ projectName: "Testproject", clientName: "Customer", generatedAt: new Date("2026-10-06"), locale, amounts });
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/1\.733,21|1\.266,79|4\.000,00|2\.000,00|500,00|975,00/);
    expect(text).not.toMatch(/brutowinst|kostprijs|opslag|gross profit|markup|purchase cost|beneficio|coste interno/i);
    if (locale !== "nl") expect(text).not.toMatch(/Resterend voorschot|geboekt werk|Toelichting|Bouwmaterialen/);
    expect(report.tables[0].rows.at(-1)?.[1]).toBe("€\u00a0-475,00");
  });
  it.each([0, 1, -1])("preserves a %s balance and labels shortfalls explicitly", balance => {
    const { amounts } = fixture(10475 + balance);
    const report = clientFundingReport({ projectName: "Test", clientName: null, generatedAt: new Date(), locale: "nl", amounts });
    expect(amounts.remaining).toBe(balance);
    expect(report.kpis[2].label).toBe(balance < 0 ? "Nog aan te vullen" : "Resterend voorschot");
    expect(report.kpis[2].value).not.toContain("-");
  });

  it("lists every payment by date and reconciles the total to the balance", () => {
    const { amounts } = fixture();
    const payments = clientFundingPayments([
      { method: "cash", amountEur: "4000", date: "2026-04-18" },
      { method: "invoice", amountEur: "7260", vatAmountEur: "1260", date: "2026-01-16", docNumber: "F260009" },
    ]);
    expect(payments.map(p => [p.date, p.net, p.vat])).toEqual([["2026-01-16", 6000, 1260], ["2026-04-18", 4000, 0]]);
    const report = clientFundingReport({ projectName: "T", clientName: null, generatedAt: new Date(), locale: "nl", amounts, payments });
    const table = report.tables[1];
    expect(table.title).toBe("Ontvangen betalingen op datum");
    expect(table.rows.map(r => r[0] || r[1])).toEqual(["16-01-2026", "18-04-2026", "Totaal ontvangen"]);
    expect(table.rows.slice(0, 2).map(r => r[1])).toEqual(["Factuur F260009", "Contante betaling"]);
    expect(table.rows.at(-1)?.slice(2)).toEqual(["€\u00a011.260,00", "€\u00a01.260,00", "€\u00a010.000,00"]);
    expect(() => clientFundingReport({ projectName: "T", clientName: null, generatedAt: new Date(), locale: "nl", amounts, payments: payments.slice(1) })).toThrow();
  });

  it("shows unpaid delivered products at sales price in the balance and lists them", () => {
    const margins = deriveProjectMargins({ laborCost: 1000, purchaseCost: 0, productRevenue: 0, productCost: 0 });
    const cover = deriveAdvanceCover({ laborCost: 1000, purchaseCost: 0, coverReceivedEx: 2000, ownProductReceivedEx: 0,
      ownProductCost: 600, requiredRevenue: margins.laborRevenue });
    const amounts = clientFundingAmounts(cover, margins, 900);
    expect(amounts.unpaidProducts).toBe(900);
    expect(amounts.remaining).toBe(2000 - 1150 - 900);
    const delivered = [{ date: "2026-08-10", documentNumber: null, name: "Shower tray", quantity: 3, total: 900 }];
    const report = clientFundingReport({ projectName: "T", clientName: null, generatedAt: new Date(), locale: "nl", amounts, delivered });
    expect(report.tables[0].rows.map(r => r[0])).toContain("Geleverde producten, nog niet betaald");
    expect(report.tables[0].rows.at(-1)?.[1]).toBe("€\u00a0-50,00");
    const spec = report.tables.find(t => t.title === "Specificatie van de geleverde producten")!;
    expect(spec.rows.map(r => r[1])).toEqual(["Shower tray", "Totaal producten", "Nog niet betaald"]);
    expect(JSON.stringify(report)).not.toContain("600,00");
    expect(() => clientFundingReport({ projectName: "T", clientName: null, generatedAt: new Date(), locale: "nl", amounts,
      delivered: [{ ...delivered[0], total: 800 }] })).toThrow();
  });
});
