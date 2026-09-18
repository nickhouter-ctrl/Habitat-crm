/** Vergelijk handdouche/houder-opties met de prijslijstnaam; met --toepassen corrigeren + assen herbouwen. */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const pl = JSON.parse(readFileSync("/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad/brauer-prijslijst.json", "utf8")) as Record<string, { naam: string }>;
const LABEL: Record<string, string> = { kleur: "Kleur", handdouche: "Handdouche", houder: "Houder", bediening: "Bediening", uitloop: "Uitloop", afwerking: "Afwerking", model: "Model", positie: "Positie", maat: "Maat", hoofddouche: "Hoofddouche", douchekop: "Douchekop", vulling: "Vulling", glijstang: "Glijstang" };
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const fouten: { v: typeof vars[number]; nieuw: Record<string, string> }[] = [];
  for (const v of vars) {
    const naam = (pl[v.code]?.naam ?? "").toLowerCase(); if (!naam) continue;
    const o = { ...(v.options ?? {}) } as Record<string, string>; const was = JSON.stringify(o);
    if (!o.handdouche && !("glijstang" in o) && !o.houder) continue; // alleen sets die al zo'n keuze dragen
    const hd = /staaf ?handdouche|staafhanddouche/.test(naam) ? "Staafmodel" : /3-standen handdouche|3 standen handdouche/.test(naam) ? "3-standen" : null;
    if (hd && (o.handdouche || /handdouche/.test(naam))) o.handdouche = hd;
    const houder = /glijstang/.test(naam) ? "Glijstang" : /wandhouder/.test(naam) ? "Wandhouder" : null;
    if (houder) { o.houder = houder; delete o.glijstang; }
    if (JSON.stringify(o) !== was) fouten.push({ v, nieuw: o });
  }
  console.log(`${fouten.length} uitvoeringen wijken af van de prijslijstnaam`);
  const perProduct = new Map<string, typeof fouten>(); for (const f of fouten) perProduct.set(f.v.productId, [...(perProduct.get(f.v.productId) ?? []), f]);
  const prods = await db.select().from(products).where(inArray(products.id, [...perProduct.keys()].length ? [...perProduct.keys()] : ["-"]));
  for (const p of prods) { const fs = perProduct.get(p.id)!; console.log(`${p.name}: ${fs.length}x  bv. ${fs[0].v.code} ${JSON.stringify(fs[0].v.options)} → ${JSON.stringify(fs[0].nieuw)}`); }
  if (!TOEPASSEN) { process.exit(0); }
  for (const p of prods) {
    for (const f of perProduct.get(p.id)!) await db.update(productVariants).set({ options: f.nieuw, updatedAt: new Date() }).where(eq(productVariants.id, f.v.id));
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
    const oud = (p.optionAxes ?? []) as ProductOptionAxis[];
    const keys = [...new Set(vs.flatMap((x) => Object.keys((x.options ?? {}) as object)))].filter((k) => k !== "glijstang");
    const assen: ProductOptionAxis[] = keys.map((k) => { const oudAs = oud.find((a) => a.key === k); const waarden = [...new Set(vs.map((x) => (x.options as Record<string, string>)?.[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })); return { key: k, label: oudAs?.label ?? LABEL[k] ?? k, values: waarden.map((w) => ({ value: w, label: w, imageUrl: oudAs?.values.find((x) => x.value === w)?.imageUrl })) }; }).filter((a) => a.values.length > 1 || a.key === "kleur");
    for (const x of vs) await db.update(productVariants).set({ label: buildVariantLabel(assen, (x.options ?? {}) as Record<string, string>) || x.code }).where(eq(productVariants.id, x.id));
    // een set met keuze uit handdouches heet ook zo
    const naam = assen.some((a) => a.key === "handdouche") && !/handdouche/i.test(p.name) ? `${p.name} met handdouche` : p.name;
    await db.update(products).set({ optionAxes: assen, name: naam, updatedAt: new Date() }).where(eq(products.id, p.id));
    if (naam !== p.name) console.log(`naam: ${p.name} → ${naam}`);
    await syncVariantProjection(p.id);
  }
  console.log("gedaan");
  process.exit(0);
}
main();
