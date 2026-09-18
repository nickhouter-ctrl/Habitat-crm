/** Meubelonderdelen (+ spiegels/spiegelkasten) naar de website voor de samenstel-pagina. */
import { writeFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";
const SITE = "/Users/nickhouter/projects/Habitat-one";
const TYPES = ["Onderkast", "Bijkast", "Hoge kast", "Fonteinkast", "Fonteinbak", "Wastafel", "Topblad", "Waskom", "Meubelgreep", "Front"];
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id)).then((r) => r.filter((p) => p.category === "Badkamermeubels" || p.category === "Spiegels" || p.category === "Spiegelkasten"));
  const uit: unknown[] = []; const swatch: Record<string, string> = {};
  for (const p of prods) {
    let type: string | null = null, serie = p.subcategory ?? "";
    if (p.category === "Spiegels") type = "Spiegel"; else if (p.category === "Spiegelkasten") type = "Spiegelkast";
    else { const t = TYPES.find((t) => p.name.startsWith(`${t} `)); if (!t) continue; type = t; serie = p.name.slice(t.length + 1); }
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.sortOrder));
    for (const v of vs) {
      if (!v.isActive || !v.sku) continue;
      const o = (v.options ?? {}) as Record<string, string>;
      uit.push({ type, serie, product: p.name, code: v.code, sku: v.sku, kleur: o.kleur ?? null, breedte: o.breedte ?? o.maat ?? null, uitvoering: o.uitvoering ?? null, positie: o.positie ?? null, vorm: o.vorm ?? null, wasbakken: o.wasbakken ?? null, kraangat: o.kraangat ?? null, lades: o.lades ?? null, uitsparingen: o.uitsparingen ?? null, image: v.imageUrl ?? null, images: v.images ?? null, drawing: typeof v.specs?.tekening === "string" ? v.specs.tekening : null });
      if (type === "Onderkast" && o.kleur && v.imageUrl && !swatch[o.kleur]) swatch[o.kleur] = v.imageUrl;
    }
  }
  // Afvoer bij een wastafel/waskom: per wasbak een plug in de kraankleur, sifon optioneel
  const AFVOER: Record<string, string> = { "Klikwaste": "Afvoerplug", "Altijd open waste": "Afvoerplug", "Design sifon": "Sifon", "Design sifon compact": "Sifon" };
  const alle = await db.select().from(products).where(eq(products.brandId, merk.id));
  for (const p of alle) {
    const type = AFVOER[p.name]; if (!type) continue;
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.sortOrder));
    for (const v of vs) {
      if (!v.isActive || !v.sku) continue;
      const o = (v.options ?? {}) as Record<string, string>;
      uit.push({ type, serie: p.name, product: p.name, code: v.code, sku: v.sku, kleur: o.kleur ?? null, breedte: null, uitvoering: null, positie: null, vorm: null, wasbakken: null, kraangat: null, lades: null, uitsparingen: null, image: v.imageUrl ?? null, images: v.images ?? null, drawing: typeof v.specs?.tekening === "string" ? v.specs.tekening : null });
    }
  }
  writeFileSync(`${SITE}/tmp-data/brauer_meubels.json`, JSON.stringify({ onderdelen: uit, kleuren: swatch }, null, 1));
  console.log(`meubelonderdelen naar site: ${uit.length}, kleurstalen: ${Object.keys(swatch).length}`);
  process.exit(0);
}
main();
