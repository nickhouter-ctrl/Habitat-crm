/**
 * Zet de kostprijs van de wandpanelen (Magic Stone) op inkoop × 1,55
 * (+15% handling +40% invoerrechten) — afgesproken 21-07-2026.
 *
 * Doet dit via de kostenopbouw zodat de kostprijs klopt én blijft staan als het
 * product later wordt bewerkt (het bewerkscherm herberekent costEur uit de
 * opbouw): otherCostEur = 15% (handling), dutyPct = 40 (invoer), vracht/transport
 * → 0. Resultaat: costEur = inkoop × 1,55. Alleen panelen mét een inkoopprijs.
 *
 *   npx tsx scripts/reprice-wandpanelen-cost.ts           (dry-run)
 *   npx tsx scripts/reprice-wandpanelen-cost.ts --apply
 */
import "./load-env";
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;
const e = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

async function main() {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      pur: products.purchaseCostEur,
      cost: products.costEur,
    })
    .from(products)
    .where(
      and(
        eq(products.collection, "Wandpanelen"),
        eq(products.isActive, true),
        isNotNull(products.purchaseCostEur),
        gt(products.purchaseCostEur, "0"),
      ),
    )
    .orderBy(asc(products.category), asc(products.name));

  console.log(`${rows.length} wandpanelen met inkoopprijs — kostprijs → inkoop × 1,55\n`);
  let changed = 0;
  const preview: string[] = [];
  for (const r of rows) {
    const pur = Number(r.pur);
    const newCost = r2(pur * 1.55);
    const oldCost = r.cost == null ? null : Number(r.cost);
    if (oldCost == null || Math.abs(oldCost - newCost) > 0.005) changed++;
    if (r.category === "Age Stone" || preview.length < 12) {
      preview.push(
        `  ${(r.category ?? "").padEnd(16)} ${r.name.slice(0, 26).padEnd(27)} inkoop ${e(pur).padStart(8)}  kost ${e(oldCost).padStart(8)} → ${e(newCost).padStart(8)}`,
      );
    }
    if (APPLY) {
      await db
        .update(products)
        .set({
          otherCostEur: String(r2(pur * 0.15)), // handling 15%
          dutyPct: "40", // invoerrechten 40%
          freightCostEur: "0",
          transportCostEur: "0",
          costEur: String(newCost),
          updatedAt: new Date(),
        })
        .where(eq(products.id, r.id));
    }
  }
  console.log(preview.join("\n"));
  console.log(`\n${changed} van ${rows.length} krijgen een gewijzigde kostprijs.`);
  console.log(APPLY ? "→ WEGGESCHREVEN." : "→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
