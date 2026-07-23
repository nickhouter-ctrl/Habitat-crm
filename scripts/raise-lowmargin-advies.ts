/**
 * Verhoog de adviesprijs (verkoopprijs) van wandpanelen met een te lage marge
 * naar minimaal 65% marge ((advies − kostprijs) / advies), netjes afgerond op
 * € X9,95 incl btw. De trade-prijs beweegt mee (zelfde verhouding tot retail).
 * Alleen panelen met marge < 65%. Afgesproken 21-07-2026.
 *
 *   npx tsx scripts/raise-lowmargin-advies.ts            (dry-run)
 *   npx tsx scripts/raise-lowmargin-advies.ts --apply
 */
import "./load-env";
import { and, eq } from "drizzle-orm";

import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const MIN_MARGE = 0.65;
const r2 = (n: number) => Math.round(n * 100) / 100;
const e = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
// Kleinste € X9,95 (veelvoud van 10 min € 0,05) die ≥ x is.
const niceIncl = (x: number) => Math.ceil((x + 0.05) / 10) * 10 - 0.05;

async function main() {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      cost: products.costEur,
      price: products.priceEur,
      trade: products.tradePriceEur,
      vat: products.vatRate,
    })
    .from(products)
    .where(and(eq(products.collection, "Wandpanelen"), eq(products.isActive, true)));

  const targets = rows
    .filter((r) => Number(r.cost) > 0 && Number(r.price) > 0)
    .map((r) => {
      const cost = Number(r.cost), price = Number(r.price), vat = Number(r.vat) || 21;
      const marge = (price - cost) / price;
      return { ...r, cost, price, vat, marge };
    })
    .filter((r) => r.marge < MIN_MARGE)
    .sort((a, b) => a.marge - b.marge);

  console.log(`${targets.length} panelen met marge < ${MIN_MARGE * 100}% → advies omhoog naar ${MIN_MARGE * 100}%\n`);
  for (const t of targets) {
    const factor = 1 + t.vat / 100;
    const minEx = t.cost / (1 - MIN_MARGE);
    const newIncl = niceIncl(minEx * factor);
    const newEx = r2(newIncl / factor);
    const ratio = t.trade && Number(t.price) ? Number(t.trade) / t.price : 0.8;
    const newTrade = r2(newEx * ratio);
    const newMarge = (newEx - t.cost) / newEx;
    console.log(
      `  ${t.name.padEnd(30)} kost ${e(t.cost).padStart(8)}  advies ${e(t.price).padStart(8)} (${e(t.price * factor)}) ` +
        `→ ${e(newEx).padStart(8)} (${e(newIncl)})  marge ${(t.marge * 100).toFixed(0)}% → ${(newMarge * 100).toFixed(0)}%  | trade ${e(Number(t.trade))} → ${e(newTrade)}`,
    );
    if (APPLY) {
      await db
        .update(products)
        .set({ priceEur: String(newEx), tradePriceEur: String(newTrade), updatedAt: new Date() })
        .where(eq(products.id, t.id));
    }
  }
  console.log(APPLY ? "\n→ WEGGESCHREVEN naar het systeem." : "\n→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
