/** Inbouw regendouches per serie samen: bediening (3-weg omstel / drukknoppen / stopkranen / ronde plaat) als keuze. */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const RE = /^(Edition|Carving|Stripe) Thermostatische inbouw regendouche (met 3-weg omstel|met drukknoppen|met stopkranen|rond met 3-weg omstel)$/i;
const WAARDE: Record<string, string> = { "met 3-weg omstel": "3-weg omstel", "met drukknoppen": "Drukknoppen", "met stopkranen": "Stopkranen", "rond met 3-weg omstel": "Rond, 3-weg omstel" };
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  const groepen = new Map<string, typeof prods>();
  for (const p of prods) { const m = p.name.match(RE); if (m) groepen.set(m[1], [...(groepen.get(m[1]) ?? []), p]); }
  for (const [serie, ps] of groepen) {
    const naam = `${serie} Thermostatische inbouw regendouche`;
    const doel = [...ps].sort((a, b) => (a.name.includes("stopkranen") ? -1 : 1))[0];
    console.log(`${naam} ← ${ps.map((p) => p.name).join(" | ")}`);
    for (const p of ps) {
      const bediening = WAARDE[p.name.match(RE)![2].toLowerCase()];
      const vs = await db.select({ id: productVariants.id, options: productVariants.options }).from(productVariants).where(eq(productVariants.productId, p.id));
      for (const v of vs) await db.update(productVariants).set({ productId: doel.id, options: { ...(v.options ?? {}), bediening }, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    }
    await db.update(products).set({ name: naam, imageUrl: null, pushToWebsite: ps.some((p) => p.pushToWebsite), updatedAt: new Date() }).where(eq(products.id, doel.id));
    const weg = ps.filter((p) => p.id !== doel.id).map((p) => p.id);
    if (weg.length) await db.delete(products).where(inArray(products.id, weg));
  }
  process.exit(0);
}
main();
