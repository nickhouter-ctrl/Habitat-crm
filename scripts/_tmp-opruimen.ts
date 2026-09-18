/** Opruimronde Brauer: ontbrekende keuzes uit codes/namen, nette namen, glasfamilies samen, assen herbouwen. */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string; kleur?: string }>;
const KLEURCODE: Record<string, string> = { CE: "Chroom", CF: "Coffee", GG: "Geborsteld goud", GK: "Geborsteld koper", GM: "Geborsteld gunmetal", NG: "Geborsteld RVS", MZ: "Mat zwart", S: "Mat zwart", MW: "Mat wit" };
const KLEUR = /\b(PVD\s+)?(chroom|chrome|mat\s+zwart|mat\s+wit|zwart|black|goud(\s+geborsteld)?|gold|koper(\s+geborsteld)?|copper|gunmetal(\s+geborsteld)?|rvs(-kleurig)?(\s+geborsteld)?|brushed|geborsteld|coffee|wit|pvd)\b/gi;
const MAAT = /\b(\d{1,3})\s*[x×]\s*(\d{1,3})(?:\s*[x×]\s*(\d{1,3}))?\b/;
const LABELS: Record<string, string> = { kleur: "Kleur", maat: "Maat", glassoort: "Glassoort", model: "Model", lengte: "Lengte" };

