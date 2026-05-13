/**
 * Bouw product_spaces.json opnieuw: koppel elk product aan de ruimtes
 * waar 't logisch past, via name-regex. Schrijft één commit naar habitat-one.
 *
 *   npx tsx scripts/rebuild-spaces.ts                (dry run)
 *   npx tsx scripts/rebuild-spaces.ts --apply
 */
import "./load-env";
import { isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { commitFiles, getTextFile } from "../lib/website/github-client";

const APPLY = process.argv.includes("--apply");

interface Space { id: number; slug: string; name: string; }
interface ProductSpace { id: number; product_id: number; space_id: number; sort_order?: number; created_at?: string; }

// Match products → spaces. Eén product kan in meerdere ruimtes passen.
const SPACE_PATTERNS: Record<string, RegExp[]> = {
  bathroom: [
    /bathtub/i, /shower/i, /toilet/i, /\bwash basin\b/i, /cabinet basin/i,
    /countertop basin/i, /wall hung basin/i, /freestanding basin/i,
    /paper holder/i, /toilet brush/i, /robe hook/i, /\btowel\b/i,
    /mirror/i, /cistern/i, /\btaps?\b/i, /drainage/i, /\bbasin\b/i,
    /bathroom tray/i, /rack/i,
  ],
  "living-room": [
    // Wandpanelen passen in elke woonkamer
    /\bboard\b/i, /travertine/i, /travertino/i, /\bstone\b/i, /granite/i,
    /cement/i, /concrete/i, /terrazzo/i, /rammed earth/i, /lime dacite/i,
    /acrylic/i,
  ],
  bedroom: [
    /\bboard\b/i, /travertine/i, /travertino/i, /\bstone\b/i, /granite/i,
    /cement/i, /concrete/i, /terrazzo/i, /rammed earth/i, /lime dacite/i,
    /wood/i,
  ],
  kitchen: [
    /\bstone\b/i, /granite/i, /terrazzo/i, /backer board/i, /xps/i,
    /concrete/i, /travertine/i,
  ],
  terrace: [
    /outdoor/i, /\bstone\b/i, /granite/i, /rockface/i, /rammed earth/i,
    /rough/i, /cut stone/i,
  ],
  garden: [/outdoor/i, /rough/i, /\bstone\b/i, /granite/i],
  "pool-area": [/outdoor/i, /shower/i, /\bstone\b/i, /granite/i, /rockface/i],
  "outdoor-kitchen": [/outdoor/i, /\bstone\b/i, /granite/i, /backer board/i, /xps/i],
};

async function main() {
  const sf = await getTextFile("tmp-data/spaces.json");
  if (!sf) throw new Error("Kan spaces.json niet ophalen");
  const spaces: Space[] = JSON.parse(sf.text);
  const spaceIdBySlug = new Map(spaces.map((s) => [s.slug, s.id]));

  const crm = await db
    .select({ name: products.name, sku: products.sku, websiteProductId: products.websiteProductId })
    .from(products)
    .where(isNotNull(products.websiteProductId));

  const nowIso = new Date().toISOString();
  const newRows: ProductSpace[] = [];
  const stats = new Map<string, number>();
  let rowId = 1;

  for (const p of crm) {
    if (!p.websiteProductId) continue;
    const matchedSlugs: string[] = [];
    for (const [slug, patterns] of Object.entries(SPACE_PATTERNS)) {
      if (patterns.some((re) => re.test(p.name))) matchedSlugs.push(slug);
    }
    let order = 0;
    for (const slug of matchedSlugs) {
      const sid = spaceIdBySlug.get(slug);
      if (!sid) continue;
      newRows.push({
        id: rowId++,
        product_id: p.websiteProductId,
        space_id: sid,
        sort_order: order++,
        created_at: nowIso,
      });
      stats.set(slug, (stats.get(slug) ?? 0) + 1);
    }
  }

  console.log("Producten per ruimte:");
  for (const s of spaces) {
    console.log(`  ${(stats.get(s.slug) ?? 0).toString().padStart(3)}  ${s.slug.padEnd(20)} ${s.name}`);
  }
  console.log(`\nTotaal koppelingen: ${newRows.length}`);
  if (!APPLY) { console.log("\nDry run — voeg --apply toe."); process.exit(0); }

  const commit = await commitFiles({
    message: `feat(spaces): herkoppel producten aan ruimtes (${newRows.length} links)`,
    files: [{ path: "tmp-data/product_spaces.json", content: JSON.stringify(newRows, null, 2) + "\n" }],
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
