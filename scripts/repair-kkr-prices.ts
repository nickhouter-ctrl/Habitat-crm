/**
 * Re-price the KingKonree (bathroom) products to the actual "verkoopprijs
 * (geen korting)" from KKR kostprijs.xlsx — these run at a lower margin than
 * the 65% used for the Magic Stone panels, so kostprijs × 2,86 is wrong here.
 * The kostprijs / breakdown stays as-is (it already matches the Excel).
 *
 * For products listed in both the "1e order" and "2e order" sheets we take the
 * "1e order" price (the established catalogue price) and report the difference.
 *
 *   npx tsx scripts/repair-kkr-prices.ts          (report only)
 *   npx tsx scripts/repair-kkr-prices.ts --apply
 */
import os from "node:os";
import path from "node:path";

import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function normSku(s: unknown): string {
  return String(s ?? "").toUpperCase().replace(/[\s._/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
}

// sku -> { price1?: from "1e order", price2?: from "2e order" }
const sheetPrices = new Map<string, { price1?: number; price2?: number }>();
{
  const wb = XLSX.readFile(path.join(os.homedir(), "Downloads", "KKR kostprijs.xlsx"));
  for (const sheet of ["1e order", "2e order"] as const) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
    const header = rows[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    const skuCol = header.findIndex((h) => h === "sku");
    const priceCol = header.findIndex((h) => h.startsWith("verkoopprijs"));
    if (skuCol < 0 || priceCol < 0) continue;
    for (const r of rows.slice(1)) {
      const sku = normSku(r[skuCol]);
      const price = num(r[priceCol]);
      if (!sku || price == null || price <= 0) continue;
      const e = sheetPrices.get(sku) ?? {};
      if (sheet === "1e order") e.price1 = price;
      else e.price2 = price;
      sheetPrices.set(sku, e);
    }
  }
}

async function main() {
  const all = await db
    .select({
      id: products.id, name: products.name, sku: products.sku,
      costEur: products.costEur, priceEur: products.priceEur, targetMarginPct: products.targetMarginPct,
    })
    .from(products);

  console.log("SKU | naam | kostprijs | huidige prijs | Excel-prijs | marge% | bron");
  console.log("-".repeat(100));
  const updates: { id: string; price: number; margin: number }[] = [];
  let neg = 0;
  for (const p of all) {
    const e = sheetPrices.get(normSku(p.sku));
    if (!e) continue;
    const price = e.price1 ?? e.price2!;
    const source = e.price1 != null ? (e.price2 != null ? `1e order (2e order zegt €${r2(e.price2)})` : "1e order") : "2e order";
    const cost = num(p.costEur) ?? 0;
    const margin = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;
    if (margin < 0) neg++;
    const cur = num(p.priceEur);
    const needs = cur == null || Math.abs(cur - price) > 0.005 || num(p.targetMarginPct) == null || Math.abs((num(p.targetMarginPct) ?? -1) - margin) > 0.05;
    console.log(
      `${p.sku} | ${p.name} | €${cost} | €${cur ?? "—"} | €${r2(price)} | ${margin}%${margin < 0 ? "  ⚠ NEGATIEF" : ""} | ${source}${needs ? "  (bijwerken)" : ""}`,
    );
    if (needs) updates.push({ id: p.id, price: r2(price), margin });
  }
  console.log("-".repeat(100));
  console.log(`KKR-producten gevonden in de Excel: ${updates.length} bij te werken${neg ? ` · ${neg} met negatieve marge` : ""}`);

  if (!APPLY) {
    console.log("\n(report only — voeg --apply toe om de prijzen terug te zetten naar de Excel)");
    process.exit(0);
  }
  for (const u of updates) {
    await db
      .update(products)
      .set({ priceEur: String(u.price), targetMarginPct: String(u.margin), updatedAt: new Date() })
      .where(eq(products.id, u.id));
  }
  console.log(`\nBijgewerkt: ${updates.length} producten.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
