import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ id: products.id, name: products.name, description: products.description, imageUrl: products.imageUrl }).from(products).where(and(eq(products.brandId, merk.id), eq(products.category, "Douchepanelen")));
  for (const r of rows) {
    const v = await db.select({ code: productVariants.code, label: productVariants.label, price: productVariants.priceEur }).from(productVariants).where(eq(productVariants.productId, r.id)).limit(3);
    console.log(r.name, "|", (r.description ?? "").slice(0, 160), "|", r.imageUrl, v);
  }
  process.exit(0);
}
main();
