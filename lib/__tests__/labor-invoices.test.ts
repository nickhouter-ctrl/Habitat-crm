import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/storage", () => ({}));
vi.mock("@/lib/purchase-invoice-intake", () => ({}));

import { closestSheet, planFromSheet, returnMail, workerForSheet } from "@/lib/autopilot/labor-invoices";
import { dagVerdeling, parseWideTimesheet } from "@/lib/timesheet-wide";

/** Zoals Excel het opslaat: middernacht Madrid = 23:00 UTC de dag ervoor. */
const madrid = (d: string) => new Date(Date.parse(`${d}T00:00:44+01:00`));

function sheet(title: string, sites: string[], rows: unknown[][], total?: unknown[]) {
  const aoa = [[title], ["WERKZAAMHEDEN", "DATUM", ...sites, "UREN", "PRIJS", "TOTAAL"], ...rows, ...(total ? [total] : [])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "Blad1");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

const luis = { id: "w-luis", name: "LUIS", active: true, defaultPaymentMethod: "invoice" as const, hourlyCostEur: "15", hourlyCostCashEur: null };
const pieter = { id: "w-piet", name: "PIETER HOOGENDIJK", active: true, defaultPaymentMethod: "invoice" as const, hourlyCostEur: "30", hourlyCostCashEur: null };
const projects: Record<string, { projectId: string; projectNaam: string }> = {
  silvster: { projectId: "p-silv", projectNaam: "Silvestre" },
  capnerge: { projectId: "p-lisa", projectNaam: "Finca Lisa" },
};
const resolve = (l: string) => projects[l.toLowerCase().replace(/[^a-z]/g, "")] ?? null;

describe("brede urenstaat lezen", () => {
  const buf = sheet("Hollandsemeesters Luis", ["SILVSTER", "CapNerge", "Oliva"], [
    ["airco", madrid("2026-10-27"), 8, "", "", 8, 15, 120],
    ["airco", madrid("2026-10-28"), 5, 4, "", 9, 15, 135],
    ["airco", "29/102026", "", 8, "", 8, 15, 120],
  ], ["Totaal", "", 13, 12, "", 25, "", 375]);

  it("leest datums als kalenderdag in Madrid, ook een getikte tekstdatum", () => {
    const p = parseWideTimesheet(buf, "Urenverantwoording 27-29 okt Luis.xlsx")!;
    expect(p.rows.map((r) => r.date)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
    expect(p.siteLabels).toEqual(["SILVSTER", "CapNerge", "Oliva"]);
    expect(p.totalHours).toBe(25);
    expect(p.totalAmount).toBe(375);
    expect(p.warnings).toEqual([]);
    expect(p.workerWords).toContain("luis");
  });

  it("meldt een totaalregel die niet klopt met de dagen", () => {
    const fout = sheet("Hollandsemeesters Luis", ["SILVSTER"], [
      ["x", madrid("2026-11-17"), 8, 8, 15, 120],
      ["x", madrid("2026-11-18"), 8, 8, 15, 120],
    ], ["Totaal", "", "", 15, "", 225]);
    const p = parseWideTimesheet(fout, "Luis.xlsx")!;
    expect(p.warnings).toEqual(expect.arrayContaining([
      "De dagen zijn samen 16 uur, de totaalregel zegt 15 uur",
      "De dagbedragen zijn samen € 240,00, de totaalregel zegt € 225,00",
    ]));
  });

  it("negeert een gewone lijst met projectkolom", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Fecha", "Proyecto", "Horas"], ["2026-11-01", "Silvestre", 8]]), "S");
    expect(parseWideTimesheet(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), "x.xlsx")).toBeNull();
  });
});

describe("dagverdeling", () => {
  const row = (sites: [string, number][], hours: number) => ({ date: "2026-11-11", sites: sites.map(([label, h]) => ({ label, hours: h })), hours, rate: 30, amount: hours * 30, note: null });
  it("neemt de werven zoals ingevuld als ze optellen", () => {
    expect(dagVerdeling(row([["A", 5], ["B", 3]], 8))).toEqual([{ label: "A", hours: 5 }, { label: "B", hours: 3 }]);
  });
  it("één werf krijgt de gefactureerde uren", () => {
    expect(dagVerdeling(row([["A", 8]], 9))).toEqual([{ label: "A", hours: 9 }]);
  });
  it("meerdere werven die niet optellen: onbekend", () => {
    expect(dagVerdeling(row([["A", 5], ["B", 3]], 9))).toBeNull();
  });
});

