/** Kranensets die alleen in handdouche/bediening/houder/vulling verschillen: één product met keuzes. */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;

type Descriptor = { key: string; label: string; re: RegExp; val: (m: RegExpMatchArray) => string; standaard?: string };
const DESCRIPTORS: Descriptor[] = [
  { key: "handdouche", label: "Handdouche", re: /\b(staaf|3-standen)\s+handdouche\b/i, val: (m) => (m[1].toLowerCase() === "staaf" ? "Staafmodel" : "3-standen") },
  { key: "bediening", label: "Bediening", re: /\bmet\s+drukknoppen\b/i, val: () => "Drukknoppen", standaard: "Draaiknoppen" },
  { key: "houder", label: "Handdouchehouder", re: /\b(met\s+|en\s+)?(geïntegreerde\s+glijstang|glijstang|wandhouder|wandaansluitbocht)\b/i, val: (m) => (/glijstang/i.test(m[2]) ? "Glijstang" : "Wandhouder") },
  { key: "vulling", label: "Badvulling", re: /\bmet\s+(badvulcombinatie|uitloop)\b/i, val: (m) => (m[1].toLowerCase() === "uitloop" ? "Uitloop" : "Badvulcombinatie") },
  { key: "hoofddouche", label: "Hoofddouche", re: /\b(\d{2})\s*cm\s+hoofddouche\b/i, val: (m) => `${m[1]} cm` },
  { key: "uitloop", label: "Uitloop", re: /\b(gebogen|rechte)\s+uitloop\b/i, val: (m) => (m[1].toLowerCase() === "gebogen" ? "Gebogen" : "Recht") },
  { key: "afwerking", label: "Afwerking", re: /\b(met\s+|en\s+)?(rozetten|afdekplaat)\b/i, val: (m) => (m[2].toLowerCase() === "rozetten" ? "Rozetten" : "Afdekplaat") },
  { key: "model", label: "Model", re: /\bmodel\s+([A-E]\d?)\b/i, val: (m) => `Model ${m[1].toUpperCase()}` },
  { key: "positie", label: "Positie", re: /\b(links|rechts)\b/i, val: (m) => (m[1].toLowerCase() === "links" ? "Links" : "Rechts") },
  { key: "maat", label: "Maat", re: /Ø\s*(\d{2,3})\s*(cm)?\b/i, val: (m) => `${m[1]} cm` },
  { key: "douchekop", label: "Douchekop", re: /\b2-standen\s+(cilindervormige\s+douchekop|wandmodel\s+douchekop|inbouw\s+plafond\s+douche)\b/i, val: (m) => (/cilinder/i.test(m[1]) ? "Cilindervormig" : /plafond/i.test(m[1]) ? "Plafond" : "Wandmodel") },
];
const KLEUR = /\b(PVD\s+)?(chroom|chrome|mat\s+zwart|zwart|black|goud(\s+geborsteld)?|gold|koper(\s+geborsteld)?|copper|gunmetal(\s+geborsteld)?|rvs(-kleurig)?(\s+geborsteld)?|brushed|geborsteld|coffee|wit|pvd)\b/gi;

