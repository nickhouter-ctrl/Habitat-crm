/**
 * Prijs de nog-niet-geprijsde wandpanelen op basis van de distributeur-prijslijst
 * 2026 (AGENT PRICE USD/m²), omgerekend naar € met koers 0,847 (afgeleid uit de
 * panelen die we al kenden). Zet purchaseCostEur + costEur (= inkoop × 1,55) en
 * de basisafmeting, zodat ze mét alle maten in de brochure komen. Serie-inkoop/m²
 * uit scratchpad/usd_clean.json + handmatige overrides voor series met een
 * afwijkende naam in de lijst.
 *
 *   npx tsx scripts/price-missing-from-list.ts            (dry-run)
 *   npx tsx scripts/price-missing-from-list.ts --apply
 */
import "./load-env";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";

import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const RATE = 0.847, COST_MULTIPLIER = 1.55;
const SP = "/private/tmp/claude-501/-Users-nickhouter/62b90579-6af5-4e12-865b-f83ad4e1d6d3/scratchpad";
const r2 = (n: number) => Math.round(n * 100) / 100;

const usd: Record<string, number> = JSON.parse(readFileSync(`${SP}/usd_clean.json`, "utf8"));
// Handmatige overrides (naam wijkt af in de lijst): USD/m².
const OVERRIDE: Record<string, number> = {
  "Roman Pillar": 22.31, "Skyline Stone": 16.04, "Zen Wood Panel": 18.80, "Cement Board": 15.12,
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pmap = new Map<string, number>();
for (const [k, v] of Object.entries(usd)) pmap.set(norm(k), v);
function seriesUsd(cat: string): number | null {
  if (OVERRIDE[cat] != null) return OVERRIDE[cat];
  const k = norm(cat);
  if (pmap.has(k)) return pmap.get(k)!;
  for (const [n, v] of pmap) if (k === n || (k.length >= 6 && (k.startsWith(n) || n.startsWith(k)))) return v;
  return null;
}
const areaOf = (l: string) => { const m = String(l).match(/(\d{2,4})\D+(\d{2,4})/); return m ? (+m[1] * +m[2]) / 1e6 : null; };
function baseInfo(r: { w: unknown; h: unknown; addl: unknown }) {
  const w = Number(r.w), h = Number(r.h);
  if (w > 0 && h > 0) return { area: (w * h) / 1e6, w, h };
  const s = Array.isArray(r.addl) ? (r.addl as Array<{ label?: string }>) : [];
  let best = 0, bw: number | null = null, bh: number | null = null;
  for (const x of s) { const m = String(x.label ?? "").match(/(\d{2,4})\D+(\d{2,4})/); if (!m) continue; const a = (+m[1] * +m[2]) / 1e6; if (a > best) { best = a; bw = Math.max(+m[1], +m[2]); bh = Math.min(+m[1], +m[2]); } }
  return { area: best || null, w: bw, h: bh };
}

async function main() {
  const rows = await db.select({ id: products.id, sku: products.sku, name: products.name, cat: products.category, w: products.widthMm, h: products.heightMm, cost: products.costEur, price: products.priceEur, addl: products.additionalSizes })
    .from(products).where(and(eq(products.collection, "Wandpanelen"), eq(products.isActive, true)));
  const missing = rows.filter((r) => !(Number(r.cost) > 0) && Number(r.price) > 0 && r.sku);

  let done = 0; const noSeries = new Set<string>(); const perCat = new Map<string, number>();
  for (const r of missing) {
    const u = seriesUsd(r.cat ?? ""); if (u == null) { noSeries.add(r.cat ?? "?"); continue; }
    const { area, w, h } = baseInfo(r); if (!area) continue;
    const perM2 = u * RATE;
    const newPur = r2(perM2 * area), newCost = r2(newPur * COST_MULTIPLIER);
    done++; perCat.set(r.cat!, (perCat.get(r.cat!) ?? 0) + 1);
    if (APPLY) {
      const set: Record<string, unknown> = { purchaseCostEur: String(newPur), costEur: String(newCost), updatedAt: new Date() };
      if (!(Number(r.w) > 0) && w) set.widthMm = String(w);
      if (!(Number(r.h) > 0) && h) set.heightMm = String(h);
      await db.update(products).set(set).where(eq(products.id, r.id));
    }
  }
  console.log(`${done} panelen geprijsd uit de lijst (${perCat.size} series).`);
  console.log("Niet in lijst (overgeslagen):", [...noSeries].join(", ") || "—");
  console.log(APPLY ? "→ WEGGESCHREVEN." : "→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