function kleurUitCode(code: string): string | null {
  if (/^5-/.test(code)) return null;
  const m = code.match(/^(?:DR|AE|GS|GB|GL|GP|DB|ODB)-.*?(CE|CF|GG|GK|GM|NG|MZ|MW)$/) ?? code.match(/^DR-[A-Z]+\d+(S)$/);
  return m ? KLEURCODE[m[1]] ?? null : null;
}
function uitNaam(naam: string): Record<string, string> {
  const o: Record<string, string> = {};
  const m = naam.match(MAAT);
  if (m) o.maat = `${m[1]}x${m[2]}${m[3] ? `x${m[3]}` : ""} cm`;
  if (/\bbrons glas\b/i.test(naam)) o.glassoort = "Brons glas";
  else if (/\bribbelglas\b/i.test(naam)) o.glassoort = "Ribbelglas";
  else if (/\bhelder glas\b/i.test(naam)) o.glassoort = "Helder glas";
  if (/\bronde uitloop\b/i.test(naam)) o.uitloop = "Rond";
  else if (/\bplatte uitloop\b/i.test(naam)) o.uitloop = "Plat";
  else if (/\bgebogen uitloop\b/i.test(naam)) o.uitloop = "Gebogen";
  else if (/\brechte uitloop\b/i.test(naam)) o.uitloop = "Recht";
  const mm = naam.match(/\bmodel ([AB])\s+(\d{2,3})\b/i);
  if (mm) o.model = `Model ${mm[1].toUpperCase()} (${mm[2]} cm)`;
  return o;
}
const kern = (n: string) => n.replace(/^BRAUER\s+/i, "").replace(MAAT, " ").replace(/\b\d+([.,]\d+)?\s*(mm|cm|ml|l)?\b/g, " ").replace(KLEUR, " ").replace(/\b(model [A-E]\d?|links|rechts|helder glas|brons glas|incl\.? glascoating|omkeerbaar)\b/gi, " ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim().replace(/[,\-–]\s*$/, "").trim();
const netjes = (n: string) => { let t = n.replace(/^BRAUER\s+/i, "").replace(KLEUR, " ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim().replace(/[,\-–]\s*$/, "").trim(); if (/\b(carving|stripe)\b/i.test(t)) t = t.replace(/\bedition\s+/i, ""); t = t.replace(/\b(edition|carving|stripe)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()); return t ? t[0].toUpperCase() + t.slice(1) : t; };

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  let prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  let vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const log = (s: string) => console.log(s);

  // ---- a. ontbrekende keuzes uit code en prijslijstnaam
  let gevuld = 0;
  for (const v of vars) {
    const o: Record<string, string> = { ...(v.options ?? {}) };
    const naam = lijst[v.code]?.naam ?? "";
    if (!o.kleur) { const k = kleurUitCode(v.code); if (k) o.kleur = k; }
    for (const [k, w] of Object.entries(uitNaam(naam))) if (!o[k]) o[k] = w;
    if (JSON.stringify(o) !== JSON.stringify(v.options ?? {})) { gevuld++; v.options = o; if (TOEPASSEN) await db.update(productVariants).set({ options: o }).where(eq(productVariants.id, v.id)); }
  }
  log(`keuzes aangevuld bij ${gevuld} uitvoeringen`);

  // ---- b. kleine glasproducten uit de prijslijst bij hun familie (zelfde codeprefix)
  const perProduct = () => { const m = new Map<string, typeof vars>(); for (const v of vars) m.set(v.productId, [...(m.get(v.productId) ?? []), v]); return m; };
  let pp = perProduct();
  const familie = (code: string) => code.match(/^(GS-[A-Z]+\d[A-Z])/)?.[1] ?? null;
  const perFamilie = new Map<string, Map<string, number>>();
  for (const v of vars) { const f = familie(v.code); if (!f) continue; const m = perFamilie.get(f) ?? new Map(); m.set(v.productId, (m.get(v.productId) ?? 0) + 1); perFamilie.set(f, m); }
  for (const p of prods) {
    const vs = pp.get(p.id) ?? [];
    if (vs.length === 0 || vs.length > 6) continue;
    const f = familie(vs[0].code); if (!f || !vs.every((v) => familie(v.code) === f)) continue;
    const kandidaten = [...(perFamilie.get(f) ?? [])].filter(([id]) => id !== p.id).sort((a, b) => b[1] - a[1]);
    if (!kandidaten.length || kandidaten[0][1] < 12) continue;
    const doel = prods.find((x) => x.id === kandidaten[0][0])!;
    log(`glas: ${p.name} (${vs.length}) → ${doel.name}`);
    if (TOEPASSEN) { await db.update(productVariants).set({ productId: doel.id }).where(inArray(productVariants.id, vs.map((v) => v.id))); await db.delete(products).where(eq(products.id, p.id)); }
    for (const v of vs) v.productId = doel.id;
    prods = prods.filter((x) => x.id !== p.id);
  }
  pp = perProduct();

  // ---- c. namen: hoofdstuknamen (meervoud) en "model A" → naam uit de prijslijst
  for (const p of prods) {
    const vs = pp.get(p.id) ?? [];
    const kernen = new Set(vs.map((v) => (lijst[v.code]?.naam ? kern(lijst[v.code].naam!).toLowerCase() : null)).filter(Boolean));
    let nieuw: string | null = null;
    if (p.category === "Glijstangen" && p.name === "Handdouche") nieuw = "Glijstang";
    else if (kernen.size === 1 && (/\b(thermostaten|kranen|wastafelmengkranen|fonteinkranen|badvullers|douchegoten)\b/i.test(p.name) || /\bmodel A$/i.test(p.name) || /^(Douchegoten|Douchegoten Small|Douchegoten XS|Complete douchegoot met)$/i.test(p.name))) {
      const eerste = vs.find((v) => lijst[v.code]?.naam)!;
      // volledige prijslijstnaam (met "2 stopkranen" e.d.); maten alleen weg als ze per uitvoering verschillen
      const maten = new Set(vs.map((v) => v.options?.maat).filter(Boolean));
      let basis = lijst[eerste.code].naam!.replace(/\b(model [A-E]\d?)\b/gi, " ");
      if (maten.size > 1) basis = basis.replace(MAAT, " ");
      nieuw = netjes(basis);
      if (/^(Douchegoten Small|Douchegoten XS)$/i.test(p.name)) nieuw = null; // eigen catalogusnaam is prima
    }
    if (nieuw && nieuw.toLowerCase() !== p.name.toLowerCase() && !prods.some((x) => x.id !== p.id && x.name.toLowerCase() === nieuw!.toLowerCase())) {
      log(`naam: ${p.name} → ${nieuw}`);
      if (TOEPASSEN) await db.update(products).set({ name: nieuw, updatedAt: new Date() }).where(eq(products.id, p.id));
      p.name = nieuw;
    }
    if (p.category === "Glijstangen" && p.name === "Glijstang") for (const v of vs) { if (v.options?.houder) { const o = { ...v.options }; delete o.houder; v.options = o; if (TOEPASSEN) await db.update(productVariants).set({ options: o }).where(eq(productVariants.id, v.id)); } }
  }

  // ---- d. assen herbouwen uit wat de uitvoeringen écht dragen (labels en kleurplaatjes behouden)
  let herbouwd = 0;
  for (const p of prods) {
    const vs = pp.get(p.id) ?? [];
    if (!vs.length) continue;
    const oud = p.optionAxes ?? [];
    const keys = [...new Set(vs.flatMap((v) => Object.keys(v.options ?? {})))];
    const volgorde = (k: string) => (k === "kleur" ? 0 : oud.findIndex((a) => a.key === k) >= 0 ? 1 + oud.findIndex((a) => a.key === k) : 99);
    const assen: ProductOptionAxis[] = keys.sort((a, b) => volgorde(a) - volgorde(b)).map((key) => {
      const a = oud.find((x) => x.key === key);
      const waarden = [...new Set(vs.map((v) => v.options?.[key]).filter(Boolean))] as string[];
      waarden.sort((x, y) => x.localeCompare(y, "nl", { numeric: true }));
      return { key, label: a?.label ?? LABELS[key] ?? key[0].toUpperCase() + key.slice(1), values: waarden.map((w) => { const ow = a?.values.find((x) => x.value === w); return { value: w, label: ow?.label ?? w, ...(ow?.imageUrl ? { imageUrl: ow.imageUrl } : {}) }; }) };
    }).filter((a) => a.values.length > 1 || a.key === "kleur");
    if (JSON.stringify(assen) !== JSON.stringify(oud)) {
      herbouwd++;
      if (TOEPASSEN) {
        await db.update(products).set({ optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, p.id));
        for (const v of vs) await db.update(productVariants).set({ label: buildVariantLabel(assen, v.options ?? {}) || v.code }).where(eq(productVariants.id, v.id));
        await syncVariantProjection(p.id);
      }
    }
  }
  log(`assen herbouwd bij ${herbouwd} producten` + (TOEPASSEN ? "" : " (droogloop)"));
  process.exit(0);
}
main();
