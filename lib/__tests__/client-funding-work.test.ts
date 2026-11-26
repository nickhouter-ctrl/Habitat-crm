import { describe, expect, it } from "vitest";
import { clientCostLabel, clientWorkRows, crewLabel, weekStart } from "../client-funding-work";

describe("afgeboekt werk per factuur en week", () => {
  it("groepeert uren per week per ploeg en sluit op de cent op de klantprijs", () => {
    const rows = clientWorkRows({
      labor: [
        { date: "2026-10-13", crew: "AHMED BOUZEKRI", hours: 8, cost: 224 },
        { date: "2026-10-15", crew: "Ahmed Bouzekri (Construcciones Ahmed Javea)", hours: "8", cost: "224" },
        { date: "2026-10-20", crew: "imad", hours: 8, cost: 200 },
      ],
      purchases: [{ supplier: "BRICOMAN", reference: "BRICOMAN 029-1", subtotal: "100", total: "121", tax: "21", items: [], date: "2026-10-14" }],
      costs: [{ description: "Materiaalbonnen LaVibro — contant via Ahmed", category: "material", amountEur: "33.33", date: "2026-10-01" }],
      laborRevenue: 745.2, purchaseRevenue: 153.33, otherRevenue: 0,
    });
    expect(rows.map(r => [r.date, r.kind, r.description, r.hours ?? null])).toEqual([
      ["2026-10-01", "material", "Materiaalbonnen LaVibro", null],
      ["2026-10-13", "labor", "Ahmed Bouzekri (13-10 t/m 15-10)", 16],
      ["2026-10-14", "material", "BRICOMAN 029-1", null],
      ["2026-10-20", "labor", "Imad (20-10)", 8],
    ]);
    expect(rows.reduce((s, r) => s + Math.round(r.amount * 100), 0)).toBe(Math.round((745.2 + 153.33) * 100));
  });
  it("geeft elke urenfactuur een eigen regel met periode, losse uren per week", () => {
    const rows = clientWorkRows({
      labor: [
        { date: "2026-11-03", crew: "Ahmed", hours: 24, cost: 672, invoiceId: "a50", invoiceDate: "2026-11-12", invoiceRef: "A0050", supplier: "AHMED BOUZEKRI" },
        { date: "2026-11-07", crew: "Ahmed", hours: 24, cost: 672, invoiceId: "a50", invoiceDate: "2026-11-12", invoiceRef: "A0050", supplier: "AHMED BOUZEKRI" },
        { date: "2026-11-08", crew: "Ahmed Bouzekri", hours: 350, cost: 9800 },
      ],
      purchases: [], costs: [], laborRevenue: 12815.6, purchaseRevenue: 0, otherRevenue: 0,
    });
    expect(rows.map(r => [r.date, r.kind, r.description, r.amount])).toEqual([
      ["2026-11-08", "labor", "Ahmed Bouzekri (08-11)", 11270],
      ["2026-11-12", "laborInvoice", "AHMED BOUZEKRI A0050 (03-11 t/m 07-11)", 1545.6],
    ]);
  });
  it("haalt interne aantekeningen uit omschrijvingen", () => {
    expect(clientCostLabel("Vervoer (5 × € 15) — 36% naar rato van de uren — factuur 260048")).toBe("Vervoer (5 × € 15) — factuur 260048");
    expect(clientCostLabel("Inkoopfactuur Pieter Hoogendijk 260068")).toBe("Factuur Pieter Hoogendijk 260068");
    expect(clientCostLabel("Materaalbon FV26/2833 vibro-contant Ahmed")).toBe("Materaalbon FV26/2833 vibro");
    expect(clientCostLabel("Sirerol materialen (gekocht door Casabahome)")).toBe("Sirerol materialen");
    expect(clientCostLabel("Inkoopfactuur Ahmed Bouzekri 25-09-2026 contant — verdeeld over werven")).toBe("Factuur Ahmed Bouzekri 25-09-2026");
    expect(clientCostLabel("Inkoopfactuur Pieter Hoogendijk 260064 — de overige regels van 029478 (€ 111,50 incl)")).toBe("Factuur Pieter Hoogendijk 260064");
    expect(crewLabel("CSABAHOME S.L.")).toBe("Csabahome S.L.");
    expect(crewLabel(null)).toBe("Ploeg");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});
