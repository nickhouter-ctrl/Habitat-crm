/**
 * Verify and normalise the landed-cost / price chain on every product, and
 * cross-check against the supplier spreadsheets.
 *
 * Model (same as the Excels):
 *   aankoop (purchaseCostEur)
 *   + 15% China-handling                        → otherCostEur
 *   + importkosten (= aankoop×1,15×0,40)         → freightCostEur
 *   = kostprijs (costEur) = aankoop × 1,61
 *   verkoopprijs (priceEur) = kostprijs × 2,86  → marge 65,0% op de verkoopprijs
 *
 *   npx tsx scripts/verify-costs.ts          (report only)
 *   npx tsx scripts/verify-costs.ts --apply  (also rewrite the breakdown/prices)
 */
import os from "node:os";
import path from "node:path";

import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const MULT = 1.61; // aankoop → kostprijs
const FACTOR = 2.86; // kostprijs → verkoopprijs
const r2 = (n: number) => Math.round(n * 100) / 100;
const HOME = os.homedir();

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function normSku(s: unknown): string {
  return String(s ?? "").toUpperCase().replace(/[\s._/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
}

// ---- Excel reference data: sku -> { aankoop, landed, verkoop } ----
const excel = new Map<string, { aankoop: number; landed: number; verkoop: number; src: string }>();
{
  // Magic Stone
  const wb = XLSX.readFile(path.join(HOME, "Downloads", "Kostprijs magic stone.xlsx"));
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
  for (const r of rows.slice(1)) {
    if (num(r[0]) == null) continue;
    const m = String(r[1] ?? "").replace(/\s+/g, " ").trim().match(/^MS[\s-]*0*(\d+)/i);
    const sku = m ? `MS-${m[1].padStart(3, "0")}` : null;
    const aankoop = num(r[11]);
    const landed = num(r[13]);
    const verkoop = num(r[15]);
    if (sku && aankoop != null && landed != null && verkoop != null) excel.set(sku, { aankoop, landed, verkoop, src: "magic-stone" });
  }
}
{
  // KKR
  const wb = XLSX.readFile(path.join(HOME, "Downloads", "KKR kostprijs.xlsx"));
  for (const name of ["1e order", "2e order"]) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
    const header = rows[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    const skuCol = header.findIndex((h) => h === "sku");
    const eurCol = header.findIndex((h) => h === "eur");
    const landedCol = header.findIndex((h) => h.startsWith("inkoop inclusief"));
    const verkoopCol = header.findIndex((h) => h.startsWith("verkoopprijs"));
    for (const r of rows.slice(1)) {
      const sku = normSku(r[skuCol]);
      const aankoop = num(r[eurCol]);
      const landed = num(r[landedCol]);
      const verkoop = verkoopCol >= 0 ? num(r[verkoopCol]) : null;
      if (sku && aankoop != null && landed != null) excel.set(sku, { aankoop, landed, verkoop: verkoop ?? landed * FACTOR, src: `kkr/${name}` });
    }
  }
}

async function main() {
  const all = await db
    .select({
      id: products.id, name: products.name, sku: products.sku,
      purchaseCostEur: products.purchaseCostEur, otherCostEur: products.otherCostEur,
      freightCostEur: products.freightCostEur, transportCostEur: products.transportCostEur,
      dutyPct: products.dutyPct, costEur: products.costEur, priceEur: products.priceEur,
      targetMarginPct: products.targetMarginPct,
    })
    .from(products)
    .orderBy(products.sku);

  let withCost = 0, fixed = 0, excelMismatch = 0, noCost = 0;
  const updates: { id: string; sku: string; set: Record<string, string | null> }[] = [];

  console.log("SKU | aankoop | +handling 15% | +importkosten | = kostprijs | verkoopprijs | marge% | Excel-check");
  console.log("-".repeat(110));
  for (const p of all) {
    const purchase = num(p.purchaseCostEur);
    const skuKey = normSku(p.sku);
    if (purchase == null || purchase <= 0) {
      noCost++;
      console.log(`${p.sku ?? "—"} | (geen aankoopprijs) | prijs €${num(p.priceEur) ?? "—"} | marge n.v.t.`);
      continue;
    }
    withCost++;
    const cost = r2(purchase * MULT); // = aankoop × 1,15 × 1,40 ≈ Excel "inkoop incl. importkosten"
    const importk = r2(purchase * 0.46); // "kosten import per plaat" (= aankoop × 1,15 × 0,40)
    const handling = r2(cost - purchase - importk); // 15% China-handling (rest)
    const price = r2(cost * FACTOR);
    const margin = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;

    // Excel cross-check
    let chk = "—";
    const e = excel.get(skuKey);
    if (e) {
      const okA = Math.abs(e.aankoop - purchase) <= 0.02;
      const okL = Math.abs(r2(e.landed) - cost) <= 0.02;
      const okV = Math.abs(r2(e.verkoop) - price) <= 0.02;
      chk = okA && okL && okV ? `✓ Excel(${e.src})` : `⚠ Excel: aankoop €${r2(e.aankoop)}${okA ? "" : "≠"} landed €${r2(e.landed)}${okL ? "" : "≠"} verkoop €${r2(e.verkoop)}${okV ? "" : "≠"} [${e.src}]`;
      if (!okL || !okV) excelMismatch++;
    }

    const curCost = num(p.costEur), curPrice = num(p.priceEur);
    const needsFix =
      curCost == null || Math.abs(curCost - cost) > 0.005 ||
      curPrice == null || Math.abs(curPrice - price) > 0.005 ||
      num(p.otherCostEur) == null || Math.abs((num(p.otherCostEur) ?? -1) - handling) > 0.005 ||
      num(p.freightCostEur) == null || Math.abs((num(p.freightCostEur) ?? -1) - importk) > 0.005 ||
      num(p.transportCostEur) != null || num(p.dutyPct) != null ||
      num(p.targetMarginPct) == null || Math.abs((num(p.targetMarginPct) ?? -1) - 65) > 0.005;
    if (needsFix) {
      fixed++;
      updates.push({
        id: p.id, sku: p.sku ?? "",
        set: {
          otherCostEur: String(handling),
          freightCostEur: String(importk),
          transportCostEur: null,
          dutyPct: null,
          costEur: String(cost),
          priceEur: String(price),
          targetMarginPct: "65",
        },
      });
    }
    console.log(
      `${p.sku} | €${purchase} | €${handling} | €${importk} | €${cost} | €${price} | ${margin}% | ${chk}${needsFix ? "  (bijwerken)" : ""}`,
    );
  }

  console.log("-".repeat(110));
  console.log(`Producten: ${all.length} · met aankoopprijs: ${withCost} · zonder: ${noCost}`);
  console.log(`Bij te werken: ${fixed} · Excel-afwijkingen (landed/verkoop): ${excelMismatch}`);
  console.log(`Marge overal: (2,86 − 1) / 2,86 = ${Math.round(((FACTOR - 1) / FACTOR) * 1000) / 10}% op de verkoopprijs (opslag van ${Math.round((FACTOR - 1) * 100)}% op de kostprijs).`);

  if (!APPLY) {
    console.log("\n(report only — voeg --apply toe om de breakdown/prijzen recht te trekken)");
    process.exit(0);
  }
  for (const u of updates) {
    await db.update(products).set({ ...u.set, updatedAt: new Date() }).where(eq(products.id, u.id));
  }
  console.log(`\nBijgewerkt: ${updates.length} producten.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
