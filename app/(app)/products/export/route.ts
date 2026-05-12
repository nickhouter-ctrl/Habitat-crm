import { and, asc, eq, ilike, or } from "drizzle-orm";
import * as XLSX from "xlsx";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCOUNTS = [10, 20, 30, 40, 50];
const r2 = (n: number) => Math.round(n * 100) / 100;
const EUR = '"€"#,##0.00';
const PCT = '0.0"%"';

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

  const header = [
    "Collectie", "Categorie", "Naam", "SKU", "Eenheid", "Voorraad",
    "Aankoopprijs", "Kostprijs", "Verkoopprijs (ex. BTW)", "Winst €", "Marge % (op kostprijs)", "Max. korting % (geen verlies)",
    ...DISCOUNTS.flatMap((d) => [`Prijs −${d}%`, `Winst −${d}%`]),
  ];

  const aoa: (string | number | null)[][] = [header];
  for (const p of rows) {
    const cost = p.costEur != null ? Number(p.costEur) : null;
    const price = p.priceEur != null ? Number(p.priceEur) : null;
    const purchase = p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null;
    const stock = p.stockQty != null ? Number(p.stockQty) : null;
    const profit = price != null && cost != null ? r2(price - cost) : null;
    const marginPct = price != null && cost != null && cost > 0 ? r2(((price - cost) / cost) * 100) : null;
    const breakEven = price != null && cost != null && price > 0 ? Math.max(0, r2((1 - cost / price) * 100)) : null;
    const discCols = DISCOUNTS.flatMap((d) => {
      if (price == null) return [null, null];
      const dp = r2(price * (1 - d / 100));
      return [dp, cost != null ? r2(dp - cost) : null];
    });
    aoa.push([
      p.collection ?? "", p.category ?? "", p.name, p.sku ?? "", p.unit ?? "", stock,
      purchase, cost, price, profit, marginPct, breakEven,
      ...discCols,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths.
  ws["!cols"] = [
    { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 14 }, { wch: 9 }, { wch: 9 },
    { wch: 13 }, { wch: 12 }, { wch: 18 }, { wch: 11 }, { wch: 18 }, { wch: 20 },
    ...DISCOUNTS.flatMap(() => [{ wch: 12 }, { wch: 12 }]),
  ];
  // Number formats per column (1-based after the header).
  const eurCols = new Set([6, 7, 8, 9, ...DISCOUNTS.flatMap((_, i) => [12 + i * 2, 13 + i * 2])]); // 0-based col indices
  const pctCols = new Set([10, 11]);
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || typeof cell.v !== "number") continue;
      if (eurCols.has(C)) cell.z = EUR;
      else if (pctCols.has(C)) cell.z = PCT;
    }
  }
  ws["!autofilter"] = { ref: ws["!ref"]! };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Producten");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `producten${collection ? "-" + collection.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}-${stamp}.xlsx`;
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
