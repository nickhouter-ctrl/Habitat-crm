import { describe, expect, it } from "vitest";
import { clientFundingAmounts, clientFundingReport } from "../client-funding-report";
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
    expect(amounts).toEqual({ received: 10000, products: 3000, work: 7475, remaining: -475, labor: 4600, materials: 2300, other: 575 });
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
});
