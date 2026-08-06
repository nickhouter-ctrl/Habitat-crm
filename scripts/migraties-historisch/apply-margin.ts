/**
 * Apply a uniform target margin to every product.
 *
 * The Magic Stone supplier sheet sells each plate at landed cost × 2.86, i.e.
 * a margin on selling price of (2.86 − 1) / 2.86 ≈ 65.0%. The owner wants that
 * margin applied across the whole catalogue:
 *   - targetMarginPct = 65 on every product
 *   - priceEur = round(costEur × 2.86, 2) for products that have a landed cost
 *
 *   npx tsx scripts/apply-margin.ts          (dry run)
 *   npx tsx scripts/apply-margin.ts --apply
 */
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const FACTOR = 2.86; // landed cost → selling price
const MARGIN_PCT = Math.round(((FACTOR - 1) / FACTOR) * 1000) / 10; // 65.0
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log(`Factor ${FACTOR}  →  marge ${MARGIN_PCT}% op de verkoopprijs.\n`);

  const all = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      costEur: products.costEur,
      priceEur: products.priceEur,
      targetMarginPct: products.targetMarginPct,
    })
    .from(products);

  let repriced = 0;
  const updates = all.map((p) => {
    const cost = p.costEur != null ? Number(p.costEur) : null;
    const newPrice = cost != null && cost > 0 ? r2(cost * FACTOR) : null;
    if (newPrice != null && String(newPrice) !== String(Number(p.priceEur ?? 0))) repriced++;
    return { ...p, newPrice };
  });

  console.log(`${all.length} producten · targetMarginPct → ${MARGIN_PCT} · ${repriced} krijgen een nieuwe verkoopprijs\n`);
  for (const u of updates) {
    const old = u.priceEur != null ? `€${Number(u.priceEur)}` : "—";
    const nw = u.newPrice != null ? `€${u.newPrice}` : "(geen kostprijs — prijs ongewijzigd)";
    if (u.newPrice == null || old === `€${u.newPrice}`) continue;
    console.log(`  ${u.sku ?? "—"}  ${u.name}:  ${old} → ${nw}  (kostprijs €${Number(u.costEur)})`);
  }

  if (!APPLY) {
    console.log("\n(dry run — voeg --apply toe om door te voeren)");
    process.exit(0);
  }

  for (const u of updates) {
    await db
      .update(products)
      .set({
        targetMarginPct: String(MARGIN_PCT),
        ...(u.newPrice != null ? { priceEur: String(u.newPrice) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, u.id));
  }
  console.log(`\nKlaar: marge gezet op alle ${all.length} producten, ${repriced} verkoopprijzen herberekend.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
