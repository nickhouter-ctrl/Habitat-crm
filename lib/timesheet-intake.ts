/** Deterministic reader for employee hours spreadsheets sent to the purchase inbox. */
import * as XLSX from "xlsx";

export type ParsedTimesheetRow = {
  workerHint: string | null;
  date: string | null;
  projectHint: string | null;
  hours: number | null;
  note: string | null;
  warning: string | null;
};

export type ParsedTimesheet = {
  workerHint: string | null;
  period: string | null;
  rows: ParsedTimesheetRow[];
  warnings: string[];
};

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const field = (s: unknown, names: string[]) => names.some((n) => norm(s) === n || norm(s).includes(n));
const DATE = ["fecha", "date", "datum", "dia", "day"];
const PROJECT = ["proyecto", "project", "obra", "werf", "projectnaam", "site"];
const HOURS = ["horas", "hours", "uren", "hour", "tijd", "total horas"];
const NOTE = ["trabajo", "descripcion", "description", "taak", "werkzaamheden", "werkbeschrijving", "concepto", "activity"];

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // Spaanse/European dates are day-first.
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const month = Number(dmy[2]); const day = Number(dmy[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day)
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = XLSX.SSF.parse_date_code(serial);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  return null;
}

function parseHours(value: unknown): number | null {
  const s = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 24 ? Math.round(n * 100) / 100 : null;
}

/** Returns null unless a spreadsheet has recognizable project + hours columns. */
export function parseTimesheet(buffer: Uint8Array, filename: string): ParsedTimesheet | null {
  if (!/\.(xlsx|xls|xlsm)$/i.test(filename)) return null;
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: "array", cellDates: true }); } catch { return null; }
  const allRows: ParsedTimesheetRow[] = [];
  let workerHint: string | null = null;
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "", raw: true });
    const headerIndex = rows.slice(0, 20).findIndex((row) =>
      row.some((c) => field(c, PROJECT)) && row.some((c) => field(c, HOURS)),
    );
    if (headerIndex < 0) continue;
    const topText = rows.slice(0, headerIndex).flat().map((v) => String(v ?? "").trim()).filter(Boolean);
    const sheetWorkerHint = topText.find((v) => /\b(empleado|trabajador|worker|werknemer|arbeider|nombre|naam)\s*[:\-]/i.test(v))?.split(/[:\-]/).slice(1).join(":").trim() || (workbook.SheetNames.length > 1 ? sheetName : null);
    const headers = rows[headerIndex].map(norm);
    const dateIndex = headers.findIndex((h) => field(h, DATE));
    const projectIndex = headers.findIndex((h) => field(h, PROJECT));
    const hoursIndex = headers.findIndex((h) => field(h, HOURS));
    const noteIndex = headers.findIndex((h) => field(h, NOTE));
    const workerIndex = headers.findIndex((h) => ["empleado", "trabajador", "worker", "werknemer", "naam", "nombre", "arbeider"].some((n) => h === n || h.includes(n)));
    const data = rows.slice(headerIndex + 1).filter((r) => r.some((c) => String(c ?? "").trim()));
    const parsedRows: ParsedTimesheetRow[] = data.map((r) => {
      const date = parseDate(r[dateIndex]);
      const projectHint = String(r[projectIndex] ?? "").trim() || null;
      const hours = parseHours(r[hoursIndex]);
      const note = noteIndex >= 0 ? String(r[noteIndex] ?? "").trim() || null : null;
      const warning = !date ? "Datum ontbreekt of is onleesbaar" : !projectHint ? "Project ontbreekt" : !hours ? "Uren ontbreken of zijn ongeldig" : null;
      const rowWorker = workerIndex >= 0 ? String(r[workerIndex] ?? "").trim() || null : null;
      return { workerHint: rowWorker ?? sheetWorkerHint, date, projectHint, hours, note, warning };
    });
    allRows.push(...parsedRows);
    workerHint ??= sheetWorkerHint;
  }
  if (!allRows.length) return null;
  const warnings = allRows.some((r) => r.warning || !r.workerHint) ? ["Controleer werknemer, datum, project en uren per regel voordat je goedkeurt."] : [];
  return { workerHint, period: null, rows: allRows, warnings };
}
