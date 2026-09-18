/**
 * Een CSV of XLSX inlezen als wat het is: kopregels en cellen, als tekst.
 *
 * `parse-sheet.ts` doet dit ook, maar die weet wat een artikelcode en een prijs
 * is en maakt van elke onbekende kolom een keuze-as. Voor een gekochte lijst met
 * bedrijfsgegevens is dat precies het verkeerde gedrag. Dit bestand weet niets
 * over de inhoud: het geeft koppen en rijen terug en laat de betekenis aan de
 * aanroeper.
 *
 * Alles komt eruit als **tekst**, nooit als getal. Een postcode als 03700 en een
 * telefoonnummer als 0034 965… moeten hun voorloopnullen houden; zodra je daar
 * een getal van maakt zijn ze stuk.
 */
import * as XLSX from "xlsx";

export type TableSheet = {
  name: string;
  /** Alle rijen zoals ze in het bestand staan, inclusief de kopregel. */
  rows: string[][];
};

export type ParsedTable = {
  sheets: TableSheet[];
  format: "csv" | "xlsx";
};

/** Scheidingsteken van een CSV: wat het vaakst in de kopregel staat. */
export function detectSeparator(kopregel: string): string {
  const tel = (teken: string) => (kopregel.split(teken).length - 1);
  const kandidaten: [string, number][] = [
    [";", tel(";")],
    [",", tel(",")],
    ["\t", tel("\t")],
  ];
  kandidaten.sort((a, b) => b[1] - a[1]);
  return kandidaten[0][1] > 0 ? kandidaten[0][0] : ",";
}

/** Eén regel opsplitsen, met aanhalingstekens en dubbele quotes erin. */
export function splitDelimited(regel: string, scheider: string): string[] {
  const uit: string[] = [];
  let huidig = "";
  let inQuote = false;
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i];
    if (c === '"') {
      if (inQuote && regel[i + 1] === '"') {
        huidig += '"';
        i++;
      } else inQuote = !inQuote;
    } else if (c === scheider && !inQuote) {
      uit.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  uit.push(huidig);
  return uit.map((v) => v.trim());
}

const cel = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

const isLeeg = (rij: string[]) => rij.every((c) => c === "");

/**
 * Bytes + bestandsnaam → bladen met rijen. `maxRows` is er voor het voorbeeld:
 * de kopregel en een paar rijen inlezen is genoeg om de kolommen te herkennen,
 * en dan hoeft een bestand van 7.000 rijen niet helemaal door het geheugen.
 */
export function parseTable(
  bytes: Uint8Array,
  filename: string,
  opts?: { maxRows?: number },
): ParsedTable {
  const csv = /\.(csv|txt|tsv)$/i.test(filename);
  const max = opts?.maxRows ?? Infinity;

  if (csv) {
    // BOM eraf: Excel zet die voor een UTF-8-CSV en dan heet de eerste kolom "﻿naam".
    const tekst = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    const regels = tekst.split(/\r?\n/);
    const kopregel = regels.find((r) => r.trim() !== "") ?? "";
    const scheider = detectSeparator(kopregel);
    const rows: string[][] = [];
    for (const regel of regels) {
      if (rows.length >= max) break;
      if (regel.trim() === "") continue;
      const rij = splitDelimited(regel, scheider);
      if (!isLeeg(rij)) rows.push(rij);
    }
    return { sheets: [{ name: "csv", rows }], format: "csv" };
  }

  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheets: TableSheet[] = [];
  for (const naam of wb.SheetNames) {
    const ws = wb.Sheets[naam];
    if (!ws) continue;
    const ruw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "", raw: false });
    const rows: string[][] = [];
    for (const r of ruw) {
      if (rows.length >= max) break;
      const rij = (r ?? []).map(cel);
      if (!isLeeg(rij)) rows.push(rij);
    }
    sheets.push({ name: naam, rows });
  }
  return { sheets, format: "xlsx" };
}

/**
 * Kopregel + gegevensrijen uit één blad. `headerRow` is 1-gebaseerd, want dat is
 * wat iemand in Excel ziet; gekochte lijsten hebben vaak een titelregel boven de
 * echte koppen staan.
 */
export function splitHeader(sheet: TableSheet, headerRow = 1): { headers: string[]; rows: string[][] } {
  const i = Math.max(0, Math.min(headerRow - 1, sheet.rows.length - 1));
  const headers = sheet.rows[i] ?? [];
  return { headers, rows: sheet.rows.slice(i + 1) };
}
