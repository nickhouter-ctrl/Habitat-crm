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

// Trailing SKU-pattern (KKR-XXX of MS-XXX aan 't eind)
const TRAIL_SKU = /\s+[-–—]?\s*[A-Z]{2,5}-[A-Z0-9-]+$/;
// Trailing brand-suffix (" - KKR", " - MS" of "KKR" aan 't eind zonder hyphen)
const TRAIL_BRAND = /\s+[-–—]\s*(KKR|MS|WB|DR)\b\s*$/i;

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function strip(name: string, sku: string | null): string {
  let s = name.trim();
  // 1. Verwijder exacte SKU overal in de naam (ook midden, bv. voor "(resin)")
  if (sku) {
    const reExact = new RegExp(`\\s*[-–—]?\\s*${escRe(sku)}\\b`, "gi");
    s = s.replace(reExact, "").replace(/\s+/g, " ").trim();
  }
  // 2. Strip resterende trailing SKU-patronen
  while (TRAIL_SKU.test(s)) {
    s = s.replace(TRAIL_SKU, "").trim();
  }
  // 3. Strip trailing brand-suffix (KKR / MS / WB / DR los)
  while (TRAIL_BRAND.test(s)) {
    s = s.replace(TRAIL_BRAND, "").trim();
  }
  // 4. Cleanup dangling dashes en dubbele spaties
  s = s.replace(/\s*[-–—]\s*$/, "").replace(/\s+/g, " ").trim();
  return s;
}

async function main() {
  const all = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products);

  const changes: Array<{ id: string; sku: string | null; was: string; becomes: string }> = [];
  for (const p of all) {
    const c = strip(p.name, p.sku);
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