describe("plan uit urenstaat", () => {
  const parsed = parseWideTimesheet(sheet("Hollandsemeesters Luis", ["SILVSTER", "CapNerge"], [
    ["a", madrid("2026-11-17"), 8, "", 8, 15, 120],
    ["b", madrid("2026-11-18"), 5, 4, 9, 15, 135],
  ], ["Totaal", "", 13, 4, 17, "", 255]), "Luis.xlsx")!;

  it("klopt: urenregels per dag en werf, samen precies de factuur", () => {
    const plan = planFromSheet({ sheet: parsed, worker: luis, subtotal: 255, resolve, tag: "[urenstaat:x]" });
    expect(plan.findings).toEqual([]);
    expect(plan.entries.map((e) => [e.date, e.projectId, e.hours])).toEqual([
      ["2026-11-17", "p-silv", 8], ["2026-11-18", "p-silv", 5], ["2026-11-18", "p-lisa", 4],
    ]);
    expect(plan.entries.reduce((s, e) => s + e.hours * e.hourlyCostEur, 0)).toBe(255);
    expect(plan.entries.every((e) => e.workerId === "w-luis" && e.note.includes("[urenstaat:x]"))).toBe(true);
  });

  it("bedrag wijkt af → fout van de leverancier", () => {
    const plan = planFromSheet({ sheet: parsed, worker: luis, subtotal: 240, resolve, tag: "t" });
    expect(plan.findings).toContainEqual({ text: "Volgens de urenstaat is het 17 uur × € 15,00 = € 255,00, maar de factuur is € 240,00 ex btw", supplier: true });
  });

  it("verkeerd tarief → fout van de leverancier", () => {
    const plan = planFromSheet({ sheet: parsed, worker: pieter, subtotal: 510, resolve, tag: "t" });
    expect(plan.findings.some((f) => f.supplier && f.text.startsWith("Het uurtarief op de urenstaat"))).toBe(true);
  });

  it("onbekende werfkolom → ligt aan ons, niet terugsturen", () => {
    const plan = planFromSheet({ sheet: parsed, worker: luis, subtotal: 255, resolve: (l) => (l === "CapNerge" ? null : resolve(l)), tag: "t" });
    expect(plan.findings).toEqual([{ text: 'Werfkolom "CapNerge" is aan geen (of meer dan één) project gekoppeld', supplier: false }]);
  });
});

describe("koppelen", () => {
  it("persoon via een woord dat in één ploegnaam staat", () => {
    expect(workerForSheet(["pieter"], [luis, pieter])?.id).toBe("w-piet");
    expect(workerForSheet(["luis"], [luis, pieter])?.id).toBe("w-luis");
    expect(workerForSheet(["hans"], [luis, pieter])).toBeNull();
  });
  it("dichtstbijzijnde staat, alleen als dat duidelijk is", () => {
    const at = new Date("2026-11-21T10:00:00Z");
    const s = (d: string) => ({ receivedAt: new Date(d) });
    expect(closestSheet([s("2026-11-21T09:00:00Z"), s("2026-11-07T09:00:00Z")], at)).toEqual(s("2026-11-21T09:00:00Z"));
    expect(closestSheet([s("2026-11-21T09:00:00Z"), s("2026-11-20T09:00:00Z")], at)).toBeNull();
    expect(closestSheet([s("2026-11-01T09:00:00Z")], at)).toBeNull();
  });
  it("terugmail noemt alleen de fouten van de leverancier", () => {
    const m = returnMail({ name: "Pieter Hoogendijk", invoice: "260089", amount: 465, sheet: "Luis.xlsx", findings: [
      { text: "Totaal klopt niet", supplier: true }, { text: "Werfkolom onbekend", supplier: false },
    ] });
    expect(m.text).toContain("Hoi Pieter,");
    expect(m.text).toContain("- Totaal klopt niet");
    expect(m.text).not.toContain("Werfkolom");
    expect(m.subject).toContain("260089");
  });
});
