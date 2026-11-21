/**
 * "Brede" urenstaat, zoals Pieter Hoogendijk (Hollandse Meesters) en Luis die
 * sturen: één regel per dag, één kolom per werf, daarachter UREN, PRIJS, TOTAAL.
 *
 *   Hollandsemeesters Luis
 *   WERKZAAMHEDEN | DATUM | SILVSTER | E.Berkers | Oliva | UREN | PRIJS | TOTAAL
 *   airco         | 27-10 | 8        |           |       | 8    | 15    | 120
 *   Totaal        |       | 30       |           |       | 42   |       | 630
 *
 * De gewone lezer (lib/timesheet-intake.ts) verwacht een kolom "project" en
 * herkent dit dus niet. Deze lezer is puur (geen database): wat een kolomnaam
 * betekent beslist de aanroeper met de projectaliassen.
 */
import * as XLSX from "xlsx";

export type WideSite = { label: string; hours: number };
export type WideRow = {
  date: string | null;
  sites: WideSite[];
  /** Kolom UREN: wat er gefactureerd wordt. */
  hours: number | null;
  rate: number | null;
  amount: number | null;
  note: string | null;
};
export type WideTimesheet = {
  /** Woorden die de persoon kunnen aanwijzen: uit de titelregel en de bestandsnaam. */
  workerWords: string[];
  siteLabels: string[];
  rows: WideRow[];
  totalHours: number;
  totalAmount: number | null;
  warnings: string[];
};

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const isHeader = (s: unknown, names: string[]) => names.includes(norm(s).replace(/[^a-z]/g, ""));
const DATE = ["datum", "fecha", "date", "dia"];
const HOURS = ["uren", "horas", "hours", "totaaluren"];
const RATE = ["prijs", "precio", "tarief", "rate", "prijsperuur"];
const AMOUNT = ["totaal", "total", "bedrag", "importe"];
const NOTE = ["werkzaamheden", "omschrijving", "trabajo", "descripcion", "description"];
const r2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Excel slaat "27 oktober" op als 26-10 23:00 UTC (middernacht Madrid). Daarom
 * de kalenderdag in Madrid nemen, niet de UTC-datum. Tekstdatums zijn
 * dubbelzinnig (dag/maand of maand/dag) — die laten we liever aan een mens.
 */
function day(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
  }
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/**
 * Tekstdatum zoals "20/11/2026" of getikt als "20/112026": dag eerst. Alleen
 * geldig als hij binnen een week van de andere (echte) datums op de staat valt —
 * zo kan een maand/dag-verwisseling nooit stil een verkeerde dag opleveren.
 */
function textDay(v: unknown, others: string[]): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]?(\d{4})$/);
  if (!m || others.length === 0) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return null;
  const iso = dt.toISOString().slice(0, 10);
  const near = others.every((o) => Math.abs(Date.parse(`${o}T00:00:00Z`) - t) <= 7 * 86400_000);
  return near ? iso : null;
}

