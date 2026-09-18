/** Alle Brauer-producten opnieuw projecteren: additionalSizes (prijs/foto/voorraad per uitvoering) uit product_variants. */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
import { syncVariantProjection } from "@/lib/variants-sync";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const ps = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.brandId, merk.id));
  let n = 0;
  for (const p of ps) { await syncVariantProjection(p.id); if (++n % 50 === 0) console.log(`  ${n}/${ps.length}`); }
  console.log(`${n} producten opnieuw geprojecteerd`);
  process.exit(0);
}
main();
