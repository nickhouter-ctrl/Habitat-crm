import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ id: products.id, axes: products.optionAxes }).from(products).where(eq(products.brandId, merk.id));
  for (const r of rows) {
    const axes = (r.axes ?? []).map((a) => ({ ...a, values: a.values.map(({ imageUrl: _i, ...w }) => w) }));
    await db.update(products).set({ optionAxes: axes, imageUrl: null }).where(eq(products.id, r.id));
  }
  console.log(`plaatjes gewist bij ${rows.length} producten`);
  process.exit(0);
}
main();
