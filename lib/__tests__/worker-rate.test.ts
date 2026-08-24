import { describe, expect, it } from "vitest";

import { workerRate } from "@/lib/worker-rate";

describe("workerRate", () => {
  it("kiest het contante tarief bij contant en het factuurtarief bij factuur", () => {
    const imad = { hourlyCostEur: "24", hourlyCostCashEur: "20" };
    expect(workerRate(imad, "cash")).toBe(20);
    expect(workerRate(imad, "invoice")).toBe(24);
  });

  it("valt terug op het factuurtarief als er geen contant tarief is", () => {
    const w = { hourlyCostEur: "27", hourlyCostCashEur: null };
    expect(workerRate(w, "cash")).toBe(27);
    expect(workerRate(w, "invoice")).toBe(27);
  });

  it("valt terug op het contante tarief als er geen factuurtarief is", () => {
    const w = { hourlyCostEur: null, hourlyCostCashEur: "20" };
    expect(workerRate(w, "invoice")).toBe(20);
  });

  it("geeft niets terug zonder tarief — dan mag er niets ingevuld worden", () => {
    expect(workerRate({ hourlyCostEur: null, hourlyCostCashEur: null }, "cash")).toBeNull();
    expect(workerRate({ hourlyCostEur: "0", hourlyCostCashEur: "" }, "invoice")).toBeNull();
    expect(workerRate(null, "cash")).toBeNull();
  });
});
