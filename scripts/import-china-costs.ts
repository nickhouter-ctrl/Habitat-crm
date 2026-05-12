/**
 * One-off: import landed-cost data for the China-sourced products from the
 * supplier cost spreadsheets the owner maintains:
 *
 *   ~/Downloads/Kostprijs magic stone.xlsx   — Magic Stone wall panels
 *   ~/Downloads/KKR kostprijs.xlsx            — KingKonree bathroom articles
 *
 * For each product we set:
 *   purchaseCostEur — the factory price in EUR (FOB)
 *   otherCostEur    — import + handling on top (so the breakdown adds up)
 *   costEur         — the all-in landed cost = purchase + import/handling
 *
 * We never touch stock or sales price (those stay sourced from Holded).
 *
 *   DRY RUN:   npx tsx scripts/import-china-costs.ts
 *   APPLY:     npx tsx scripts/import-china-costs.ts --apply
 */
import os from "node:os";
import path from "node:path";

import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const HOME = os.homedir();
const MS_FILE = path.join(HOME, "Downloads", "Kostprijs magic stone.xlsx");
const KKR_FILE = path.join(HOME, "Downloads", "KKR kostprijs.xlsx");

/** Normalise a SKU/code for matching: upper-case, collapse separators. */
function normSku(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\s._/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function normName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

type CostRec = {
  sku: string | null;
  name: string;
  purchaseEur: number;
  landedEur: number;
  source: string;
};

const bySku = new Map<string, CostRec>();
const byName = new Map<string, CostRec>();

function record(rec: CostRec) {
  if (rec.sku) bySku.set(rec.sku, rec); // later sheets overwrite earlier (more recent order wins)
  byName.set(normName(rec.name), rec);
}

// --- Magic Stone (single sheet "2e order") ---
{
  const wb = XLSX.readFile(MS_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  for (const r of rows.slice(1)) {
    const no = num(r[0]);
    if (no == null) continue;
    const item = String(r[1] ?? "").replace(/\s+/g, " ").trim(); // "MS 001 Concrete Board"
    const m = item.match(/^MS[\s-]*0*(\d+)/i);
    const sku = m ? `MS-${m[1].padStart(3, "0")}` : null;
    const purchaseEur = num(r[11]); // "Prijs per plaat EU"
    const landedEur = num(r[13]); // "inkoop inclusief importkosten" = purchase * 1.15 * 1.4
    if (purchaseEur == null || landedEur == null) continue;
    record({ sku, name: item, purchaseEur, landedEur, source: "MagicStone/2e order" });
  }
}

// --- KKR ("1e order" then "2e order" — 2e is the latest, so it wins) ---
{
  const wb = XLSX.readFile(KKR_FILE);
  for (const sheetName of ["1e order", "2e order"]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
    const header = rows[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    const skuCol = header.findIndex((h) => h === "sku");
    const eurCol = header.findIndex((h) => h === "eur");
    const landedCol = header.findIndex((h) => h.startsWith("inkoop inclusief"));
    const nameCol = header.findIndex((h) => h === "product");
    if (skuCol < 0 || eurCol < 0 || landedCol < 0) {
      console.warn(`! KKR sheet "${sheetName}": couldn't find columns`, { skuCol, eurCol, landedCol });
      continue;
    }
    for (const r of rows.slice(1)) {
      const sku = normSku(r[skuCol]);
      const purchaseEur = num(r[eurCol]);
      const landedEur = num(r[landedCol]);
      const name = String(r[nameCol] ?? "").trim();
      if (!sku || purchaseEur == null || landedEur == null) continue;
      record({ sku, name, purchaseEur, landedEur, source: `KKR/${sheetName}` });
    }
  }
}

console.log(`Parsed cost rows: ${bySku.size} by SKU, ${byName.size} by name.\n`);

async function main() {
const all = await db
  .select({
    id: products.id,
    name: products.name,
    sku: products.sku,
    collection: products.collection,
    priceEur: products.priceEur,
    costEur: products.costEur,
    purchaseCostEur: products.purchaseCostEur,
  })
  .from(products);

let matched = 0;
const unmatchedProducts: string[] = [];
const usedKeys = new Set<string>();
const updates: { id: string; name: string; purchaseEur: number; otherEur: number; landedEur: number; oldCost: string | null; price: string | null; via: string }[] = [];

for (const p of all) {
  const skuKey = normSku(p.sku);
  let rec = skuKey ? bySku.get(skuKey) : undefined;
  let via = "sku";
  if (!rec) {
    rec = byName.get(normName(p.name));
    via = "name";
  }
  if (!rec) {
    unmatchedProducts.push(`${p.sku ?? "—"}  ·  ${p.name}`);
    continue;
  }
  matched++;
  usedKeys.add(rec.sku ?? `name:${normName(rec.name)}`);
  const otherEur = Math.round((rec.landedEur - rec.purchaseEur) * 100) / 100;
  updates.push({
    id: p.id,
    name: p.name,
    purchaseEur: Math.round(rec.purchaseEur * 100) / 100,
    otherEur,
    landedEur: Math.round(rec.landedEur * 100) / 100,
    oldCost: p.costEur,
    price: p.priceEur,
    via,
  });
}

console.log(`Products in CRM: ${all.length}  ·  matched to a cost row: ${matched}\n`);
console.log("=== WILL UPDATE ===");
for (const u of updates) {
  const oldMargin = u.price && u.oldCost ? Math.round((1 - Number(u.oldCost) / Number(u.price)) * 100) : null;
  const newMargin = u.price ? Math.round((1 - u.landedEur / Number(u.price)) * 100) : null;
  console.log(
    `${u.name}\n  via ${u.via} | aankoop €${u.purchaseEur} + import/handling €${u.otherEur} = kostprijs €${u.landedEur}` +
      ` | verkoop €${u.price ?? "—"} | marge ${oldMargin ?? "—"}% -> ${newMargin ?? "—"}%`,
  );
}

console.log(`\n=== UNMATCHED CRM PRODUCTS (${unmatchedProducts.length}) — left untouched ===`);
for (const s of unmatchedProducts) console.log("  " + s);

const unusedCostRows = [...bySku.entries()].filter(([k]) => !usedKeys.has(k));
console.log(`\n=== COST ROWS WITH NO MATCHING PRODUCT (${unusedCostRows.length}) ===`);
for (const [k, r] of unusedCostRows) console.log(`  ${k}  ·  ${r.name}  (€${r.purchaseEur} -> €${r.landedEur})  [${r.source}]`);

if (!APPLY) {
  console.log("\n(dry run — re-run with --apply to write these changes)");
  process.exit(0);
}

console.log("\nApplying…");
for (const u of updates) {
  await db
    .update(products)
    .set({
      purchaseCostEur: String(u.purchaseEur),
      otherCostEur: String(u.otherEur),
      freightCostEur: null,
      transportCostEur: null,
      dutyPct: null,
      costEur: String(u.landedEur),
      updatedAt: new Date(),
    })
    .where(eq(products.id, u.id));
}
console.log(`Updated ${updates.length} products.`);
process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
