/**
 * Bouw de website-materials-taxonomie opnieuw op met een uitgebreide
 * indeling, en koppel alle CRM-producten via regex op naam aan één of
 * meer materials.
 *
 * Schrijft naar habitat-one in één atomic commit:
 *   - tmp-data/materials.json
 *   - tmp-data/product_materials.json
 *
 *   npx tsx scripts/rebuild-materials.ts                (dry run)
 *   npx tsx scripts/rebuild-materials.ts --apply
 */
import "./load-env";
import { isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { commitFiles, getTextFile } from "../lib/website/github-client";

const APPLY = process.argv.includes("--apply");

interface Material { id: number; slug: string; name: string; is_active?: boolean; description?: string | null; }
interface ProductMaterial { id: number; product_id: number; material_id: number; sort_order?: number; created_at?: string; }

const MATERIALS: Array<{ slug: string; name: string; description: string; patterns: RegExp[] }> = [
  {
    slug: "travertine",
    name: "Travertine",
    description: "Travertijn-look panelen — warme aardetinten, klassieke uitstraling.",
    patterns: [/travertine/i, /travertino/i],
  },
  {
    slug: "concrete",
    name: "Beton & Cement",
    description: "Beton- en cement-look — strakke, industriële uitstraling.",
    patterns: [/concrete board/i, /wood-?cement/i, /ando cement/i, /zen ando/i],
  },
  {
    slug: "wood-look",
    name: "Houtlook",
    description: "Panelen met hout-textuur — warm en natuurlijk.",
    patterns: [/ancient wood/i, /poly wood/i, /charcoal burnt/i, /\bwood board\b/i],
  },
  {
    slug: "natural-stone",
    name: "Natuursteen",
    description: "Steenpanelen geïnspireerd op graniet, kalksteen en zandsteen.",
    patterns: [/rough granite/i, /rockface/i, /cut stone/i, /age stone/i, /huge travertine|roman huge/i, /square line stone/i, /(fine )?line stone/i, /lime dacite/i],
  },
  {
    slug: "rammed-earth",
    name: "Rammed Earth",
    description: "Aardesteen-look — gelaagde, organische texturen.",
    patterns: [/rammed earth/i, /danxia/i, /rampart/i, /cave rammed/i],
  },
  {
    slug: "terrazzo",
    name: "Terrazzo & Texture",
    description: "Terrazzo en gestructureerde oppervlakken.",
    patterns: [/terrazzo/i, /ripple board/i, /rust board/i, /ms travertino/i],
  },
  {
    slug: "solid-surface",
    name: "Solid Surface",
    description: "Naadloze badkamer-elementen — bad, wastafel, douchebak.",
    patterns: [/bathtub/i, /\bwash basin\b/i, /shower tray/i, /cabinet basin/i, /countertop basin/i, /wall hung basin/i, /freestanding basin/i, /bathroom tray/i, /basin drainage/i, /drainage set/i, /cistern/i, /wall-hung toilet/i, /bathtub rack/i],
  },
  {
    slug: "acrylic",
    name: "Acrylic Sheets",
    description: "Doorschijnende acrylplaten — modern licht-design.",
    patterns: [/translucent acrylic/i, /modified acrylic/i, /\bkkr-a\d/i, /\bkkr-m\d/i],
  },
  {
    slug: "glass-mirror",
    name: "Glas & Spiegels",
    description: "Glas en spiegel-elementen voor de badkamer.",
    patterns: [/shower glass/i, /\bmirror\b/i, /makeup mirror/i],
  },
  {
    slug: "brushed-metal",
    name: "Geborsteld metaal",
    description: "Towel bars, kranen, hooks en hinges in mat geborsteld metaal.",
    patterns: [/towel/i, /robe hook/i, /paper holder/i, /toilet brush holder/i, /\btaps?\b/i, /drain cover/i, /button cover/i, /hinge/i, /\bdoor\b/i, /shower set/i],
  },
  {
    slug: "xps-backer",
    name: "XPS Backer Boards",
    description: "Onderlaag-platen voor wandpanelen en betegeling.",
    patterns: [/xps backer/i, /backer board/i],
  },
];

const SKU_OVERRIDES: Record<string, string[]> = {
  // Soms wint een regex die we niet willen — hier kun je per SKU forceren.
};

function materialsFor(name: string, sku: string | null): string[] {
  const out = new Set<string>();
  if (sku && SKU_OVERRIDES[sku]) {
    for (const m of SKU_OVERRIDES[sku]) out.add(m);
    return [...out];
  }
  for (const m of MATERIALS) {
    if (m.patterns.some((re) => re.test(name))) out.add(m.slug);
  }
  return [...out];
}

async function main() {
  const crmProducts = await db
    .select({
      name: products.name,
      sku: products.sku,
      websiteProductId: products.websiteProductId,
    })
    .from(products)
    .where(isNotNull(products.websiteProductId));

  // Materials.json — geef elke material een stabiele id (volgnummer)
  const nowIso = new Date().toISOString();
  const newMaterials: Material[] = MATERIALS.map((m, i) => ({
    id: 100 + i, // off-set van bestaande ids om collisions te vermijden
    slug: m.slug,
    name: m.name,
    description: m.description,
    is_active: true,
  }));
  const matIdBySlug = new Map(newMaterials.map((m) => [m.slug, m.id]));

  // Product_materials.json — bouw opnieuw op
  const newProdMat: ProductMaterial[] = [];
  const stats = new Map<string, number>();
  const unmatched: Array<{ sku: string | null; name: string }> = [];
  let rowId = 1;
  for (const p of crmProducts) {
    if (!p.websiteProductId) continue;
    const slugs = materialsFor(p.name, p.sku);
    if (slugs.length === 0) { unmatched.push({ sku: p.sku, name: p.name }); continue; }
    let order = 0;
    for (const slug of slugs) {
      const mid = matIdBySlug.get(slug);
      if (!mid) continue;
      newProdMat.push({
        id: rowId++,
        product_id: p.websiteProductId,
        material_id: mid,
        sort_order: order++,
        created_at: nowIso,
      });
      stats.set(slug, (stats.get(slug) ?? 0) + 1);
    }
  }

  console.log(`Materials: ${newMaterials.length}`);
  for (const m of newMaterials) {
    console.log(`  ${(stats.get(m.slug) ?? 0).toString().padStart(3)}  ${m.slug.padEnd(16)}  ${m.name}`);
  }
  console.log(`\nProduct-material koppelingen: ${newProdMat.length}`);
  if (unmatched.length) {
    console.log(`Niet gematcht (${unmatched.length}):`);
    for (const u of unmatched.slice(0, 30)) console.log(`  ${(u.sku ?? "—").padEnd(14)} ${u.name}`);
    if (unmatched.length > 30) console.log(`  … en ${unmatched.length - 30} meer`);
  }

  if (!APPLY) { console.log("\nDry run — voeg --apply toe."); process.exit(0); }

  const commit = await commitFiles({
    message: `feat(materials): uitgebreide taxonomie (${newMaterials.length} materials, ${newProdMat.length} product-koppelingen)`,
    files: [
      { path: "tmp-data/materials.json", content: JSON.stringify(newMaterials, null, 2) + "\n" },
      { path: "tmp-data/product_materials.json", content: JSON.stringify(newProdMat, null, 2) + "\n" },
    ],
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
