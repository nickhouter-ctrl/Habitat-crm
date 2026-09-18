import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brauerModelKey } from "@/lib/brauer";
import { brands, productVariants, products } from "@/lib/db/schema";

const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam: string; bron: string; prijs: number; hoofdcat?: string; cat?: string; groep?: string; kleur?: string }>;
const bestanden = JSON.parse(readFileSync(`${S}/brauer-bestanden.json`, "utf8")) as Record<string, string[]>;

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, sub: products.subcategory, axes: products.optionAxes, att: products.attachments }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ code: productVariants.code, productId: productVariants.productId, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const crm = new Map(vars.map((v) => [v.code, v]));
  const perModel = new Map<string, Set<string>>();
  for (const v of vars) { const k = brauerModelKey(v.code); if (k) perModel.set(k, (perModel.get(k) ?? new Set()).add(v.productId)); }
  const nieuw = Object.keys(lijst).filter((c) => !crm.has(c));
  let sibling = 0, ambiguous = 0, geen = 0; const geenNamen = new Map<string, number>();
  for (const c of nieuw) {
    const k = brauerModelKey(c); const s = k ? perModel.get(k) : undefined;
    if (s && s.size === 1) sibling++; else if (s && s.size > 1) ambiguous++; else { geen++; const n = (lijst[c].naam ?? "").replace(/^BRAUER\s+/i, ""); const cat = lijst[c].cat ?? lijst[c].hoofdcat ?? "?"; geenNamen.set(cat, (geenNamen.get(cat) ?? 0) + 1); }
  }
  console.log(`nieuw ${nieuw.length}: bij bestaand product ${sibling}, meerdere kandidaten ${ambiguous}, echt nieuw ${geen}`);
  console.log("echt nieuw per categorie:", [...geenNamen.entries()].sort((a, b) => b[1] - a[1]));
  // crm-codes zonder prijs, per categorie (excl. meubels)
  const zp = new Map<string, number>();
  for (const v of vars) if (!lijst[v.code]) { const cat = pm.get(v.productId)?.category ?? "?"; if (cat !== "Badkamermeubels") zp.set(cat, (zp.get(cat) ?? 0) + 1); }
  console.log("crm zonder prijs (excl. meubels):", [...zp.entries()].sort((a, b) => b[1] - a[1]));
  // voorbeeld codes zonder prijs in Wastafelkranen
  console.log("vb zonder prijs:", vars.filter((v) => !lijst[v.code] && pm.get(v.productId)?.category === "Wastafelkranen").slice(0, 8).map((v) => v.code));
  // foto-dekking per product
  let metFoto = 0; for (const p of prods) { const codes = vars.filter((v) => v.productId === p.id).map((v) => v.code); if (codes.some((c) => bestanden[c])) metFoto++; }
  console.log(`producten met minstens één foto beschikbaar: ${metFoto}/${prods.length}`);
  console.log("kleur-as voorbeeld:", JSON.stringify(prods.find((p) => p.category === "Wastafelkranen")?.axes?.[0]).slice(0, 300));
  console.log("options voorbeeld:", JSON.stringify(vars.find((v) => v.code === "5-CE-001")?.options));
  console.log("attachments voorbeeld:", JSON.stringify(prods.find((p) => (p.att ?? []).length)?.att?.[0]));
  process.exit(0);
}
main();
