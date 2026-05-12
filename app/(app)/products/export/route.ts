import ExcelJS from "exceljs";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { auth } from "@/auth";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products, type Product } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCOUNTS = [10, 20, 30, 40, 50];
const r2 = (n: number) => Math.round(n * 100) / 100;
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const BROWN = argb(COMPANY.brown ?? "#3a2a20");
const CREAM = argb(COMPANY.cream ?? "#f3efe9");
const RED = "FFB91C1C";
const RED_BG = "FFFDECEC";
const GREEN = "FF166534";
const EUR_FMT = '#,##0.00 "€"';
const PCT_FMT = '0.0 "%"';

const HEADER = [
  "Collectie", "Categorie", "Naam", "SKU", "Eenheid", "Voorraad",
  "Aankoopprijs", "Kostprijs", "Verkoopprijs", "Winst €", "Marge %", "Max. korting %",
  ...DISCOUNTS.flatMap((d) => [`Prijs −${d}%`, `Winst −${d}%`]),
];
const LAST_COL = HEADER.length;
const MONEY_COLS = new Set([7, 8, 9, 10, ...DISCOUNTS.flatMap((_, i) => [13 + i * 2, 14 + i * 2])]);
const PCT_COLS = new Set([11, 12]);
const WINST_DISC_COLS = new Set(DISCOUNTS.map((_, i) => 14 + i * 2));
const COL_WIDTHS = [22, 22, 42, 16, 9, 9, 13, 12, 13, 11, 10, 14, ...DISCOUNTS.flatMap(() => [12, 13])];

function safeSheetName(name: string, used: Set<string>): string {
  let n = (name || "Overig").replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Overig";
  let base = n;
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

function rowValues(p: Product): (string | number | null)[] {
  const cost = p.costEur != null ? Number(p.costEur) : null;
  const price = p.priceEur != null ? Number(p.priceEur) : null;
  const purchase = p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null;
  const stock = p.stockQty != null ? Number(p.stockQty) : null;
  const profit = price != null && cost != null ? r2(price - cost) : null;
  const marginPct = price != null && cost != null && price > 0 ? r2(((price - cost) / price) * 100) : null;
  const breakEven = marginPct; // korting wordt over de verkoopprijs gerekend → zelfde getal
  const disc = DISCOUNTS.flatMap((d) => {
    if (price == null) return [null, null];
    const dp = r2(price * (1 - d / 100));
    return [dp, cost != null ? r2(dp - cost) : null];
  });
  return [
    p.collection ?? "", p.category ?? "", p.name, p.sku ?? "", p.unit ?? "", stock,
    purchase, cost, price, profit, marginPct, breakEven, ...disc,
  ];
}

function buildSheet(wb: ExcelJS.Workbook, sheetName: string, titleSuffix: string, rows: Product[], usedNames: Set<string>) {
  const ws = wb.addWorksheet(safeSheetName(sheetName, usedNames), {
    views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
  });
  ws.mergeCells(1, 1, 1, LAST_COL);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${COMPANY.wordmark1 ?? "HABITAT"} ${COMPANY.wordmark2 ?? "ONE"} — Prijslijst & kortingsstaffel — ${titleSuffix}`;
  titleCell.font = { bold: true, size: 16, color: { argb: BROWN } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, LAST_COL);
  ws.getCell(2, 1).value = `${rows.length} producten · ${new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })} · "Marge %" = winst als % van de verkoopprijs = de maximale korting voor break-even`;
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

  const headerRow = ws.addRow(HEADER); // row 3
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BROWN } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 30;

  const sorted = [...rows].sort((a, b) =>
    (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name),
  );
  let lastCat: string | null = null;
  let zebra = false;
  for (const p of sorted) {
    const cat = (p.category ?? "Zonder categorie").trim() || "Zonder categorie";
    if (cat !== lastCat) {
      lastCat = cat;
      zebra = false;
      const rowIdx = ws.rowCount + 1;
      ws.mergeCells(rowIdx, 1, rowIdx, LAST_COL);
      const c = ws.getCell(rowIdx, 1);
      c.value = `▸  ${cat}`;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      c.font = { bold: true, color: { argb: BROWN }, size: 11 };
      c.alignment = { vertical: "middle" };
      ws.getRow(rowIdx).height = 20;
    }
    const row = ws.addRow(rowValues(p));
    zebra = !zebra;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
      cell.alignment = { vertical: "middle" };
      if (MONEY_COLS.has(colNumber)) { cell.numFmt = EUR_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
      if (PCT_COLS.has(colNumber)) { cell.numFmt = PCT_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
      if (colNumber === 3) cell.font = { bold: true };
      if (colNumber === 11 && typeof cell.value === "number") cell.font = { bold: true, color: { argb: GREEN } };
      if (WINST_DISC_COLS.has(colNumber) && typeof cell.value === "number" && cell.value < 0) {
        cell.font = { bold: true, color: { argb: RED } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
      }
    });
  }

  ws.columns.forEach((col, i) => { col.width = COL_WIDTHS[i] ?? 12; });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST_COL } };
  return ws;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Niet ingelogd.", { status: 401 });

  const url = new URL(req.url);
  const collection = (url.searchParams.get("collection") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();

  const rows = (await db.query.products.findMany({
    where: and(
      collection ? eq(products.collection, collection) : undefined,
      q ? or(ilike(products.name, `%${q}%`), ilike(products.category, `%${q}%`), ilike(products.sku, `%${q}%`)) : undefined,
    ),
    orderBy: [asc(products.collection), asc(products.category), asc(products.name)],
    limit: 5000,
  })) as Product[];

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name ?? "Habitat One";

  const byCollection = new Map<string, Product[]>();
  for (const p of rows) {
    const k = (p.collection ?? "Overig").trim() || "Overig";
    if (!byCollection.has(k)) byCollection.set(k, []);
    byCollection.get(k)!.push(p);
  }

  const used = new Set<string>();
  // One overview sheet with everything (unless a single collection is already filtered).
  if (byCollection.size > 1) {
    buildSheet(wb, "Alle producten", `alle producten${q ? ` · zoek "${q}"` : ""}`, rows, used);
  }
  for (const [coll, prods] of [...byCollection.entries()].sort()) {
    buildSheet(wb, coll, coll + (q ? ` · zoek "${q}"` : ""), prods, used);
  }

  const ab = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `producten${collection ? "-" + collection.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}-${stamp}.xlsx`;
  return new Response(ab as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
