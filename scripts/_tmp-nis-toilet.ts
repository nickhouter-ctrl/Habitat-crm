/** Inbouwnissen samenvoegen (145 = 30×30, 146 = 60×30), codes 228 = doucherek, toilet Tornado op zijn plek. */
import { eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
async function main() {
  const vs = await db.select().from(productVariants).where(sql`${productVariants.code} ~* '^(5-[A-Z]+-(145|146|228)|AE-NIB[A-Z0-9]+|TL-TOHW)$'`);
  const prodIds = [...new Set(vs.map((v) => v.productId))];
  const ps = await db.select().from(products).where(inArray(products.id, prodIds));
  const byCode = (re: RegExp) => vs.filter((v) => re.test(v.code));
  // 1. codes 228: doucherek
  const p228 = ps.find((p) => byCode(/-228$/).some((v) => v.productId === p.id))!;
  await db.update(products).set({ name: "Doucherek hangend met glasklem", subcategory: "Om op te bergen", updatedAt: new Date() }).where(eq(products.id, p228.id));
  // 2. nissen: 146 naar het 145-product, maat-optie
  const p145 = ps.find((p) => byCode(/-145$/).some((v) => v.productId === p.id))!;
  const p146 = ps.find((p) => byCode(/-146$/).some((v) => v.productId === p.id)) ?? p145;
  const kleurAs = (p145.optionAxes as ProductOptionAxis[] | null)?.find((a) => a.key === "kleur");
  const assen: ProductOptionAxis[] = [...(kleurAs ? [kleurAs] : []), { key: "maat", label: "Maat", values: [{ value: "30 × 30 cm", label: "30 × 30 cm" }, { value: "60 × 30 cm", label: "60 × 30 cm" }] }];
  for (const v of byCode(/-(145|146)$/)) {
    const o = { ...(v.options ?? {}), maat: v.code.endsWith("145") ? "30 × 30 cm" : "60 × 30 cm" } as Record<string, string>;
    await db.update(productVariants).set({ productId: p145.id, options: o, label: buildVariantLabel(assen, o) || v.code, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
  }
  await db.update(products).set({ name: "Inbouwnis", optionAxes: assen, subcategory: "Nissen", updatedAt: new Date() }).where(eq(products.id, p145.id));
  if (p146.id !== p145.id) await db.delete(products).where(eq(products.id, p146.id));
  await syncVariantProjection(p145.id);
  // 3. nis model B met verlichting: maat-optie (blijft CRM-only, geen foto's)
  const pNIB = ps.find((p) => byCode(/^AE-NIB/).some((v) => v.productId === p.id))!;
  const kleurB = (pNIB.optionAxes as ProductOptionAxis[] | null)?.find((a) => a.key === "kleur");
  const assenB: ProductOptionAxis[] = [...(kleurB ? [kleurB] : []), assen[assen.length - 1]];
  for (const v of byCode(/^AE-NIB/)) { const o = { ...(v.options ?? {}), maat: v.code.includes("3030") ? "30 × 30 cm" : "60 × 30 cm" } as Record<string, string>; await db.update(productVariants).set({ options: o, label: buildVariantLabel(assenB, o) || v.code, updatedAt: new Date() }).where(eq(productVariants.id, v.id)); }
  await db.update(products).set({ name: "Inbouwnis met geïntegreerde verlichting", optionAxes: assenB, subcategory: "Nissen", updatedAt: new Date() }).where(eq(products.id, pNIB.id));
  await syncVariantProjection(pNIB.id);
  // 4. toilet Tornado
  const pT = ps.find((p) => byCode(/^TL-TOHW/).some((v) => v.productId === p.id))!;
  await db.update(products).set({ name: "Tornado hangend toilet met bril", category: "Toiletten", subcategory: "Toiletten hangend", pushToWebsite: true, updatedAt: new Date() }).where(eq(products.id, pT.id));
  await syncVariantProjection(pT.id);
  console.log("klaar:", p228.name, "→ Doucherek;", p145.name, "+", p146.name, "→ Inbouwnis;", pNIB.name, "; ", pT.name, "→ Tornado toilet");
  process.exit(0);
}
main();