const STOP = new Set(["urenverantwoording", "urenstaat", "urenlijst", "hollandsemeesters", "hollansemeesters", "hollandse", "meesters", "nov", "okt", "okto", "oct", "dec", "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "xlsx", "xls", "xlsm"]);
function words(s: string): string[] {
  return norm(s).split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !w.includes("meester"));
}

export function parseWideTimesheet(buffer: Uint8Array, filename: string): WideTimesheet | null {
  if (!/\.(xlsx|xls|xlsm)$/i.test(filename)) return null;
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buffer, { type: "array", cellDates: true }); } catch { return null; }
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "", raw: true });
    const h = rows.slice(0, 15).findIndex((r) => r.some((c) => isHeader(c, DATE)) && r.some((c) => isHeader(c, HOURS)));
    if (h < 0) continue;
    const head = rows[h];
    const dateIdx = head.findIndex((c) => isHeader(c, DATE));
    const hoursIdx = head.findIndex((c) => isHeader(c, HOURS));
    if (hoursIdx <= dateIdx + 1) continue; // geen werfkolommen ertussen → niet het brede formaat
    const rateIdx = head.findIndex((c, i) => i > hoursIdx && isHeader(c, RATE));
    const amountIdx = head.findIndex((c, i) => i > hoursIdx && isHeader(c, AMOUNT));
    const noteIdx = head.findIndex((c) => isHeader(c, NOTE));
    const siteCols = head.map((c, i) => ({ label: String(c ?? "").trim(), i })).filter((c) => c.i > dateIdx && c.i < hoursIdx && c.label);
    // Een kolom "project" ertussen = de gewone lange lijst (lib/timesheet-intake.ts), niet deze.
    if (siteCols.some((c) => isHeader(c.label, ["project", "proyecto", "obra", "werf", "projectnaam"]))) continue;

    const warnings: string[] = [];
    const out: WideRow[] = [];
    let sheetTotal: number | null = null;
    let sheetTotalHours: number | null = null;
    const rawDates: unknown[] = [];
    for (const r of rows.slice(h + 1)) {
      const first = norm(r[0]);
      if (first.startsWith("totaal") || first.startsWith("total")) {
        sheetTotal = amountIdx >= 0 ? num(r[amountIdx]) : null;
        sheetTotalHours = num(r[hoursIdx]);
        break;
      }
      const sites = siteCols.map((c) => ({ label: c.label, hours: num(r[c.i]) ?? 0 })).filter((s) => s.hours !== 0);
      const hours = num(r[hoursIdx]);
      const date = day(r[dateIdx]);
      if (!date && !hours && sites.length === 0) continue;
      rawDates.push(r[dateIdx]);
      out.push({
        date,
        sites,
        hours,
        rate: rateIdx >= 0 ? num(r[rateIdx]) : null,
        amount: amountIdx >= 0 ? num(r[amountIdx]) : null,
        note: noteIdx >= 0 ? String(r[noteIdx] ?? "").trim() || null : null,
      });
    }
    if (out.length === 0) continue;
    const echte = out.map((x) => x.date).filter((x): x is string => !!x);
    out.forEach((row, i) => { if (!row.date) row.date = textDay(rawDates[i], echte); });

    for (const row of out) {
      const d = row.date ?? "?";
      if (!row.date) warnings.push("Een regel heeft geen leesbare datum");
      if (row.hours == null || row.hours <= 0 || row.hours > 16) warnings.push(`${d}: uren (${row.hours ?? "leeg"}) ongeldig`);
      // Eén werf: die krijgt de gefactureerde UREN, een tikfout in de werfcel (88) doet dan niet ter zake.
      if (row.sites.length > 1 && row.sites.some((s) => s.hours < 0 || s.hours > 16)) warnings.push(`${d}: ongeldige uren in een werfkolom`);
      if (row.sites.length === 0) warnings.push(`${d}: geen werf ingevuld`);
      if (row.rate != null && row.hours != null && row.amount != null && Math.abs(r2(row.rate * row.hours) - row.amount) > 0.01)
        warnings.push(`${d}: ${row.hours} × ${row.rate} is niet ${row.amount}`);
    }
    const dates = out.map((r) => r.date).filter(Boolean);
    if (new Set(dates).size !== dates.length) warnings.push("Dezelfde datum staat er twee keer op");

    const totalHours = r2(out.reduce((s, r) => s + (r.hours ?? 0), 0));
    const rowsAmount = out.every((r) => r.amount != null) ? r2(out.reduce((s, r) => s + (r.amount ?? 0), 0)) : null;
    const totalAmount = sheetTotal ?? rowsAmount;
    if (sheetTotalHours != null && Math.abs(sheetTotalHours - totalHours) > 0.01)
      warnings.push(`De dagen zijn samen ${totalHours} uur, de totaalregel zegt ${sheetTotalHours} uur`);
    if (sheetTotal != null && rowsAmount != null && Math.abs(sheetTotal - rowsAmount) > 0.01)
      warnings.push(`De dagbedragen zijn samen € ${rowsAmount.toFixed(2).replace(".", ",")}, de totaalregel zegt € ${sheetTotal.toFixed(2).replace(".", ",")}`);
    const title = rows.slice(0, h).flat().map((v) => String(v ?? "")).join(" ");
    return {
      workerWords: [...new Set([...words(title), ...words(filename)])],
      siteLabels: siteCols.map((c) => c.label),
      rows: out,
      totalHours,
      totalAmount,
      warnings,
    };
  }
  return null;
}

/**
 * Welke werf krijgt de uren van een dag? Tellen de werfkolommen op tot UREN,
 * dan precies zoals ingevuld. Staat er maar één werf, dan is de werf duidelijk
 * en krijgt die de gefactureerde UREN (Pieter 11-11: werf 8, UREN 9). Bij
 * meerdere werven die niet optellen weten we het niet → null.
 */
export function dagVerdeling(row: WideRow): WideSite[] | null {
  if (row.hours == null || row.sites.length === 0) return null;
  const som = r2(row.sites.reduce((s, x) => s + x.hours, 0));
  if (Math.abs(som - row.hours) <= 0.01) return row.sites;
  if (row.sites.length === 1) return [{ label: row.sites[0].label, hours: row.hours }];
  return null;
}
