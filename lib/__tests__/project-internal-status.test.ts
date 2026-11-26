import { describe, expect, it } from "vitest";
import { deriveInternalStatus } from "@/lib/project-internal-status";

describe("deriveInternalStatus", () => {
  // Voorbeeld: contante uren tegen € 28 doorberekend, minder echt betaald.
  const s = deriveInternalStatus({
    cover: { totalReceived: 100000, saldo: -60000 },
    margins: { laborCost: 100000, laborRevenue: 115000, purchaseCost: 20000, purchaseRevenue: 23000, otherCost: 2000, otherRevenue: 2300 },
    ownProductCost: 19700,
    laborRateGain: 8000,
  });
  it("rekent arbeid tegen werkelijk betaald tarief", () => {
    expect(s.labor.cost).toBe(92000);
    expect(s.totalCost).toBe(133700);
  });
  it("geeft echt voorgeschoten en het voorschot-tekort", () => {
    expect(s.prefinancedReal).toBe(33700);
    expect(s.prefinancedClient).toBe(60000);
  });
  it("verklaart het verschil volledig", () => {
    expect(s.markup).toBe(18300);
    expect(s.laborRateGain).toBe(8000);
    expect(s.adjustments).toBe(0);
  });
});
