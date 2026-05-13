/**
 * Full resync: voor elk CRM-product met websiteProductId, werk de website-entry
 * bij met de huidige CRM-staat (naam, omschrijving, afmetingen, additional_sizes).
 *
 * Eén atomic GitHub-commit naar habitat-one.
 *
 *   npx tsx scripts/resync-all-to-website.ts                (dry run)
 *   npx tsx scripts/resync-all-to-website.ts --apply
 *   npx tsx scripts/resync-all-to-website.ts --apply --translate   (ook descriptions vertalen)
 */
import "./load-env";
import { isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { commitFiles, getTextFile } from "../lib/website/github-client";
import { translateText, type Locale } from "../lib/translate";

const APPLY = process.argv.includes("--apply");
const DO_TRANSLATE = process.argv.includes("--translate");

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface WP {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  description_i18n?: Partial<Record<Locale, string>> | null;
  short_description: string | null;
  sku: string | null;
  thumbnail_path: string | null;
  featured: boolean;
  width: number | null;
  height: number | null;
  length: number | null;
  thickness: number | null;
  dimension_unit: string | null;
  additional_sizes?: string[] | null;
  coverage_value: number | null;
  coverage_unit: string | null;
  stock_unit: string | null;
  [key: string]: unknown;
}

async function main() {
  const linked = await db
    .select({
      id: products.id, name: products.name, sku: products.sku,
      description: products.description,
      widthMm: products.widthMm, heightMm: products.heightMm,
      lengthMm: products.lengthMm, thicknessMm: products.thicknessMm,
      additionalSizes: products.additionalSizes,
      websiteProductId: products.websiteProductId,
    })
    .from(products)
    .where(isNotNull(products.websiteProductId));
  console.log(`Gekoppelde CRM-producten: ${linked.length}`);

  // Dedupe: één CRM-product per website-id (de laagste SKU). Family-product
  // krijgt zo de "primary" variant z'n data — de andere kleur-varianten
  // overschrijven dezelfde family-velden niet anders.
  const skuNumber = (s: string | null) => {
    const m = s?.match(/(\d+)/);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  };
  const grouped = new Map<number, typeof linked[number]>();
  for (const r of linked) {
    if (!r.websiteProductId) continue;
    const cur = grouped.get(r.websiteProductId);
    if (!cur || skuNumber(r.sku) < skuNumber(cur.sku)) grouped.set(r.websiteProductId, r);
  }
  const representatives = [...grouped.values()];
  console.log(`Unieke website-entries:    ${representatives.length}`);

  const pf = await getTextFile("tmp-data/products.json");
  if (!pf) throw new Error("Kan website JSON niet ophalen — token OK?");
  const websiteProducts: WP[] = JSON.parse(pf.text);
  const byId = new Map(websiteProducts.map((p) => [p.id, p]));

  const changes: string[] = [];
  const hasOpenAI = !!process.env.OPENAI_API_KEY && DO_TRANSLATE;

  for (const c of representatives) {
    if (!c.websiteProductId) continue;
    const entry = byId.get(c.websiteProductId);
    if (!entry) continue;
    const before = JSON.stringify(entry);

    // Name niet aanraken — family-namen worden gemanaged door
    // clean-family-names.ts. CRM-name is vaak "Ripple Board - Beige"
    // terwijl website z'n family-name "Ripple Board" hoort te zijn.
    if (c.description) entry.description = c.description;
    const nextW = num(c.widthMm), nextH = num(c.heightMm), nextL = num(c.lengthMm), nextT = num(c.thicknessMm);
    if (nextW != null) entry.width = nextW;
    if (nextH != null) entry.height = nextH;
    if (nextL != null) entry.length = nextL;
    if (nextT != null) entry.thickness = nextT;
    entry.dimension_unit = "mm";
    const extras = (c.additionalSizes as string[] | null) ?? null;
    entry.additional_sizes = extras && extras.length > 0 ? extras : null;

    // Optioneel: vertaling refreshen
    if (hasOpenAI && c.description?.trim()) {
      try {
        const out = await translateText({
          text: c.description, fromLocale: "nl", targetLocales: ["de", "en", "es"],
        });
        entry.description_i18n = { nl: c.description, ...out };
      } catch {
        /* best-effort */
      }
    }

    if (JSON.stringify(entry) !== before) {
      changes.push(`${c.sku ?? "—"} (#${c.websiteProductId}) ${c.name}${extras?.length ? `  [+${extras.length} maten]` : ""}`);
    }
  }

  console.log(`Wijzigingen:             ${changes.length}\n`);
  for (const c of changes.slice(0, 60)) console.log(`  ~ ${c}`);
  if (changes.length > 60) console.log(`  … en ${changes.length - 60} meer`);
  if (!changes.length) { console.log("\nNiets te wijzigen."); process.exit(0); }
  if (!APPLY) { console.log("\nDry run — voeg --apply (+ optioneel --translate) toe."); process.exit(0); }

  const commit = await commitFiles({
    message: `chore(products): resync ${changes.length} products from CRM (incl. additional sizes)`,
    files: [
      { path: "tmp-data/products.json", content: JSON.stringify(websiteProducts, null, 2) + "\n" },
    ],
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
