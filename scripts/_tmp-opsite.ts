import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ name: products.name, category: products.category }).from(products).where(and(eq(products.brandId, merk.id), eq(products.pushToWebsite, true))).orderBy(products.category, products.name);
  const per = new Map<string, string[]>(); for (const r of rows) per.set(r.category ?? "?", [...(per.get(r.category ?? "?") ?? []), r.name]);
  for (const [c, ns] of per) console.log(`${c} (${ns.length}): ${ns.join(" | ")}`);
  process.exit(0);
}
main();
