/**
 * Exporteer actieve meubels (Caracole + Cornelius) → website-catalogus, met
 * leverancier-galerijen (op SKU) EN slimme variant-samenvoeging: dezelfde
 * meubel in andere maat/kleur/links-rechts wordt één product met opties.
 * Dry-run standaard; `--apply` schrijft weg.
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OUT = "/Users/nickhouter/projects/Habitat-one/lib/data/furniture-products.generated.ts";

const SUB: Record<string, string> = {
  sofa: "sofas", sofas: "sofas", armchair: "armchairs", armchairs: "armchairs",
  "accent chair": "accent-chairs", "accent chairs": "accent-chairs", chair: "accent-chairs", chairs: "accent-chairs",
  "dining chair": "dining-chairs", "dining chairs": "dining-chairs", "lounge chair": "lounge-chairs",
  barstool: "barstools", barstools: "barstools", "counter stool": "counter-stools",
  bench: "benches", benches: "benches", ottoman: "ottomans", ottomans: "ottomans", pouf: "poufs", poufs: "poufs",
  "coffee table": "coffee-tables", "coffee tables": "coffee-tables", "side table": "side-tables", "side tables": "side-tables",
  "console table": "console-tables", "console tables": "console-tables", "dining table": "dining-tables", "dining tables": "dining-tables",
  "accent table": "accent-tables", dresser: "dressers", nightstand: "nightstands", sideboard: "sideboards",
  "bars & display cabinets": "cabinets", "media unit": "media-units", chest: "chests", desk: "desks", "vanity units": "vanity-units",
  bed: "beds", beds: "beds", mirror: "mirrors", tray: "trays", "throw pillow": "cushions",
  artwork: "artwork", "real touch trees and plants": "plants",
  chandeliers: "chandeliers", "floor lamps": "floor-lamps", pendants: "pendants",
};
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

// Kleur-/maat-/richting-woorden — weggehaald uit de naam om dezelfde meubel te
// herkennen, en gebruikt als variant-label.
const COLORS: [RegExp, string][] = [
  [/\bblack\b|\bnoir\b|\bonyx\b|\bebony\b/i, "#1d1d1f"], [/\bcharcoal\b|\banthracite\b|\bgraphite\b/i, "#3a3a3e"],
  [/\bwhite\b|\bivory\b|\bchalk\b/i, "#f3efe7"], [/\bcream\b|\becru\b|\boat\b|\boatmeal\b/i, "#ece2cf"],
  [/\bbeige\b|\bsand\b|\blinn?en\b|\bnatural\b|\bflax\b|\bwheat\b|\balmond\b|\bpearl\b/i, "#d7c4a6"],
  [/\btaupe\b|\bmushroom\b|\bgreige\b|\bstone\b/i, "#b6a890"], [/\bgrey\b|\bgray\b|\bsilver\b|\bdove\b|\bash\b/i, "#9b9b9b"],
  [/\bbrown\b|\bwalnut\b|\bchocolate\b|\bcognac\b|\bcoffee\b|\bespresso\b|\bchestnut\b/i, "#6b4f3a"],
  [/\btan\b|\bcamel\b|\bcaramel\b|\bhoney\b/i, "#b07a4a"], [/\bnavy\b|\bindigo\b/i, "#28324c"],
  [/\bblue\b|\bteal\b|\bdenim\b|\bsky\b|\bazure\b/i, "#5b7c98"], [/\bgreen\b|\bolive\b|\bsage\b|\bmoss\b|\bemerald\b/i, "#6e7d5b"],
  [/\bgold\b|\bbrass\b/i, "#b8985a"], [/\bbronze\b|\bcopper\b/i, "#7d5a3a"], [/\brust\b|\bterracotta\b|\bclay\b/i, "#b0542d"],
  [/\bred\b|\bcrimson\b|\bburgundy\b|\bwine\b/i, "#8a3a3a"], [/\bpink\b|\bblush\b|\brose\b/i, "#cf9aa0"],
  [/\bchampagne\b/i, "#e7d6b0"],
];
const colourHex = (t?: string): string | null => { if (!t) return null; for (const [re, hex] of COLORS) if (re.test(t)) return hex; return null; };
const colourWord = (name: string): string | null => {
  const m = name.match(/\b(black|white|ivory|cream|beige|sand|linn?en|natural|taupe|mushroom|greige|grey|gray|silver|brown|walnut|chocolate|cognac|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|green|olive|sage|moss|gold|brass|bronze|copper|rust|terracotta|red|burgundy|pink|blush|rose|champagne|pearl)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
};
const sizeWord = (name: string): string | null => {
  const m = name.match(/\b(king|queen|full|twin|california king|cal king)\b/i);
  return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
};
const dirWord = (name: string): string | null => {
  const m = name.match(/\b(left chaise|right chaise|left|right|laf|raf)\b/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return v.includes("left") || v === "laf" ? "Left" : "Right";
};
// Naam zónder kleur/maat/richting → herkent hetzelfde design.
const normName = (name: string): string =>
  name.toLowerCase()
    .replace(/\b(black|white|ivory|cream|ecru|oat|oatmeal|beige|sand|linn?en|natural|flax|wheat|almond|pearl|taupe|mushroom|greige|stone|grey|gray|silver|dove|ash|brown|walnut|chocolate|cognac|coffee|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|sky|azure|green|olive|sage|moss|emerald|gold|brass|bronze|copper|rust|terracotta|clay|red|crimson|burgundy|wine|pink|blush|rose|champagne|dark|light|neutral|toned)\b/gi, " ")
    .replace(/\b(king|queen|full|twin|california|cal|size)\b/gi, " ")
    .replace(/\b(left|right|laf|raf)\b/gi, " ")
    .replace(/[^\w|]+/g, " ").replace(/\s+/g, " ").trim();

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HabitatOne" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
type ShopProd = { title: string; images: string[]; variantTitle: Map<string, string> };
async function caracole(): Promise<{ byHandle: Map<string, ShopProd>; handleBySku: Map<string, string> }> {
  const byHandle = new Map<string, ShopProd>(); const handleBySku = new Map<string, string>();
  for (let page = 1; page <= 12; page++) {
    const j = await fetchJson(`https://caracole.eu.com/products.json?limit=250&page=${page}`);
    const arr = j.products ?? []; if (arr.length === 0) break;
    for (const p of arr) {
      const images: string[] = (p.images ?? []).map((i: any) => i.src).filter(Boolean);
      const variantTitle = new Map<string, string>();
      for (const v of p.variants ?? []) { if (!v.sku) continue; const sku = String(v.sku).trim().toUpperCase(); variantTitle.set(sku, v.title && v.title !== "Default Title" ? v.title : ""); handleBySku.set(sku, p.handle); }
      byHandle.set(p.handle, { title: p.title, images, variantTitle });
    }
    if (arr.length < 250) break;
  }
  return { byHandle, handleBySku };
}
async function cornelius(): Promise<Map<string, string[]>> {
  const idx = new Map<string, string[]>();
  for (let page = 1; page <= 12; page++) {
    const arr = await fetchJson(`https://www.corneliuslifestyle.com/wp-json/wc/store/products?per_page=100&page=${page}`);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr) { const imgs: string[] = (p.images ?? []).map((i: any) => String(i.src ?? "").replace(/-\d+x\d+(?=\.\w+$)/, "")).filter(Boolean); for (const tok of String(p.sku ?? "").split(/[^0-9A-Za-z]+/)) if (tok && tok.length >= 6) idx.set(tok.toUpperCase(), imgs); }
    if (arr.length < 100) break;
  }
  return idx;
}
const dedup = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 12);
const dimStr = (r: any) => { const d = [r.widthMm, r.heightMm, r.lengthMm].filter((x: any) => x != null).map((x: any) => Math.round(Number(x))); return d.length ? `${d.join(" × ")} mm` : null; };

// Maat → afmeting (mm, W × H × D) uit de omschrijving, bv. "Queen Size … W178 x
// D229 x H147 cm King Size … W218 x D229 x H147 cm".
function sizeDims(desc?: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!desc) return map;
  const re = /\b(queen|king|full|twin)\s+size\b[^]{0,90}?W\s*(\d+)\s*[x×]\s*D\s*(\d+)\s*[x×]\s*H\s*(\d+)\s*cm/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) {
    const W = +m[2], D = +m[3], H = +m[4];
    if (!map.has(m[1].toLowerCase())) map.set(m[1].toLowerCase(), `${W * 10} × ${H * 10} × ${D * 10} mm`);
  }
  return map;
}
const sizeKey = (t?: string | null) => (t ?? "").toLowerCase().match(/\b(queen|king|full|twin)\b/)?.[1] ?? null;

type Member = { sku: string; name: string; sub: string; dims: string | null; descr: string | null; di18n: any; gallery: string[]; shopVariants: { sku: string; title: string }[] };

async function main() {
  console.log("CRM-meubels ophalen…");
  const rows = await db.select().from(products).where(and(eq(products.isActive, true), isNotNull(products.sku)));
  const car = rows.filter((r) => r.collection === "Caracole");
  const cor = rows.filter((r) => r.collection === "Cornelius Lifestyle");
  const [{ byHandle, handleBySku }, corIdx] = await Promise.all([caracole(), cornelius()]);
  console.log(`  Caracole ${car.length} · Cornelius ${cor.length} · Shopify ${byHandle.size} modellen`);

  // Bouw "members" (één per CRM-rij), met Shopify-galerij + (eventuele) maat-varianten.
  const members: Member[] = [];
  for (const r of car) {
    const subSlug = SUB[(r.subcategory ?? "").trim().toLowerCase()]; if (!subSlug) continue;
    const h = handleBySku.get((r.sku ?? "").trim().toUpperCase());
    const shop = h ? byHandle.get(h) : undefined;
    const gallery = dedup([...(r.imageUrl ? [r.imageUrl] : []), ...((shop?.images) ?? [])]);
    const sv = shop ? [...shop.variantTitle.entries()].map(([sku, title]) => ({ sku, title })) : [{ sku: r.sku!, title: "" }];
    members.push({ sku: r.sku!, name: r.name, sub: subSlug, dims: dimStr(r), descr: r.description ?? null, di18n: r.descriptionI18n ?? null, gallery, shopVariants: sv.length ? sv : [{ sku: r.sku!, title: "" }] });
  }
  for (const r of cor) {
    const subSlug = SUB[(r.subcategory ?? "").trim().toLowerCase()]; if (!subSlug) continue;
    const skuU = (r.sku ?? "").toUpperCase();
    let gal = corIdx.get(skuU) ?? []; if (!gal.length) for (const tok of skuU.split(/[^0-9A-Z]+/)) { const g = corIdx.get(tok); if (g) { gal = g; break; } }
    const gallery = dedup([...(r.imageUrl ? [r.imageUrl] : []), ...gal]);
    members.push({ sku: r.sku!, name: r.name, sub: subSlug, dims: dimStr(r), descr: r.description ?? null, di18n: r.descriptionI18n ?? null, gallery, shopVariants: [{ sku: r.sku!, title: "" }] });
  }

  // Groepeer members op (subcategorie + modelnaam-zonder-kleur/maat/richting).
  const fam = new Map<string, Member[]>();
  for (const m of members) { const key = `${m.sub}||${normName(m.name)}`; (fam.get(key) ?? fam.set(key, []).get(key)!).push(m); }

  const out: string[] = []; const seen = new Set<string>(); let idN = 2_000_000; let mergedFams = 0;
  const uniqSlug = (b: string) => { let s = b; while (seen.has(s)) s += "-x"; seen.add(s); return s; };
  const titleCase = (s: string) => s.replace(/\|/g, "| ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

  for (const [, group] of fam) {
    const rep = group[0];
    const multi = group.length > 1 || group.some((m) => m.shopVariants.length > 1);
    if (group.length > 1) mergedFams++;
    const id = idN++;
    const gallery = dedup(group.flatMap((m) => m.gallery));
    // Variant per (member × shop-variant).
    const variants: any[] = []; let vi = 0;
    for (const m of group) {
      const col = colourWord(m.name); const dir = dirWord(m.name);
      const sd = sizeDims(m.descr);
      for (const sv of m.shopVariants) {
        const size = (sv.title && sv.title !== "Default Title") ? sv.title.replace(/\bsize\b/i, "").trim() : sizeWord(m.name);
        const label = multi ? ([col, size, dir].filter(Boolean).join(" · ") || `Variant ${vi + 1}`) : null;
        const sk = sizeKey(sv.title) ?? sizeKey(m.name);
        const dim = (sk && sd.get(sk)) || m.dims;
        variants.push({ id: id * 100 + vi++, name: label, colorHex: colourHex(col ?? ""), sku: sv.sku, images: m.gallery.length ? m.gallery : gallery, dim });
      }
    }
    // Productnaam = rep-naam met kleur/maat/richting eruit (behoudt hoofdletters
    // + leestekens zoals "Three's Company"), of rep-naam als die leeg wordt.
    const stripped = rep.name
      .replace(/\b(black|white|ivory|cream|ecru|oat|oatmeal|beige|sand|linn?en|natural|flax|wheat|almond|pearl|taupe|mushroom|greige|stone|grey|gray|silver|dove|ash|brown|walnut|chocolate|cognac|coffee|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|sky|azure|green|olive|sage|moss|emerald|gold|brass|bronze|copper|rust|terracotta|clay|red|crimson|burgundy|wine|pink|blush|rose|champagne|dark|light|neutral|toned)\b/gi, " ")
      .replace(/\b(king|queen|full|twin|california|cal|size)\b/gi, " ")
      .replace(/\b(left|right|laf|raf)\b/gi, " ")
      .replace(/\s+/g, " ").replace(/\s+\|/g, " |").replace(/\|\s+/g, "| ").replace(/^\s*\|\s*/, "").trim();
    const name = multi && stripped ? stripped : rep.name;
    out.push("  " + JSON.stringify({
      id, name, slug: uniqSlug(`${slugify(name)}-${slugify(rep.sku)}`), sku: rep.sku, short: null,
      description: rep.descr, descriptionI18n: rep.di18n, additionalSizes: null,
      image: gallery[0] ?? null, images: gallery, featured: false, dimensions: rep.dims,
      materials: [], spaces: [], categories: [rep.sub], collection: "furniture", variants,
    }) + ",");
  }

  console.log(`\n${out.length} producten · ${mergedFams} samengevoegde families (>1 lid)`);
  if (!APPLY) { console.log("\nDRY-RUN. Voeg --apply toe om weg te schrijven."); return; }
  writeFileSync(OUT, `// AUTO-GENERATED — meubels (Caracole + Cornelius) uit het CRM. Niet handmatig bewerken.\nimport type { CatalogProduct } from "./products.generated";\n\nexport const furnitureProducts: CatalogProduct[] = [\n` + out.join("\n") + "\n];\n");
  console.log(`Geschreven: ${OUT}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
