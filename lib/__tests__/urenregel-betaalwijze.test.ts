/**
 * Een urenregel bijwerken mag de betaalwijze niet stil veranderen.
 *
 * Het bijwerkschema had `paymentMethod: z.enum([...]).default("cash")` terwijl
 * het bewerkformulier dat veld niet meestuurde. Wie uren of een tarief
 * bijwerkte, zette de regel dus ongemerkt op contant — zo stonden
 * factuurregels van Ahmed en Pieter als contant in de boeken en klopte het
 * contant-totaal op de projectpagina niet.
 */
import { describe, expect, it } from "vitest";

import { timeEntrySchema, timeEntryUpdateSchema } from "@/lib/uren-invoer";

const basis = { date: "2026-09-01", hours: "8", hourlyCostEur: "30" };

describe("urenregel bijwerken", () => {
  it("laat de betaalwijze weg als het formulier die niet meestuurt", () => {
    const r = timeEntryUpdateSchema.parse({ ...basis });
    expect(r.paymentMethod).toBeUndefined();
  });

  it("neemt een expliciete keuze over", () => {
    expect(timeEntryUpdateSchema.parse({ ...basis, paymentMethod: "cash" }).paymentMethod).toBe("cash");
    expect(timeEntryUpdateSchema.parse({ ...basis, paymentMethod: "invoice" }).paymentMethod).toBe("invoice");
  });

  it("weigert een onbekende betaalwijze", () => {
    expect(() => timeEntryUpdateSchema.parse({ ...basis, paymentMethod: "bitcoin" })).toThrow();
  });

  it("eist uren en tarief", () => {
    expect(() => timeEntryUpdateSchema.parse({ date: "2026-09-01", hours: "", hourlyCostEur: "30" })).toThrow();
    expect(() => timeEntryUpdateSchema.parse({ date: "2026-09-01", hours: "8", hourlyCostEur: "" })).toThrow();
  });
});

describe("urenregel toevoegen", () => {
  it("staat standaard op per factuur — contant is de uitzondering", () => {
    expect(timeEntrySchema.parse({ date: "2026-09-01", hours: "8" }).paymentMethod).toBe("invoice");
    expect(timeEntrySchema.parse({ date: "2026-09-01", hours: "8", paymentMethod: "cash" }).paymentMethod).toBe("cash");
  });
});
