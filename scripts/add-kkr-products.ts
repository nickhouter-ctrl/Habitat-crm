/**
 * Add the KingKonree products from the proforma PDF that aren't in the CRM yet,
 * with cost/price from KKR kostprijs.xlsx ("2e order" sheet).
 *
 *   npx tsx scripts/add-kkr-products.ts          (dry run)
 *   npx tsx scripts/add-kkr-products.ts --apply
 */
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s._/()]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();

// SKU -> { name, category, description } for the new products (collection "Badkamer").
const NEW: Record<string, { name: string; category: string; desc: string }> = {
  "KKR-1264-1": { name: "Wall Hung Basin KKR-1264-1", category: "Wastafels", desc: "Design white · 1202×455×80mm · solid surface · matt · 2 kraangaten · 1 afvoer" },
  "KKR-1261-1": { name: "Wall Hung Basin KKR-1261-1", category: "Wastafels", desc: "Design white · 702×452×80mm · solid surface · matt · 1 kraangat · 1 afvoer" },
  "KKR-PU217": { name: "Basin Drainage Whole Set -C + solid surface cover KKR-PU217", category: "Afvoeren", desc: "Brushed Bronze · past op KKR-H5060-D / 1264-1 / 1261-1" },
  "KKR-B051-A": { name: "Bathtub KKR-B051-A", category: "Baden", desc: "Design white · 1780×785×590mm · solid surface · matt" },
  "KKR-B008-B": { name: "Bathtub KKR-B008-B", category: "Baden", desc: "Design white · 1750×832×550mm · solid surface · matt" },
  "KKR-PU9": { name: "Bathtub Drainage + Solid Surface Drain Cover KKR-PU9", category: "Afvoeren", desc: "Design white · past op KKR-B051-A / B008-B · 75mm" },
  "KKR-PU9-RESIN": { name: "Bathtub Drainage + Resin Drain Cover KKR-PU9 (resin)", category: "Afvoeren", desc: "Past op KKR-B051 · 75mm" },
  "KKR-B051": { name: "Bathtub KKR-B051", category: "Baden", desc: "Gold · 1865×840×595mm · resin · glossy" },
  "KKR-B-RACK09": { name: "Bathtub Rack KKR-B-RACK09", category: "Badaccessoires", desc: "Design white · 850×220×40mm · solid surface · matt" },
  "KKR-H7072-D": { name: "Cabinet Basin KKR-H7072-D", category: "Wastafels", desc: "Design white · 1829×560×30mm · met overloop · 2 kraangaten" },
  "KKR-H7036": { name: "Cabinet Basin KKR-H7036", category: "Wastafels", desc: "Design white · 914×560×30mm · met overloop · 1 kraangat" },
  "KKR-PU005": { name: "Basin Drainage Whole Set -C + solid surface cover KKR-PU005", category: "Afvoeren", desc: "Brushed Bronze · past op KKR-H7072-D / H7036" },
  "KKR-2124": { name: "Countertop Basin KKR-2124", category: "Wastafels", desc: "Design white · 500×330×145mm · solid surface · matt" },
  "KKR-1169": { name: "Countertop Basin KKR-1169", category: "Wastafels", desc: "Design white · 500×350×140mm · solid surface · matt" },
  "KKR-1507": { name: "Countertop Basin KKR-1507", category: "Wastafels", desc: "Design white · 400×400×320mm · solid surface · matt" },
  "KKR-1908": { name: "Freestanding Basin KKR-1908", category: "Wastafels", desc: "Design white · 450×450×850mm · solid surface · matt" },
  "KKR-PD032": { name: "Freestanding Basin Drainage Set KKR-PD032", category: "Afvoeren", desc: "Brushed Bronze · past op KKR-1908 · 800mm pijp" },
  "KKR-A110": { name: "Translucent Acrylic Solid Surface Sheet KKR-A110", category: "Solid surface platen", desc: "Glossy · 2440×1220×10mm" },
  "KKR-A025": { name: "Translucent Acrylic Solid Surface Sheet KKR-A025", category: "Solid surface platen", desc: "Matt · 2440×1220×10mm" },
  "KKR-A001": { name: "Translucent Acrylic Solid Surface Sheet KKR-A001", category: "Solid surface platen", desc: "Matt · 2440×1220×10mm" },
  "KKR-A027": { name: "Translucent Acrylic Solid Surface Sheet KKR-A027", category: "Solid surface platen", desc: "Matt · 2440×1220×10mm" },
  "KKR-A026": { name: "Translucent Acrylic Solid Surface Sheet KKR-A026", category: "Solid surface platen", desc: "Matt · 2440×1220×10mm" },
  "KKR-M8807": { name: "Modified Acrylic Solid Surface Sheet KKR-M8807", category: "Solid surface platen", desc: "Matt · 3660×760×12mm" },
};

async function main() {
  // cost/price from the "2e order" sheet
  const wb = XLSX.readFile(path.join(os.homedir(), "Downloads", "KKR kostprijs.xlsx"));
  const ws = wb.Sheets["2e order"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  const h = (rows[0] as unknown[]).map((x) => String(x ?? "").replace(/\s+/g, " ").trim().toLowerCase());
  const ci = { sku: h.indexOf("sku"), eur: h.indexOf("eur"), verk: h.findIndex((x) => x.startsWith("verkoopprijs")) };
  const xl = new Map<string, { eur: number; verk: number }>();
  for (const r of rows.slice(1)) {
    const sku = normSku(r[ci.sku]);
    const eur = num(r[ci.eur]);
    const verk = num(r[ci.verk]);
    if (sku && eur != null) xl.set(sku, { eur, verk: verk ?? eur * 1.61 * 1.3 });
  }

  const existing = new Set((await db.select({ sku: products.sku }).from(products)).map((p) => normSku(p.sku)));

  const toInsert: (typeof products.$inferInsert)[] = [];
  const skipped: string[] = [];
  for (const [sku, meta] of Object.entries(NEW)) {
    if (existing.has(normSku(sku))) { skipped.push(`${sku} (al in CRM)`); continue; }
    const x = xl.get(normSku(sku));
    if (!x) { skipped.push(`${sku} (geen kostprijs in Excel)`); continue; }
    const purchase = r2(x.eur);
    const cost = r2(purchase * 1.61);
    const freight = r2(purchase * 0.46);
    const other = r2(cost - purchase - freight);
    const price = r2(x.verk);
    const markup = cost > 0 ? r2(((price - cost) / cost) * 100) : null;
    toInsert.push({
      name: meta.name, sku, collection: "Badkamer", category: meta.category, unit: "stuk",
      description: meta.desc, vatRate: 21,
      purchaseCostEur: String(purchase), freightCostEur: String(freight), otherCostEur: String(other),
      transportCostEur: null, dutyPct: null, costEur: String(cost),
      priceEur: String(price), targetMarginPct: markup != null ? String(markup) : null,
      currency: "EUR", isActive: true,
    });
  }

  console.log(`Toe te voegen: ${toInsert.length} producten`);
  for (const p of toInsert) console.log(`  ${p.sku}  ${p.name}  ·  aankoop €${p.purchaseCostEur} → kostprijs €${p.costEur} → verkoop €${p.priceEur} (marge ${p.targetMarginPct}%)`);
  if (skipped.length) console.log(`\nOvergeslagen: ${skipped.join(", ")}`);

  if (!APPLY) { console.log("\n(dry run — --apply om toe te voegen)"); process.exit(0); }
  if (toInsert.length) await db.insert(products).values(toInsert);
  console.log(`\nToegevoegd: ${toInsert.length} producten.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
