/**
 * Strip SKU-codes uit products.name in de CRM-database. De SKU staat al
 * apart op de prijslijst — herhalen in de naam is ruis.
 *
 * Pattern: trailing `[- ]+ABC-123(-X)?` met optionele " - " ervoor.
 *
 *   npx tsx scripts/strip-sku-from-crm-names.ts                (dry run)
 *   npx tsx scripts/strip-sku-from-crm-names.ts --apply
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");

const TRAIL_SKU = /\s+[-–—]?\s*[A-Z]{2,5}-[A-Z0-9-]+$/;
function strip(name: string): string {
  let s = name.trim();
  while (TRAIL_SKU.test(s)) {
    s = s.replace(TRAIL_SKU, "").trim();
  }
  return s;
}

async function main() {
  const all = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products);

  const changes: Array<{ id: string; sku: string | null; was: string; becomes: string }> = [];
  for (const p of all) {
    const c = strip(p.name);
    if (c && c !== p.name) {
      changes.push({ id: p.id, sku: p.sku, was: p.name, becomes: c });
      if (APPLY) {
        await db.update(products).set({ name: c, updatedAt: new Date() }).where(eq(products.id, p.id));
      }
    }
  }
  console.log(`Producten te updaten: ${changes.length}\n`);
  for (const c of changes.slice(0, 80)) {
    console.log(`  ${(c.sku ?? "—").padEnd(14)}  "${c.was}"  →  "${c.becomes}"`);
  }
  if (changes.length > 80) console.log(`  … en ${changes.length - 80} meer`);
  if (!APPLY) console.log("\nDry run — voeg --apply toe.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