function ontleed(naam: string): { basis: string; opties: Record<string, string> } {
  let n = naam.replace(/^BRAUER\s+/i, "").replace(KLEUR, " ");
  const opties: Record<string, string> = {};
  for (const d of DESCRIPTORS) {
    const m = n.match(d.re);
    if (m) { opties[d.key] = d.val(m); n = n.replace(d.re, " "); }
  }
  n = n.replace(/\bSET\s*\d+\b/gi, " ").replace(/\b(en\s+)?doucheslang\b/gi, " ").replace(/\b(en|met)\s+(en|met)\b/gi, " ")
    .replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").replace(/\b(en|met)\s*$/i, "").replace(/\s+/g, " ").trim().replace(/[,\-–]\s*$/, "").trim();
  return { basis: n, opties };
}

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const perProduct = new Map<string, typeof vars>();
  for (const v of vars) perProduct.set(v.productId, [...(perProduct.get(v.productId) ?? []), v]);

  // basisnaam per product uit de prijslijstnamen van zijn uitvoeringen (meest voorkomende)
  const basisVan = new Map<string, string>();
  for (const p of prods) {
    const vs = (perProduct.get(p.id) ?? []).filter((v) => /^5-/.test(v.code) && lijst[v.code]?.naam);
    if (!vs.length) continue;
    const telling = new Map<string, number>();
    for (const v of vs) { const b = ontleed(lijst[v.code].naam!).basis.toLowerCase(); telling.set(b, (telling.get(b) ?? 0) + 1); }
    const [basis] = [...telling.entries()].sort((a, b) => b[1] - a[1])[0];
    // alleen samenvoegen als de setbeschrijving er echt in zat
    if (vs.some((v) => Object.keys(ontleed(lijst[v.code].naam!).opties).length)) basisVan.set(p.id, `${p.category}|${basis}`);
  }
  const groepen = new Map<string, typeof prods>();
  for (const p of prods) { const k = basisVan.get(p.id); if (k) groepen.set(k, [...(groepen.get(k) ?? []), p]); }
  let n = 0;
  for (const [k, ps] of groepen) {
    const vs = ps.flatMap((p) => perProduct.get(p.id) ?? []);
    const optiesPer = new Map(vs.map((v) => [v.id, ontleed(lijst[v.code]?.naam ?? "").opties]));
    const assenKeys = new Set(vs.flatMap((v) => Object.keys(optiesPer.get(v.id) ?? {})));
    if (ps.length === 1 && assenKeys.size === 0) continue;
    if (ps.length === 1 && [...assenKeys].every((a) => new Set(vs.map((v) => optiesPer.get(v.id)?.[a])).size <= 1)) continue;
    if (ps.length === 1 && [...assenKeys].every((a) => a === "model") && vs.some((v) => v.options?.typehendel)) continue;
    // één product dat al eigen keuze-assen heeft (uit de catalogus) laten we met rust;
    // alleen producten met hooguit een kleur-as krijgen de setkeuzes erbij
    if (ps.length === 1 && (ps[0].optionAxes ?? []).some((a) => a.key !== "kleur")) continue;
    n++;
    const basis = k.split("|")[1];
    // Naam: bij één product blijft de eigen naam; anders de gedeelde basis, met de
    // serie netjes ("Edition Carving …" → "Carving …").
    const netjes = (b: string) => {
      let t = b;
      if (/\b(carving|stripe)\b/i.test(t)) t = t.replace(/\bedition\s+/i, "");
      t = t.replace(/\b(edition|carving|stripe)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
      return t ? t[0].toUpperCase() + t.slice(1) : t;
    };
    const naam = ps.length === 1 ? ps[0].name : basis ? netjes(basis) : "Handdouche";
    console.log(`${ps.some((p) => p.pushToWebsite) ? "SITE" : "crm "} ${naam} [${ps[0].category}] ← ${ps.length} producten, ${vs.length} uitvoeringen; assen: ${[...assenKeys].join(", ")}`);
    for (const p of ps) console.log(`    - ${p.name} (${(perProduct.get(p.id) ?? []).length})`);
    if (!TOEPASSEN) continue;

    const doel = ps.find((p) => p.name.toLowerCase() === naam.toLowerCase()) ?? [...ps].sort((a, b) => (perProduct.get(b.id)?.length ?? 0) - (perProduct.get(a.id)?.length ?? 0))[0];
    const oudeAssen = ps.flatMap((p) => p.optionAxes ?? []);
    // opties per uitvoering: bestaande + setbeschrijving (met standaardwaarde waar de as bestaat)
    const nieuwOpties = new Map<string, Record<string, string>>();
    for (const v of vs) {
      const o: Record<string, string> = { ...(v.options ?? {}) };
      for (const d of DESCRIPTORS) {
        if (!assenKeys.has(d.key)) continue;
        // het hendelmodel uit de code (typehendel) wint van "model A1" in de naam
        if (d.key === "model" && o.typehendel) continue;
        const w = optiesPer.get(v.id)?.[d.key] ?? d.standaard;
        if (w) o[d.key] = w;
      }
      nieuwOpties.set(v.id, o);
    }
    const keys = [...new Set(vs.flatMap((v) => Object.keys(nieuwOpties.get(v.id) ?? {})))];
    const assen: ProductOptionAxis[] = keys.map((key) => {
      const oud = oudeAssen.find((a) => a.key === key); const d = DESCRIPTORS.find((x) => x.key === key);
      const waarden = [...new Set(vs.map((v) => nieuwOpties.get(v.id)?.[key]).filter(Boolean))] as string[];
      return { key, label: oud?.label ?? d?.label ?? key, values: waarden.sort((a, b) => a.localeCompare(b, "nl", { numeric: true })).map((w) => ({ value: w, label: oud?.values.find((x) => x.value === w)?.label ?? w })) };
    }).filter((a) => a.values.length > 1 || a.key === "kleur");
    // kleur vooraan, dan de rest
    assen.sort((a, b) => (a.key === "kleur" ? -1 : b.key === "kleur" ? 1 : 0));
    for (const v of vs) {
      const o = nieuwOpties.get(v.id)!;
      await db.update(productVariants).set({ productId: doel.id, options: o, label: buildVariantLabel(assen, o) || v.code, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    }
    await db.update(products).set({ name: naam, optionAxes: assen, imageUrl: null, pushToWebsite: ps.some((p) => p.pushToWebsite), updatedAt: new Date() }).where(eq(products.id, doel.id));
    const weg = ps.filter((p) => p.id !== doel.id).map((p) => p.id);
    if (weg.length) await db.delete(products).where(inArray(products.id, weg));
    await syncVariantProjection(doel.id);
  }
  console.log(`samen te voegen groepen: ${n}` + (TOEPASSEN ? " — gedaan" : " (droogloop)"));
  if (TOEPASSEN) {
    const koppen = prods.filter((p) => p.category === "Glijstangen" && /douchekop/i.test(p.name));
    for (const p of koppen) await db.update(products).set({ category: "Douchekoppen", updatedAt: new Date() }).where(eq(products.id, p.id));
    console.log(`douchekoppen naar eigen categorie: ${koppen.map((p) => p.name).join(", ")}`);
  }
  process.exit(0);
}
main();
