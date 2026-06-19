/**
 * Exporteer de actieve meubels (Caracole + Cornelius Lifestyle) uit het CRM naar
 * een gegenereerd databestand voor de website-catalogus, met per product de
 * volledige foto-galerij van de leverancier (Shopify / WooCommerce), gematcht op
 * SKU. Dry-run standaard; `--apply` schrijft het bestand weg.
 *
 *   npx tsx scripts/export-furniture.ts            # dry-run (match-rapport)
 *   npx tsx scripts/export-furniture.ts --apply    # schrijf furniture-products.generated.ts
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OUT = "/Users/nickhouter/projects/Habitat-one/lib/data/furniture-products.generated.ts";

// CRM subcategory → canonical sub-slug (mirror of lib/data/furniture.ts on the site).
const SUB: Record<string, string> = {
  // Seating
  sofa: "sofas", sofas: "sofas",
  armchair: "armchairs", armchairs: "armchairs",
  "accent chair": "accent-chairs", "accent chairs": "accent-chairs", chair: "accent-chairs", chairs: "accent-chairs",
  "dining chair": "dining-chairs", "dining chairs": "dining-chairs",
  "lounge chair": "lounge-chairs",
  barstool: "barstools", barstools: "barstools",
  "counter stool": "counter-stools",
  bench: "benches", benches: "benches",
  ottoman: "ottomans", ottomans: "ottomans",
  pouf: "poufs", poufs: "poufs",
  // Tables
  "coffee table": "coffee-tables", "coffee tables": "coffee-tables",
  "side table": "side-tables", "side tables": "side-tables",
  "console table": "console-tables", "console tables": "console-tables",
  "dining table": "dining-tables", "dining tables": "dining-tables",
  "accent table": "accent-tables",
  // Storage
  dresser: "dressers", nightstand: "nightstands", sideboard: "sideboards",
  "bars & display cabinets": "cabinets", "media unit": "media-units",
  chest: "chests", desk: "desks", "vanity units": "vanity-units",
  // Beds
  bed: "beds", beds: "beds",
  // Decoration
  mirror: "mirrors", tray: "trays", "throw pillow": "cushions",
  artwork: "artwork", "real touch trees and plants": "plants",
  // Lighting
  chandeliers: "chandeliers", "floor lamps": "floor-lamps", pendants: "pendants",
};
const GROUP: Record<string, string> = {
  Seating: "seating", Tables: "tables", Storage: "storage", Beds: "beds",
  Decoration: "decoration", Lighting: "lighting", Overig: "tables",
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

type Gallery = string[];
async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HabitatOne" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ---- Caracole (Shopify) ----
async function caracoleIndex(): Promise<Map<string, Gallery>> {
  const idx = new Map<string, Gallery>();
  for (let page = 1; page <= 12; page++) {
    const j = (await fetchJson(`https://caracole.eu.com/products.json?limit=250&page=${page}`)) as {
      products?: { variants?: { sku?: string }[]; images?: { src?: string }[] }[];
    };
    const arr = j.products ?? [];
    if (arr.length === 0) break;
    for (const p of arr) {
      const imgs = (p.images ?? []).map((i) => i.src!).filter(Boolean);
      for (const v of p.variants ?? []) {
        if (v.sku) idx.set(v.sku.trim().toUpperCase(), imgs);
      }
      // ook indexeren op SKU-code in de bestandsnaam (CAR<sku>_n.png)
      for (const src of imgs) {
        const m = src.match(/files\/(?:CAR)?([A-Z0-9-]+?)(?:_[A-Za-z0-9]+)?\.(?:jpg|png|jpeg|webp)/i);
        if (m) idx.set(m[1].toUpperCase(), idx.get(m[1].toUpperCase()) ?? imgs);
      }
    }
    if (arr.length < 250) break;
  }
  return idx;
}

// ---- Cornelius (WooCommerce Store API) ----
async function corneliusIndex(): Promise<Map<string, Gallery>> {
  const idx = new Map<string, Gallery>();
  for (let page = 1; page <= 12; page++) {
    const arr = (await fetchJson(
      `https://www.corneliuslifestyle.com/wp-json/wc/store/products?per_page=100&page=${page}`,
    )) as { sku?: string; images?: { src?: string }[] }[];
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr) {
      const imgs = (p.images ?? []).map((i) => (i.src ?? "").replace(/-\d+x\d+(?=\.\w+$)/, "")).filter(Boolean);
      for (const tok of String(p.sku ?? "").split(/[^0-9A-Za-z]+/)) {
        if (tok && tok.length >= 6) idx.set(tok.toUpperCase(), imgs);
      }
    }
    if (arr.length < 100) break;
  }
  return idx;
}

async function main() {
  console.log("CRM-meubels ophalen…");
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), isNotNull(products.sku)));
  const furn = rows.filter((r) => r.collection === "Caracole" || r.collection === "Cornelius Lifestyle");
  console.log(`  ${furn.length} actieve meubels (Caracole + Cornelius).`);

  console.log("Leverancier-catalogi ophalen…");
  const [car, cor] = await Promise.all([caracoleIndex(), corneliusIndex()]);
  console.log(`  Caracole index: ${car.size} sku-keys · Cornelius index: ${cor.size} sku-keys`);

  const seen = new Set<string>();
  let matched = 0, multi = 0;
  const out: string[] = [];
  let idN = 2_000_000;

  for (const r of furn) {
    const brand = r.collection === "Caracole" ? "car" : "cor";
    const skuU = (r.sku ?? "").trim().toUpperCase();
    const idx = brand === "car" ? car : cor;
    let gallery = idx.get(skuU) ?? [];
    if (gallery.length === 0 && brand === "cor") {
      // probeer losse tokens van de CRM-sku
      for (const tok of skuU.split(/[^0-9A-Z]+/)) { const g = cor.get(tok); if (g) { gallery = g; break; } }
    }
    if (gallery.length) matched++;
    // garandeer minstens de CRM-foto
    const imgs = Array.from(new Set([...(r.imageUrl ? [r.imageUrl] : []), ...gallery])).slice(0, 8);
    if (imgs.length > 1) multi++;
    if (imgs.length === 0) continue; // geen enkele foto → overslaan

    const subSlug = SUB[(r.subcategory ?? "").trim().toLowerCase()] ?? null;
    if (!subSlug) continue; // niet in taxonomie → overslaan

    let slug = `${slugify(r.name)}-${slugify(r.sku ?? "")}`;
    while (seen.has(slug)) slug += "-x";
    seen.add(slug);

    const dims = [r.widthMm, r.heightMm, r.lengthMm].filter((x) => x != null).map((x) => Math.round(Number(x)));
    const dimStr = dims.length ? `${dims.join(" × ")} mm` : null;
    const di18n = r.descriptionI18n ?? null;

    const id = idN++;
    out.push(
      `  ${JSON.stringify({
        id, name: r.name, slug, sku: r.sku, short: null,
        description: r.description ?? null, descriptionI18n: di18n, additionalSizes: null,
        image: imgs[0], images: imgs, featured: false, dimensions: dimStr,
        materials: [], spaces: [], categories: [subSlug], collection: "furniture",
        variants: [{ id: id * 10 + 1, name: null, colorHex: null, sku: r.sku, images: imgs }],
      })},`,
    );
  }

  console.log(`\nResultaat: ${out.length} producten · ${matched} sku-gematcht · ${multi} met galerij (>1 foto)`);

  if (!APPLY) {
    console.log("\nDRY-RUN — voorbeeld (eerste 2):");
    console.log(out.slice(0, 2).join("\n"));
    console.log("\nVoeg --apply toe om weg te schrijven.");
    return;
  }
  const header = `// AUTO-GENERATED — meubels (Caracole + Cornelius) uit het CRM. Niet handmatig bewerken.\nimport type { CatalogProduct } from "./products.generated";\n\nexport const furnitureProducts: CatalogProduct[] = [\n`;
  writeFileSync(OUT, header + out.join("\n") + "\n];\n");
  console.log(`\nGeschreven: ${OUT} (${out.length} producten)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
