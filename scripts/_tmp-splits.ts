/** Gemengde Brauer-producten uit de catalogus-extractie uit elkaar halen, per artikelnummer / prijslijstnaam. */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { productSku } from "@/lib/import/product-import";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
const KLEUR = /\b(PVD\s+)?(chroom|chrome|mat\s+zwart|zwart|black|goud(\s+geborsteld)?|gold|koper(\s+geborsteld)?|copper|gunmetal(\s+geborsteld)?|rvs(-kleurig)?(\s+geborsteld)?|brushed|geborsteld|coffee|wit|mat|pvd)\b/gi;
/** Prijslijstnaam zonder kleur, maat, hendelmodel: wat overblijft is het artikel. */
const kern = (n: string) =>
  n.replace(/^BRAUER\s+/i, "").replace(MAAT, " ").replace(/\b\d+([.,]\d+)?\s*(mm|cm|ml|l)?\b/g, " ").replace(KLEUR, " ")
    .replace(/\b(model [A-E]\d?|links|rechts|helder glas|brons glas|incl\.? glascoating|omkeerbaar)\b/gi, " ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim().replace(/[,\-–]\s*$/, "").trim().toLowerCase();
const MAAT = /\b\d{1,3}\s*[x×]\s*\d{1,3}(\s*[x×]\s*\d{1,3})?\b/g;
const nummer = (c: string) => c.match(/^5-[A-Z]{1,2}-(\d{3})(?:-|$)/)?.[1] ?? null;
/** Productnaam voor een groep: kleur eruit; maten alleen eruit als de groep meerdere maten heeft. */
const netteNaam = (namen: string[]) => {
  // alleen strippen als de maten/getallen tússen de namen verschillen — "SET 02" en
  // "3-standen" binnen één naam zijn geen reden om de naam te slopen
  const maten = new Set(namen.map((n) => (n.match(MAAT) ?? []).map((m) => m.replace(/\s+/g, "")).join("|")));
  const losse = new Set(namen.map((n) => (n.replace(MAAT, " ").match(/\b\d+\b/g) ?? []).join("|")));
  let s = namen[0].replace(/^BRAUER\s+/i, "").replace(KLEUR, " ");
  if (maten.size > 1) s = s.replace(MAAT, " ");
  if (losse.size > 1) s = s.replace(/\b\d+([.,]\d+)?\s*(mm|cm|ml|l)?\b/g, " ");
  s = s.replace(/\b(helder glas|omkeerbaar|incl\.? glascoating)\b/gi, " ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim().replace(/[,\-–]\s*$/, "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
};
const serieVan = (naam: string) => (/\bCarving\b/i.test(naam) ? "Carving" : /\bStripe\b/i.test(naam) ? "Stripe" : /\bEdition\b/i.test(naam) ? "Edition" : null);

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  let splits = 0;
  for (const p of prods) {
    const vs = vars.filter((v) => v.productId === p.id);
    const andereAssen = (p.optionAxes ?? []).map((a) => a.key).filter((k) => k !== "kleur");
    // groepen: kranen op artikelnummer, de rest op kern van de prijslijstnaam
    const groep = (code: string) => nummer(code) ?? (lijst[code]?.naam ? kern(lijst[code].naam!) : null);
    const groepen = new Map<string, typeof vs>();
    for (const v of vs) { const g = groep(v.code); if (g == null) continue; groepen.set(g, [...(groepen.get(g) ?? []), v]); }
    if (groepen.size <= 1) continue;
    // nummers die door de andere assen al uit elkaar gehouden worden, zijn géén menging
    // (set 01/02 = handdouche-as). Menging = twee groepen met dezelfde niet-kleur-opties.
    const sleutel = (v: (typeof vs)[number]) => andereAssen.map((k) => v.options?.[k] ?? "").join("|");
    const perSleutel = new Map<string, Set<string>>();
    for (const [g, gv] of groepen) for (const v of gv) perSleutel.set(sleutel(v), (perSleutel.get(sleutel(v)) ?? new Set()).add(g));
    const botsend = [...perSleutel.values()].some((s) => s.size > 1);
    if (!botsend) continue;
    // per kern-naam samenvoegen (verschillende nummers met dezelfde kern blijven bij elkaar)
    const perKern = new Map<string, typeof vs>();
    for (const [, gv] of groepen) { const k = kern(lijst[gv[0].code]?.naam ?? gv[0].code); perKern.set(k, [...(perKern.get(k) ?? []), ...gv]); }
    if (perKern.size <= 1) continue;
    splits++;
    const gesorteerd = [...perKern.entries()].sort((a, b) => b[1].length - a[1].length);
    console.log(`${p.pushToWebsite ? "SITE" : "crm "} ${p.name} [${p.category}] → ${gesorteerd.length} producten`);
    for (const [k, gv] of gesorteerd) console.log(`    ${gv.length}× ${netteNaam(gv.map((v) => lijst[v.code]?.naam ?? k))}  (${gv[0].code})`);
    if (!TOEPASSEN) continue;
    // de groep die de productnaam draagt blijft (anders de grootste); de rest wordt een eigen product
    const eigen = gesorteerd.find(([, gv]) => netteNaam(gv.map((v) => lijst[v.code]?.naam ?? v.code)).toLowerCase() === p.name.toLowerCase());
    const blijvend = eigen ?? gesorteerd[0];
    const [, blijft] = blijvend;
    const rest = gesorteerd.filter((g) => g !== blijvend);
    const herbouwAssen = (gv: typeof vs): ProductOptionAxis[] => {
      const oud = p.optionAxes ?? [];
      const keys = new Set<string>(); for (const v of gv) for (const k of Object.keys(v.options ?? {})) keys.add(k);
      // kleurplaatjes niet meenemen: die worden per product opnieuw afgeleid uit de eigen uitvoeringen
      return [...keys].map((k) => { const a = oud.find((x) => x.key === k); const waarden = [...new Set(gv.map((v) => v.options?.[k]).filter(Boolean))] as string[]; return { key: k, label: a?.label ?? k, values: waarden.map((w) => ({ value: w, label: a?.values.find((x) => x.value === w)?.label ?? w })) }; }).filter((a) => a.values.length > 1 || a.key === "kleur");
    };
    for (const [, gv] of rest) {
      const naam = netteNaam(gv.map((v) => lijst[v.code]?.naam ?? v.code));
      const assen = herbouwAssen(gv);
      const [nieuw] = await db.insert(products).values({
        // artikelnummer in de sku-hash, zodat een gelijknamig product geen botsing geeft
        name: naam, sku: productSku(merk.skuPrefix ?? "BRA", nummer(gv[0].code) ?? gv[0].code, naam), brandId: merk.id, category: p.category, subcategory: serieVan(naam) ?? p.subcategory, collection: p.collection, unit: p.unit,
        optionAxes: assen, pushToWebsite: p.pushToWebsite, priceEur: p.priceEur, availability: p.availability,
      }).returning({ id: products.id });
      await db.update(productVariants).set({ productId: nieuw.id, updatedAt: new Date() }).where(inArray(productVariants.id, gv.map((v) => v.id)));
      for (const v of gv) await db.update(productVariants).set({ label: buildVariantLabel(assen, v.options ?? {}) || v.code }).where(eq(productVariants.id, v.id));
      await syncVariantProjection(nieuw.id);
    }
    const assenBlijft = herbouwAssen(blijft);
    const naamBlijft = netteNaam(blijft.map((v) => lijst[v.code]?.naam ?? v.code));
    const hernoem = naamBlijft && naamBlijft.toLowerCase() !== p.name.toLowerCase() && !prods.some((q) => q.name.toLowerCase() === naamBlijft.toLowerCase());
    await db.update(products).set({ optionAxes: assenBlijft, imageUrl: null, ...(hernoem ? { name: naamBlijft, subcategory: serieVan(naamBlijft) ?? p.subcategory } : {}), updatedAt: new Date() }).where(eq(products.id, p.id));
    for (const v of blijft) await db.update(productVariants).set({ label: buildVariantLabel(assenBlijft, v.options ?? {}) || v.code }).where(eq(productVariants.id, v.id));
    await syncVariantProjection(p.id);
  }
  console.log(`te splitsen: ${splits}` + (TOEPASSEN ? " — gedaan" : " (droogloop)"));
  process.exit(0);
}
main();
