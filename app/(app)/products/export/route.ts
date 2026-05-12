import ExcelJS from "exceljs";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { auth } from "@/auth";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Niet ingelogd.", { status: 401 });

  const url = new URL(req.url);
  const collection = (url.searchParams.get("collection") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();

  const rows = await db.query.products.findMany({
    where: and(
      collection ? eq(products.collection, collection) : undefined,
      q ? or(ilike(products.name, `%${q}%`), ilike(products.category, `%${q}%`), ilike(products.sku, `%${q}%`)) : undefined,
    ),
    orderBy: [asc(products.collection), asc(products.category), asc(products.name)],
    limit: 5000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name ?? "Habitat One";
  const ws = wb.addWorksheet("Producten", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
  });

  // Title rows.
  const lastCol = 12 + DISCOUNTS.length * 2;
  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${COMPANY.wordmark1 ?? "HABITAT"} ${COMPANY.wordmark2 ?? "ONE"} — Prijslijst & kortingsstaffel`;
  titleCell.font = { bold: true, size: 16, color: { argb: BROWN } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, lastCol);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${rows.length} producten${collection ? ` · ${collection}` : ""}${q ? ` · zoek "${q}"` : ""} · ${new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })} · "Marge %" = winst t.o.v. de kostprijs`;
  subCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

  const header = [
    "Collectie", "Categorie", "Naam", "SKU", "Eenheid", "Voorraad",
    "Aankoopprijs", "Kostprijs", "Verkoopprijs", "Winst €", "Marge %", "Max. korting %",
    ...DISCOUNTS.flatMap((d) => [`Prijs −${d}%`, `Winst −${d}%`]),
  ];
  const headerRow = ws.addRow(header); // row 3
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BROWN } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFFFFFFF" } } };
  });
  headerRow.height = 30;

  const moneyCols = new Set([7, 8, 9, 10, ...DISCOUNTS.flatMap((_, i) => [13 + i * 2, 14 + i * 2])]);
  const pctCols = new Set([11, 12]);
  const winstDiscCols = new Set(DISCOUNTS.map((_, i) => 14 + i * 2));

  rows.forEach((p, idx) => {
    const cost = p.costEur != null ? Number(p.costEur) : null;
    const price = p.priceEur != null ? Number(p.priceEur) : null;
    const purchase = p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null;
    const stock = p.stockQty != null ? Number(p.stockQty) : null;
    const profit = price != null && cost != null ? r2(price - cost) : null;
    const marginPct = price != null && cost != null && cost > 0 ? r2(((price - cost) / cost) * 100) : null;
    const breakEven = price != null && cost != null && price > 0 ? Math.max(0, r2((1 - cost / price) * 100)) : null;
    const discCols: (number | null)[] = DISCOUNTS.flatMap((d) => {
      if (price == null) return [null, null];
      const dp = r2(price * (1 - d / 100));
      return [dp, cost != null ? r2(dp - cost) : null];
    });
    const row = ws.addRow([
      p.collection ?? "", p.category ?? "", p.name, p.sku ?? "", p.unit ?? "", stock,
      purchase, cost, price, profit, marginPct, breakEven, ...discCols,
    ]);
    const zebra = idx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
      cell.alignment = { vertical: "middle" };
      if (moneyCols.has(colNumber)) { cell.numFmt = EUR_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
      if (pctCols.has(colNumber)) { cell.numFmt = PCT_FMT; cell.alignment = { vertical: "middle", horizontal: "right" }; }
      if (colNumber === 3) cell.font = { bold: true };
      if (colNumber === 11 && typeof cell.value === "number") cell.font = { bold: true, color: { argb: GREEN } }; // Marge %
      // Highlight negative remaining profit at a discount.
      if (winstDiscCols.has(colNumber) && typeof cell.value === "number" && cell.value < 0) {
        cell.font = { bold: true, color: { argb: RED } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
      }
    });
  });

  ws.columns.forEach((col, i) => {
    const widths = [22, 22, 42, 16, 9, 9, 13, 12, 13, 11, 10, 14, ...DISCOUNTS.flatMap(() => [12, 13])];
    col.width = widths[i] ?? 12;
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: lastCol } };

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
