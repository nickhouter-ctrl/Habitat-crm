/**
 * Exporteer de actieve meubels (Caracole + Cornelius) uit het CRM naar een
 * gegenereerd databestand voor de website-catalogus, met per product de
 * volledige foto-galerij van de leverancier (gematcht op SKU). Caracole-producten
 * worden per Shopify-model GEGROEPEERD, zodat maten/kleuren één productpagina met
 * varianten worden. Dry-run standaard; `--apply` schrijft weg.
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

// Kleurnaam (variant-titel) → swatch-hex. Geen match (bv. "Queen Size") → null.
const COLORS: [RegExp, string][] = [
  [/black|noir|onyx|ebony/i, "#1d1d1f"], [/charcoal|anthracite|graphite/i, "#3a3a3e"],
  [/white|blanc|ivory|chalk/i, "#f3efe7"], [/cream|ecru|oat/i, "#ece2cf"],
  [/beige|sand|linen|natural|flax|oatmeal|wheat|almond/i, "#d7c4a6"],
  [/taupe|mushroom|greige|stone/i, "#b6a890"], [/(grey|gray|silver|dove|ash)/i, "#9b9b9b"],
  [/brown|walnut|chocolate|cognac|coffee|espresso|chestnut/i, "#6b4f3a"],
  [/tan|camel|caramel|honey/i, "#b07a4a"], [/navy|indigo/i, "#28324c"],
  [/blue|teal|denim|sky|azure/i, "#5b7c98"], [/(green|olive|sage|moss|emerald)/i, "#6e7d5b"],
  [/gold|brass/i, "#b8985a"], [/bronze|copper/i, "#7d5a3a"], [/rust|terracotta|clay/i, "#b0542d"],
  [/red|crimson|burgundy|wine/i, "#8a3a3a"], [/pink|blush|rose/i, "#cf9aa0"],
  [/yellow|mustard|ochre/i, "#c79a3a"], [/purple|aubergine|plum/i, "#5d3a5a"],
];
const colourHex = (title?: string): string | null => {
  if (!title) return null;
  for (const [re, hex] of COLORS) if (re.test(title)) return hex;
  return null;
};

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HabitatOne" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

type ShopProd = { handle: string; title: string; images: string[]; variantTitle: Map<string, string> };

// Caracole (Shopify): groepeer op product-handle, met variant-titels (Queen/King/kleur).
async function caracole(): Promise<{ byHandle: Map<string, ShopProd>; handleBySku: Map<string, string> }> {
  const byHandle = new Map<string, ShopProd>();
  const handleBySku = new Map<string, string>();
  for (let page = 1; page <= 12; page++) {
    const j = await fetchJson(`https://caracole.eu.com/products.json?limit=250&page=${page}`);
    const arr = j.products ?? [];
    if (arr.length === 0) break;
    for (const p of arr) {
      const images: string[] = (p.images ?? []).map((i: any) => i.src).filter(Boolean);
      const variantTitle = new Map<string, string>();
      for (const v of p.variants ?? []) {
        if (!v.sku) continue;
        const sku = String(v.sku).trim().toUpperCase();
        variantTitle.set(sku, v.title && v.title !== "Default Title" ? v.title : "");
        handleBySku.set(sku, p.handle);
      }
      byHandle.set(p.handle, { handle: p.handle, title: p.title, images, variantTitle });
    }
    if (arr.length < 250) break;
  }
  return { byHandle, handleBySku };
}

// Cornelius (Woo): sku → galerij (losse producten).
async function cornelius(): Promise<Map<string, string[]>> {
  const idx = new Map<string, string[]>();
  for (let page = 1; page <= 12; page++) {
    const arr = await fetchJson(`https://www.corneliuslifestyle.com/wp-json/wc/store/products?per_page=100&page=${page}`);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr) {
      const imgs: string[] = (p.images ?? []).map((i: any) => String(i.src ?? "").replace(/-\d+x\d+(?=\.\w+$)/, "")).filter(Boolean);
      for (const tok of String(p.sku ?? "").split(/[^0-9A-Za-z]+/)) if (tok && tok.length >= 6) idx.set(tok.toUpperCase(), imgs);
    }
    if (arr.length < 100) break;
  }
  return idx;
}

const dedup = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 10);
const dims = (r: any) => {
  const d = [r.widthMm, r.heightMm, r.lengthMm].filter((x: any) => x != null).map((x: any) => Math.round(Number(x)));
  return d.length ? `${d.join(" × ")} mm` : null;
};

async function main() {
  console.log("CRM-meubels ophalen…");
  const rows = await db.select().from(products).where(and(eq(products.isActive, true), isNotNull(products.sku)));
  const car = rows.filter((r) => r.collection === "Caracole");
  const cor = rows.filter((r) => r.collection === "Cornelius Lifestyle");
  console.log(`  Caracole ${car.length} · Cornelius ${cor.length}`);

  console.log("Leverancier-catalogi ophalen…");
  const [{ byHandle, handleBySku }, corIdx] = await Promise.all([caracole(), cornelius()]);
  console.log(`  Caracole: ${byHandle.size} modellen / ${handleBySku.size} sku-keys · Cornelius: ${corIdx.size} sku-keys`);

  const out: string[] = [];
  const seen = new Set<string>();
  let idN = 2_000_000;
  const push = (o: unknown) => out.push("  " + JSON.stringify(o) + ",");
  const uniqSlug = (base: string) => { let s = base; while (seen.has(s)) s += "-x"; seen.add(s); return s; };

  // ---- Caracole: één product per Shopify-model; varianten = ALLE leverancier-
  // maten/kleuren (ook die niet los in het CRM staan), CRM levert naam/omschrijving.
  const repByHandle = new Map<string, typeof car[number]>();
  const standalone: typeof car = [];
  for (const r of car) {
    const h = handleBySku.get((r.sku ?? "").trim().toUpperCase());
    if (!h) { standalone.push(r); continue; }
    if (!repByHandle.has(h)) repByHandle.set(h, r);
  }
  let grouped = 0, variantsTotal = 0;
  for (const [handle, rep] of repByHandle) {
    const shop = byHandle.get(handle)!;
    const subSlug = SUB[(rep.subcategory ?? "").trim().toLowerCase()];
    if (!subSlug) continue;
    const id = idN++;
    const gallery = dedup([...(rep.imageUrl ? [rep.imageUrl] : []), ...(shop.images ?? [])]);
    const sv = [...shop.variantTitle.entries()]; // [sku, title] in Shopify-volgorde
    const variants = sv.map(([sku, title], i) => ({
      id: id * 100 + i,
      name: sv.length > 1 ? (title || `Variant ${i + 1}`) : null,
      colorHex: colourHex(title),
      sku,
      images: gallery,
    }));
    if (variants.length === 0) variants.push({ id: id * 100, name: null, colorHex: null, sku: rep.sku!, images: gallery });
    variantsTotal += variants.length;
    if (variants.length > 1) grouped++;
    push({
      id, name: rep.name, slug: uniqSlug(`${slugify(rep.name)}-${slugify(rep.sku ?? "")}`), sku: rep.sku, short: null,
      description: rep.description ?? null, descriptionI18n: rep.descriptionI18n ?? null, additionalSizes: null,
      image: gallery[0] ?? null, images: gallery, featured: false, dimensions: dims(rep),
      materials: [], spaces: [], categories: [subSlug], collection: "furniture", variants,
    });
  }

  // ---- Cornelius + losse Caracole: één product per rij ----
  for (const r of [...cor, ...standalone]) {
    const brandCor = r.collection === "Cornelius Lifestyle";
    const skuU = (r.sku ?? "").toUpperCase();
    let gal: string[] = brandCor ? corIdx.get(skuU) ?? [] : [];
    if (!gal.length && brandCor) for (const tok of skuU.split(/[^0-9A-Z]+/)) { const g = corIdx.get(tok); if (g) { gal = g; break; } }
    const imgs = dedup([...(r.imageUrl ? [r.imageUrl] : []), ...gal]);
    if (!imgs.length) continue;
    const subSlug = SUB[(r.subcategory ?? "").trim().toLowerCase()];
    if (!subSlug) continue;
    const id = idN++;
    push({
      id, name: r.name, slug: uniqSlug(`${slugify(r.name)}-${slugify(r.sku ?? "")}`), sku: r.sku, short: null,
      description: r.description ?? null, descriptionI18n: r.descriptionI18n ?? null, additionalSizes: null,
      image: imgs[0], images: imgs, featured: false, dimensions: dims(r),
      materials: [], spaces: [], categories: [subSlug], collection: "furniture",
      variants: [{ id: id * 100, name: null, colorHex: null, sku: r.sku, images: imgs }],
    });
  }

  console.log(`\n${out.length} producten · ${grouped} Caracole-modellen met meerdere varianten · ${variantsTotal} Caracole-varianten`);
  if (!APPLY) { console.log("\nDRY-RUN. Voeg --apply toe om weg te schrijven."); return; }
  const header = `// AUTO-GENERATED — meubels (Caracole + Cornelius) uit het CRM. Niet handmatig bewerken.\nimport type { CatalogProduct } from "./products.generated";\n\nexport const furnitureProducts: CatalogProduct[] = [\n`;
  writeFileSync(OUT, header + out.join("\n") + "\n];\n");
  console.log(`Geschreven: ${OUT}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
