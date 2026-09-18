import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, axes: products.optionAxes }).from(products).where(and(eq(products.brandId, merk.id), eq(products.pushToWebsite, true)));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const doel = prods.find((p) => p.name === "Edition Thermostatische inbouw regendouche")!;
  const vs = vars.filter((v) => v.productId === doel.id);
  const tel = new Map<string, number>();
  for (const v of vs) { const k = `${v.options?.bediening} | ${v.options?.kleur}`; tel.set(k, (tel.get(k) ?? 0) + 1); }
  console.log("Edition inbouw regendouche — bediening × kleur:"); for (const [k, n] of [...tel.entries()].sort()) console.log("  ", k, n);
  // algemeen: per product, per niet-kleur-as: waarden die niet in álle kleuren bestaan
  console.log("\n--- keuzes die niet in elke kleur bestaan (site-producten):");
  for (const p of prods) {
    const pv = vars.filter((v) => v.productId === p.id);
    const kleuren = [...new Set(pv.map((v) => v.options?.kleur).filter(Boolean))];
    for (const as of (p.axes ?? []).filter((a) => a.key !== "kleur")) {
      const gaten: string[] = [];
      for (const w of as.values) {
        const met = new Set(pv.filter((v) => v.options?.[as.key] === w.value).map((v) => v.options?.kleur));
        const ontbreekt = kleuren.filter((k) => !met.has(k));
        if (ontbreekt.length) gaten.push(`${w.value} ontbreekt in ${ontbreekt.join("/")}`);
      }
      if (gaten.length) console.log(`${p.name} · ${as.label}: ${gaten.join("; ")}`);
    }
  }
  process.exit(0);
}
main();
