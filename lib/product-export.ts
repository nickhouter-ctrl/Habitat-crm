/**
 * De prijslijst van producten als Excel — met afmeting, m² per stuk en de
 * prijs per m² per formaat. Gedeeld door de export-route en losse scripts.
 */
import ExcelJS from "exceljs";

import { COMPANY } from "@/lib/company";
import type { Product } from "@/lib/db/schema";
import { dateLocale, maakT, type Locale } from "@/lib/i18n";
import { maatRegels, perM2, type MaatRegel } from "@/lib/product-maten";

const DISCOUNTS = [10, 20, 30, 40, 50];
const r2 = (n: number) => Math.round(n * 100) / 100;
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const BROWN = argb(COMPANY.brown ?? "#3a2a20");
const CREAM = argb(COMPANY.cream ?? "#f3efe9");
const RED = "FFB91C1C";
const RED_BG = "FFFDECEC";
const GREEN = "FF166534";
const GREY = "FF6B7280";
const EUR_FMT = '#,##0.00 "€"';
const PCT_FMT = "0.0%";
const M2_FMT = '0.00 "m²"';

const HEADER = [
  "Naam", "SKU", "Afmeting (mm)", "m² per stuk", "Voorraad",
  "Aankoopprijs", "Kostprijs", "Verkoopprijs", "Prijs per m²", "Kostprijs per m²",
  "Winst €", "Marge %", "Max. korting %",
  ...DISCOUNTS.map((d) => `Prijs −${d}%`),
];
const LAST_COL = HEADER.length;
const COL = { naam: 1, afmeting: 3, m2: 4, voorraad: 5, verkoop: 8, perM2: 9, marge: 12 };
const MONEY_COLS = new Set([6, 7, 8, 9, 10, 11, ...DISCOUNTS.map((_, i) => 14 + i)]);
const PCT_COLS = new Set([12, 13]);
const STAFFEL_COLS = new Set(DISCOUNTS.map((_, i) => 14 + i));
const COL_WIDTHS = [46, 13, 15, 11, 9, 12, 12, 13, 13, 13, 11, 9, 11, ...DISCOUNTS.map(() => 12)];

export function safeSheetName(name: string, used: Set<string>): string {
  let n = (name || "Overig").replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Overig";
  const base = n;
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

function regelWaarden(p: Product, m: MaatRegel): (string | number | null)[] {
  const winst = m.prijs != null && m.kost != null ? r2(m.prijs - m.kost) : null;
  const marge = m.prijs != null && m.kost != null && m.prijs > 0 ? Math.round(((m.prijs - m.kost) / m.prijs) * 1000) / 1000 : null;
  return [
    m.hoofd ? p.name : `   ↳ ${p.name}`, m.sku || (m.hoofd ? p.sku ?? "" : ""), m.afmeting ?? "", m.m2,
    m.hoofd && p.stockQty != null ? Number(p.stockQty) : null,
    m.aankoop, m.kost, m.prijs, perM2(m.prijs, m.m2), perM2(m.kost, m.m2),
    winst, marge, marge, // korting over de verkoopprijs → break-even is hetzelfde getal
    ...DISCOUNTS.map((d) => (m.prijs != null ? r2(m.prijs * (1 - d / 100)) : null)),
  ];
}

export function buildPriceSheet(wb: ExcelJS.Workbook, sheetName: string, titleSuffix: string, rows: Product[], usedNames: Set<string>, locale: Locale) {
  const t = maakT(locale);
  const ws = wb.addWorksheet(safeSheetName(sheetName, usedNames), {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
  });
  ws.mergeCells(1, 1, 1, LAST_COL);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${COMPANY.wordmark1 ?? "HABITAT"} ${COMPANY.wordmark2 ?? "ONE"} — ${t("Prijslijst & kortingsstaffel")} — ${titleSuffix}`;
  titleCell.font = { bold: true, size: 16, color: { argb: BROWN } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, LAST_COL);
  ws.getCell(2, 1).value = t("{n} producten · {datum} · Marge = winst als percentage van de verkoopprijs. Maximale korting voor break-even.", { n: rows.length, datum: new Date().toLocaleDateString(dateLocale(locale), { day: "numeric", month: "long", year: "numeric" }) });
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: GREY } };
  ws.mergeCells(3, 1, 3, LAST_COL);
  ws.getCell(3, 1).value = t("Alle prijzen ex btw. Prijs per m² op basis van de afmeting. Ingesprongen regels (↳) zijn andere formaten van hetzelfde product. Rood in de staffel = onder de kostprijs.");
  ws.getCell(3, 1).font = { italic: true, size: 10, color: { argb: GREY } };

  const headerRow = ws.addRow(HEADER.map((label) => {
    const d = label.match(/^Prijs −(\d+)%$/);
    return d ? t("Prijs −{pct}%", { pct: d[1] }) : t(label);
  })); // rij 4
  headerRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col === COL.perM2 ? argb(COMPANY.accent ?? "#b6552d") : BROWN } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 32;

  const sorted = [...rows].sort((a, b) =>
    (a.collection ?? "").localeCompare(b.collection ?? "") || (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));
  let lastCollection: string | null = null;
  let lastCat: string | null = null;
  let zebra = false;
  const banner = (tekst: string, vulling: string, kleur: string, grootte: number, hoogte: number) => {
    const rowIdx = ws.rowCount + 1;
    ws.mergeCells(rowIdx, 1, rowIdx, LAST_COL);
    const c = ws.getCell(rowIdx, 1);
    c.value = tekst;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: vulling } };
    c.font = { bold: true, color: { argb: kleur }, size: grootte };
    c.alignment = { vertical: "middle" };
    ws.getRow(rowIdx).height = hoogte;
  };
  for (const p of sorted) {
    const coll = (p.collection ?? "Overig").trim() || "Overig";
    const cat = (p.category ?? "Zonder categorie").trim() || "Zonder categorie";
    if (coll !== lastCollection) { lastCollection = coll; lastCat = null; zebra = false; banner(`▌  ${coll.toUpperCase()}`, BROWN, "FFFFFFFF", 12, 24); }
    if (cat !== lastCat) { lastCat = cat; zebra = false; banner(`▸  ${cat}`, CREAM, BROWN, 11, 20); }
    zebra = !zebra; // een product en zijn formaten delen dezelfde band
    for (const m of maatRegels(p)) {
      const row = ws.addRow(regelWaarden(p, m));
      const kost = m.kost;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF7F1" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
        cell.alignment = { vertical: "middle" };
        if (MONEY_COLS.has(col)) { cell.numFmt = EUR_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
        if (PCT_COLS.has(col)) { cell.numFmt = PCT_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
        if (col === COL.m2) { cell.numFmt = M2_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
        if (col === COL.afmeting) cell.alignment = { vertical: "middle", horizontal: "center" };
        if (col === COL.naam) cell.font = m.hoofd ? { bold: true } : { color: { argb: GREY } };
        if (col === COL.verkoop || col === COL.perM2) cell.font = { bold: true, color: { argb: col === COL.perM2 ? BROWN : "FF111827" } };
        if (col === COL.marge && typeof cell.value === "number") cell.font = { bold: true, color: { argb: GREEN } };
        if (STAFFEL_COLS.has(col) && typeof cell.value === "number" && kost != null && cell.value < kost) {
          cell.font = { bold: true, color: { argb: RED } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
        }
      });
    }
  }
  ws.columns.forEach((col, i) => { col.width = COL_WIDTHS[i] ?? 12; });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: LAST_COL } };
  return ws;
}
