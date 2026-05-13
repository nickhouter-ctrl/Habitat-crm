/**
 * Verwijder SKU-codes uit product-namen op de website. De SKU staat al apart
 * op de productkaart — herhalen in de naam is ruis.
 *
 * Bewerkt:
 *   - tmp-data/products.json (name veld)
 *   - messages/{nl,de,en,es}.json (products.i18n.<slug>.name)
 *
 * Pattern: trailing `[- ]+ABC-123(-X)?` met optionele " - " ervoor.
 *
 *   npx tsx scripts/strip-sku-from-names.ts                (dry run)
 *   npx tsx scripts/strip-sku-from-names.ts --apply
 */
import "./load-env";
import { commitFiles, getTextFile } from "../lib/website/github-client";

const APPLY = process.argv.includes("--apply");

type Locale = "nl" | "de" | "en" | "es";
interface WP { id: number; slug: string; sku: string | null; name: string; }

// Strip trailing SKU-pattern: " KKR-XXX", " - KKR-XXX-Y", " DR-001" etc.
const TRAIL_SKU = /\s+[-–—]?\s*[A-Z]{2,5}-[A-Z0-9-]+$/;
function strip(name: string): string {
  let s = name.trim();
  // Strip meerdere keren voor "Name CODE-A CODE-B" (zeldzaam)
  while (TRAIL_SKU.test(s)) {
    s = s.replace(TRAIL_SKU, "").trim();
  }
  return s;
}

async function main() {
  const pf = await getTextFile("tmp-data/products.json");
  if (!pf) throw new Error("Kan products.json niet ophalen");
  const products: WP[] = JSON.parse(pf.text);

  const messages: Record<Locale, { text: string; data: { products: { i18n?: Record<string, { name?: string; short?: string }> } } }> = {} as never;
  for (const l of ["nl", "de", "en", "es"] as Locale[]) {
    const f = await getTextFile(`messages/${l}.json`);
    if (!f) throw new Error(`messages/${l}.json missing`);
    messages[l] = { text: f.text, data: JSON.parse(f.text) };
  }

  let changedProducts = 0;
  let changedTr = 0;
  const log: string[] = [];

  for (const p of products) {
    const cleanedName = strip(p.name);
    if (cleanedName !== p.name) {
      log.push(`  ${(p.sku ?? "—").padEnd(14)}  "${p.name}"  →  "${cleanedName}"`);
      p.name = cleanedName;
      changedProducts++;
    }
    // Strip i18n-vertalingen ook
    for (const l of ["nl", "de", "en", "es"] as Locale[]) {
      const entry = messages[l].data.products.i18n?.[p.slug];
      if (entry?.name) {
        const c = strip(entry.name);
        if (c !== entry.name) {
          entry.name = c;
          changedTr++;
        }
      }
    }
  }

  console.log(`Namen gestript in products.json: ${changedProducts}`);
  console.log(`Vertalingen gestript:             ${changedTr}\n`);
  for (const l of log.slice(0, 80)) console.log(l);
  if (log.length > 80) console.log(`  … en ${log.length - 80} meer`);
  if (!changedProducts && !changedTr) { console.log("\nNiks te doen."); process.exit(0); }
  if (!APPLY) { console.log("\nDry run — voeg --apply toe."); process.exit(0); }

  const files = [
    { path: "tmp-data/products.json", content: JSON.stringify(products, null, 2) + "\n" },
    ...(["nl", "de", "en", "es"] as Locale[]).map((l) => ({
      path: `messages/${l}.json`,
      content: JSON.stringify(messages[l].data, null, 2) + "\n",
    })),
  ];
  const commit = await commitFiles({
    message: `chore(products): strip SKU codes from product names (${changedProducts} producten, ${changedTr} vertalingen)`,
    files,
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
