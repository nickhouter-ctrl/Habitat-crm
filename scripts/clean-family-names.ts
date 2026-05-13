/**
 * Strip ` - VariantNaam` suffix uit website-product-namen waar die suffix
 * eigenlijk een kleur/variant-aanduiding is. Een family-product hoort 'Ripple
 * Board' te heten, niet 'Ripple Board - Beige' — Beige hoort in de variant.
 *
 * Heuristiek: strip alleen als
 *   - het product 2+ varianten heeft (= echt een family), én
 *   - de gestripte suffix overeenkomt met een van die variant-namen
 *
 * Lokaal schrijven naar habitat-one/tmp-data/products.json. Daarna commit + push.
 *
 *   npx tsx scripts/clean-family-names.ts                (dry run)
 *   npx tsx scripts/clean-family-names.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const SITE = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data");
const PRODUCTS_JSON = path.join(SITE, "products.json");
const VARIANTS_JSON = path.join(SITE, "product_variants.json");

interface WP { id: number; name: string; sku: string | null; }
interface WV { id: number; product_id: number; variant_name: string | null; }

const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function stripSuffix(name: string, suffixes: string[]): string | null {
  // Match ` - X` of `  - X` of `-X` aan het einde, case-insensitive, met flexibel whitespace
  const m = name.match(/^(.*?)\s*[-–—]\s*([^-–—]+?)\s*$/);
  if (!m) return null;
  const base = m[1].trim();
  const tail = m[2].trim();
  if (!tail) return null;
  const nTail = normName(tail);
  for (const v of suffixes) {
    if (!v) continue;
    if (normName(v) === nTail) return base;
  }
  return null;
}

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(PRODUCTS_JSON, "utf8"));
  const variants: WV[] = JSON.parse(fs.readFileSync(VARIANTS_JSON, "utf8"));
  const variantsByProduct = new Map<number, WV[]>();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id)!.push(v);
  }

  const changes: Array<{ id: number; was: string; becomes: string }> = [];
  for (const p of site) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length < 2) continue; // niet echt een family
    const suffixes = vs.map((v) => v.variant_name ?? "").filter(Boolean);
    const cleaned = stripSuffix(p.name, suffixes);
    if (cleaned && cleaned !== p.name) {
      changes.push({ id: p.id, was: p.name, becomes: cleaned });
      p.name = cleaned;
    }
  }

  console.log(`Website-producten:    ${site.length}`);
  console.log(`Naam-fixes:           ${changes.length}\n`);
  for (const c of changes) {
    console.log(`  #${c.id}  "${c.was}"  →  "${c.becomes}"`);
  }
  if (!APPLY) {
    console.log("\nDry run — voeg --apply toe.");
    process.exit(0);
  }
  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(site, null, 2) + "\n", "utf8");
  console.log(`\n✅ Geschreven: ${PRODUCTS_JSON}`);
  console.log("Volgende: cd ../habitat-one && node tmp-data/gen2.mjs && git commit -am 'clean family names' && git push");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
