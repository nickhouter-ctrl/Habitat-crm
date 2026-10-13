import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseTimesheet } from "@/lib/timesheet-intake";

function workbookBuffer(sheets: { name: string; rows: unknown[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("parseTimesheet", () => {
  it("keeps each employee, project, date, and hours row separate across sheets", () => {
    const parsed = parseTimesheet(workbookBuffer([
      { name: "Piet", rows: [["Fecha", "Proyecto", "Horas", "Trabajador"], ["06/10/2026", "Finca Lisa", 8, "Piet"]] },
      { name: "Colaborador", rows: [["Datum", "Project", "Uren", "Werknemer"], ["07/10/2026", "Xixona", 6.5, "Jose"]] },
    ]), "uren.xlsx");
    expect(parsed?.rows).toEqual([
      { workerHint: "Piet", date: "2026-10-06", projectHint: "Finca Lisa", hours: 8, note: null, warning: null },
      { workerHint: "Jose", date: "2026-10-07", projectHint: "Xixona", hours: 6.5, note: null, warning: null },
    ]);
  });

  it("marks incomplete rows and ignores spreadsheets without a timesheet header", () => {
    const incomplete = parseTimesheet(workbookBuffer([{ name: "Sheet1", rows: [["Date", "Project", "Hours"], ["", "Finca Lisa", 0]] }]), "hours.xlsx");
    expect(incomplete?.rows[0].warning).toMatch(/Datum ontbreekt/);
    expect(incomplete?.warnings.length).toBeGreaterThan(0);
    const unrelated = parseTimesheet(workbookBuffer([{ name: "Prices", rows: [["Product", "Price", "Stock"], ["Panel", 12, 7]] }]), "prices.xlsx");
    expect(unrelated).toBeNull();
  });
});
