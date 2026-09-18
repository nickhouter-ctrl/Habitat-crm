/** Spiegels: vorm en kleur uit het achtervoegsel van de code (SP-CT100RHLEZ → rechthoekig, lamellen eiken zwart). */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const VORM: Record<string, string> = { RH: "Rechthoekig", RO: "Rond", ROO: "Rond", OV: "Ovaal", RA: "Rechthoekig", RB: "Rechthoekig, afgerond", OG: "Organisch" };
const KLEUR: Record<string, string> = { LEB: "Lamellen Eiken Bruin", LEN: "Lamellen Eiken Naturel", LEW: "Lamellen Eiken Wit", LEZ: "Lamellen Eiken Zwart", VEG: "Vingerlas Eiken Grijs", GG: "Geborsteld goud", GK: "Geborsteld koper", GM: "Geborsteld gunmetal", NG: "Geborsteld RVS", S: "Mat zwart", A: "Aluminium", Z: "Zwart" };
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id)).then((r) => r.filter((p) => p.category === "Spiegels"));
  for (const p of prods) {
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
    for (const v of vs) {
      const m = v.code.match(/^SP-[A-Z]+\d+(RH|ROO|RO|OV|RA|RB|OG)([A-Z]*)$/i); if (!m) continue;
      const o: Record<string, string> = { maat: v.options?.maat ?? "" };
      o.vorm = VORM[m[1].toUpperCase()] ?? m[1];
      const k = m[2].toUpperCase(); if (k) o.kleur = KLEUR[k] ?? `?${k}`;
      await db.update(productVariants).set({ options: o, isActive: !(o.kleur ?? "").startsWith("?") }).where(eq(productVariants.id, v.id));
      v.options = o;
    }
    const keys = ["kleur", "maat", "vorm"].filter((k) => vs.some((v) => v.options?.[k]));
    const LABEL: Record<string, string> = { kleur: "Kleur", maat: "Maat", vorm: "Vorm" };
    const assen: ProductOptionAxis[] = keys.map((k) => ({ key: k, label: LABEL[k], values: [...new Set(vs.map((v) => v.options?.[k]).filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "nl", { numeric: true })).map((w) => ({ value: w!, label: w! })) })).filter((a) => a.values.length > 1 || a.key === "kleur");
    await db.update(products).set({ optionAxes: assen, imageUrl: null, updatedAt: new Date() }).where(eq(products.id, p.id));
    for (const v of vs) await db.update(productVariants).set({ label: buildVariantLabel(assen, v.options ?? {}) || v.code }).where(eq(productVariants.id, v.id));
    await syncVariantProjection(p.id);
    console.log(`${p.name}: ${assen.map((a) => `${a.key}[${a.values.map((w) => w.value).join("/")}]`).join(" ")}`);
  }
  process.exit(0);
}
main();
