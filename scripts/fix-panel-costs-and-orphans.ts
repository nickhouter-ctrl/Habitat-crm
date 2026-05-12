/**
 * 1. Re-sync products from Holded (preserves CRM-side cost data).
 * 2. Fill in missing/invalid landed costs for the Magic Stone wall panels:
 *    - if a sibling panel (same product family + same dimensions) already has a
 *      cost, copy that one;
 *    - otherwise landed cost = purchase price × 1.61 (purchase + 15% China
 *      handling + 40% import), same model as the supplier spreadsheets.
 * 3. Delete CRM products that no longer exist in Holded (or were never in it).
 *
 *   npx tsx scripts/fix-panel-costs-and-orphans.ts          (dry run)
 *   npx tsx scripts/fix-panel-costs-and-orphans.ts --apply
 */
import { eq, inArray } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { holded, holdedListAll } from "../lib/holded/client";
import { pullProductsFromHolded } from "../lib/holded/sync";

const APPLY = process.argv.includes("--apply");
const MULT = 1.61; // purchase → landed cost

const r2 = (n: number) => Math.round(n * 100) / 100;

/** family = product name up to the " - <colour>" suffix. */
function family(name: string): string {
  const i = name.indexOf(" - ");
  return (i === -1 ? name : name.slice(0, i)).replace(/\s+/g, " ").trim().toLowerCase();
}
/** normalise dimensions like "3000mm *600mm" / "2950x1130mm" → "3000x600". */
function dims(desc: string | null): string {
  if (!desc) return "";
  const nums = (desc.match(/\d{2,5}/g) ?? []).slice(0, 2).map(Number);
  if (nums.length < 2) return "";
  return `${nums[0]}x${nums[1]}`;
}

async function main() {
  // 1. Re-sync from Holded.
  const sync = await pullProductsFromHolded();
  console.log("Holded product sync:", sync);

  // 2. Current Holded product ids.
  const remote = await holdedListAll((page) => holded.products.list({ page }));
  const holdedIds = new Set(remote.map((p) => p.id));
  console.log(`Holded has ${holdedIds.size} products.\n`);

  const all = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      description: products.description,
      costEur: products.costEur,
      purchaseCostEur: products.purchaseCostEur,
      otherCostEur: products.otherCostEur,
      holdedProductId: products.holdedProductId,
    })
    .from(products);

  // --- 2a. Panel cost backfill ---
  const panels = all.filter((p) => (p.sku ?? "").toUpperCase().startsWith("MS-"));
  const purch = (p: (typeof panels)[number]) => (p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null);
  const costN = (p: (typeof panels)[number]) => (p.costEur != null ? Number(p.costEur) : null);

  const isGood = (p: (typeof panels)[number]) => {
    const c = costN(p);
    const pu = purch(p);
    return c != null && c > 0 && (pu == null || c >= pu - 0.005);
  };

  // Index "good" panels by family|dims.
  const byKey = new Map<string, (typeof panels)[number]>();
  for (const p of panels) {
    if (!isGood(p)) continue;
    const key = `${family(p.name)}|${dims(p.description)}`;
    if (dims(p.description) && !byKey.has(key)) byKey.set(key, p);
  }

  const costUpdates: { id: string; name: string; sku: string; purchase: number | null; other: number; cost: number; via: string }[] = [];
  for (const p of panels) {
    if (isGood(p)) continue;
    const sib = byKey.get(`${family(p.name)}|${dims(p.description)}`);
    let purchase: number | null;
    let cost: number;
    let via: string;
    if (sib && sib.id !== p.id) {
      purchase = purch(sib);
      cost = costN(sib)!;
      via = `kopie van ${sib.sku} (${family(sib.name)}, ${dims(sib.description)})`;
    } else {
      purchase = purch(p);
      if (purchase == null || purchase <= 0) {
        console.log(`  ? ${p.sku} ${p.name}: geen aankoopprijs — overgeslagen`);
        continue;
      }
      cost = r2(purchase * MULT);
      via = `aankoopprijs × ${MULT}`;
    }
    const other = purchase != null ? r2(cost - purchase) : r2(cost - cost / MULT);
    costUpdates.push({ id: p.id, name: p.name, sku: p.sku!, purchase, other, cost, via });
  }

  console.log(`\n=== PANEL KOSTPRIJZEN: ${costUpdates.length} bij te werken ===`);
  for (const u of costUpdates) {
    console.log(`  ${u.sku}  ${u.name}  →  aankoop €${u.purchase ?? "—"} + import €${u.other} = kostprijs €${u.cost}   [${u.via}]`);
  }

  // --- 2b. Orphans (not in Holded) ---
  const orphans = all.filter((p) => !p.holdedProductId || !holdedIds.has(p.holdedProductId));
  console.log(`\n=== TE VERWIJDEREN (niet in Holded): ${orphans.length} ===`);
  for (const o of orphans) console.log(`  ${o.sku ?? "—"}  ${o.name}  (holdedId: ${o.holdedProductId ?? "—"})`);

  if (!APPLY) {
    console.log("\n(dry run — voeg --apply toe om door te voeren)");
    process.exit(0);
  }

  for (const u of costUpdates) {
    await db
      .update(products)
      .set({
        purchaseCostEur: u.purchase != null ? String(u.purchase) : undefined,
        otherCostEur: String(u.other),
        freightCostEur: null,
        transportCostEur: null,
        dutyPct: null,
        costEur: String(u.cost),
        updatedAt: new Date(),
      })
      .where(eq(products.id, u.id));
  }
  if (orphans.length) {
    await db.delete(products).where(inArray(products.id, orphans.map((o) => o.id)));
  }
  console.log(`\nKlaar: ${costUpdates.length} kostprijzen bijgewerkt, ${orphans.length} producten verwijderd.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
