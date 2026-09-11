import { describe, expect, it } from "vitest";
import { deriveAdvanceCover, deriveProjectMargins } from "../project-financials";

describe("voorschot inclusief verdiensten", () => {
  it("rekent 15% opslag op kosten en houdt de productverkoopprijs aan", () => {
    const result = deriveProjectMargins({laborCost:1000,purchaseCost:2000,productCost:400,productRevenue:700});
    expect(result.laborRevenue).toBe(1150);
    expect(result.purchaseRevenue).toBe(2300);
    expect(result.totalRevenue).toBe(4150);
    expect(result.totalMargin).toBe(750);
  });
  it("waarschuwt ook wanneer kosten gedekt zijn maar verdiensten nog niet", () => {
    const cover = deriveAdvanceCover({laborCost:1000,purchaseCost:2000,coverReceivedEx:4000,requiredRevenue:4150});
    expect(cover.costSaldo).toBe(1000);
    expect(cover.saldo).toBe(-150);
    expect(cover.status).toBe("voorgeschoten");
    expect(cover.suggestedRequestEur).toBe(3000);
  });
  it("vraagt niets bij voldoende buffer", () => {
    expect(deriveAdvanceCover({laborCost:1000,purchaseCost:0,coverReceivedEx:4000,requiredRevenue:1150}).suggestedRequestEur).toBe(0);
  });
});
