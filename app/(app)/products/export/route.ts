import { huidigeTaal } from "@/lib/i18n/server";
import { isLocale, maakT } from "@/lib/i18n";
import ExcelJS from "exceljs";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products, type Product } from "@/lib/db/schema";
import { weigerRoute } from "@/lib/auth/guards";
import { buildPriceSheet } from "@/lib/product-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opmaak en kolommen: lib/product-export.ts (afmeting, m² per stuk en prijs per m² per formaat). */

export async function GET(req: Request) {
  const nee = await weigerRoute("producten");
  if (nee) return nee;

  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const locale = isLocale(lang) ? lang : await huidigeTaal(), t = maakT(locale);
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
    buildPriceSheet(wb, t("Alle producten"), t("Alle producten"), rows, used, locale);
  }
  for (const [coll, prods] of [...byCollection.entries()].sort()) {
    buildPriceSheet(wb, coll, coll + (q ? ` · zoek "${q}"` : ""), prods, used, locale);
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
