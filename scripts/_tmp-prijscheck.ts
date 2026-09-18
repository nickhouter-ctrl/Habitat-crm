/** Controle: welke sku's op de website (producten, uitvoeringen, configurator) krijgen GEEN prijs uit de portal-API? */
import { readFileSync } from "node:fs";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
const W = "/Users/nickhouter/projects/Habitat-one";
const J = (p: string) => JSON.parse(readFileSync(`${W}/tmp-data/${p}`, "utf8"));
function baseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+[-–]\s+[^-–]+$/, "").trim().toLowerCase();
}
async function main() {
  const rows = await db.select({ name: products.name, sku: products.sku, priceEur: products.priceEur, adds: products.additionalSizes })
    .from(products).leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(eq(products.isActive, true), or(isNotNull(products.priceEur), isNotNull(products.additionalSizes))));
  const perSku = new Set<string>(); const perNaam = new Set<string>();
  for (const p of rows) {
    if (p.priceEur != null && Number(p.priceEur) > 0) { if (p.sku) perSku.add(p.sku); perNaam.add(baseName(p.name)); }
    for (const s of (p.adds ?? []) as { sku?: string; priceEur?: number | null }[]) if (s.sku && s.priceEur != null) perSku.add(s.sku);
  }
  const heeft = (sku: string | null | undefined, naam: string) => (!!sku && perSku.has(sku)) || perNaam.has(baseName(naam));

  const prod = J("products.json") as Array<Record<string, unknown>>;
  const opts = J("product_options.json") as Record<string, { product_id: number; combinations?: { sku: string }[] }>;
  const meub = J("brauer_meubels.json") as { onderdelen: { sku: string; product: string; type: string }[] };
  const pvar = J("product_variants.json") as Array<{ product_id: number; sku_suffix?: string | null; sku?: string | null }>;
  const varsPer = new Map<number, string[]>();
  for (const v of pvar) { const s = v.sku_suffix ?? v.sku; if (s) varsPer.set(v.product_id, [...(varsPer.get(v.product_id) ?? []), s]); }
  const naamVan = new Map(prod.map((p) => [Number(p.id), String(p.name)]));

  const mis: Record<string, string[]> = {};
  const voeg = (groep: string, wat: string) => { (mis[groep] ??= []).push(wat); };

  for (const p of prod) {
    const naam = String(p.name); const eigen = (p.additional_sizes ?? []) as { sku?: string }[];
    const varSkus = varsPer.get(Number(p.id)) ?? [];
    const comboSkus = Object.values(opts).filter((o) => o.product_id === Number(p.id)).flatMap((o) => (o.combinations ?? []).map((c) => c.sku));
    if (eigen.length) { for (const s of eigen) if (!heeft(s.sku, naam)) voeg(`uitvoering · ${p.brand ?? p.collection}`, `${naam} · ${s.sku}`); }
    // een variant zonder eigen prijs is goed zolang het product er wel een heeft (PriceTag valt daarop terug)
    else if (varSkus.length) { const prodPrijs = heeft(p.sku as string, naam); for (const s of varSkus) if (!heeft(s, naam) && !prodPrijs) voeg(`variant · ${p.brand ?? p.collection}`, `${naam} · ${s}`); }
    else if (comboSkus.length) { /* combinaties worden hieronder los gecontroleerd */ }
    else if (!heeft(p.sku as string, naam)) voeg(`product zonder uitvoeringen · ${p.brand ?? p.collection ?? "eigen"}`, `${naam} · ${p.sku}`);
  }
  for (const o of Object.values(opts)) for (const c of o.combinations ?? []) {
    const naam = naamVan.get(o.product_id) ?? "?"; if (!heeft(c.sku, naam)) voeg("combinatie op productpagina", `${naam} · ${c.sku}`);
  }
  for (const o of meub.onderdelen) if (!heeft(o.sku, o.product)) voeg("configurator", `${o.product} · ${o.sku}`);

  let totaal = 0;
  for (const [g, l] of Object.entries(mis).sort((a, b) => b[1].length - a[1].length)) {
    totaal += l.length; console.log(`\n${g}: ${l.length}`); for (const x of l.slice(0, 8)) console.log("   ", x); if (l.length > 8) console.log(`    … +${l.length - 8}`);
  }
  console.log(`\nTOTAAL zonder prijs: ${totaal}   (prijs-API: ${perSku.size} sku's, ${perNaam.size} namen)`);
  process.exit(0);
}
main();
