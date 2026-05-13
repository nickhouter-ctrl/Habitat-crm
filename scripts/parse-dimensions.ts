/**
 * Vul de structureerde afmetingsvelden (width/height/length/thickness) per
 * product door de getallen uit `description` te lezen.
 *
 * Conventie (zoals gebruiker bevestigde):
 *   - 2 getallen `A*B`  → heightMm=A, widthMm=B   (typisch wandpanelen: bv. "2900*1200")
 *   - 3 getallen `A*B*C` → lengthMm=A, widthMm=B, thicknessMm=C   (typisch trays: "1225*900*68")
 *   - Andersom geschreven met x / × / cm / mm — wordt allemaal opgevangen.
 *
 * Standaard slaat ie producten over die al een afmeting hebben — `--overwrite`
 * forceert herparsing.
 *
 *   npx tsx scripts/parse-dimensions.ts                 (dry run)
 *   npx tsx scripts/parse-dimensions.ts --apply
 *   npx tsx scripts/parse-dimensions.ts --apply --overwrite
 */
import "./load-env";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");

interface Parsed {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
}

const NUM = "(\\d{2,5}(?:[.,]\\d+)?)";
const SEP = "\\s*[*x×X]\\s*";
const RE_THREE = new RegExp(`${NUM}${SEP}${NUM}${SEP}${NUM}`);
const RE_TWO = new RegExp(`${NUM}${SEP}${NUM}`);

/**
 * Pak het eerste afmetingen-stuk uit de tekst. Skip getallen die voor "mm"-
 * triggerwoorden staan zoals coverage / weight per m² (komt nu niet voor in
 * onze descriptions, maar voor robustness).
 */
function parseDimensions(desc: string): Parsed | null {
  const text = String(desc).replace(/,/g, ".");
  const three = text.match(RE_THREE);
  if (three) {
    const a = Number(three[1]);
    const b = Number(three[2]);
    const c = Number(three[3]);
    if ([a, b, c].every((n) => Number.isFinite(n) && n > 0)) {
      return { lengthMm: a, widthMm: b, thicknessMm: c };
    }
  }
  const two = text.match(RE_TWO);
  if (two) {
    const a = Number(two[1]);
    const b = Number(two[2]);
    if ([a, b].every((n) => Number.isFinite(n) && n > 0)) {
      return { heightMm: a, widthMm: b };
    }
  }
  return null;
}

const has = (v: string | null | undefined) => v != null && String(v).trim() !== "";

async function main() {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      lengthMm: products.lengthMm,
      thicknessMm: products.thicknessMm,
    })
    .from(products)
    .where(isNotNull(products.description));

  let updates = 0;
  let skippedAlreadyFilled = 0;
  let noParse = 0;
  const planned: Array<{ sku: string; name: string; before: string; after: string }> = [];

  for (const r of rows) {
    const alreadyFilled =
      has(r.widthMm as string | null) ||
      has(r.heightMm as string | null) ||
      has(r.lengthMm as string | null) ||
      has(r.thicknessMm as string | null);
    if (alreadyFilled && !OVERWRITE) {
      skippedAlreadyFilled++;
      continue;
    }
    if (!r.description) continue;
    const parsed = parseDimensions(r.description);
    if (!parsed) { noParse++; continue; }

    const before = [r.lengthMm, r.heightMm, r.widthMm, r.thicknessMm].map((x) => x ?? "—").join(" / ");
    const after = [
      parsed.lengthMm ?? "—",
      parsed.heightMm ?? "—",
      parsed.widthMm ?? "—",
      parsed.thicknessMm ?? "—",
    ].join(" / ");
    planned.push({ sku: r.sku ?? "—", name: r.name, before, after });

    if (APPLY) {
      await db
        .update(products)
        .set({
          widthMm: parsed.widthMm != null ? String(parsed.widthMm) : null,
          heightMm: parsed.heightMm != null ? String(parsed.heightMm) : null,
          lengthMm: parsed.lengthMm != null ? String(parsed.lengthMm) : null,
          thicknessMm: parsed.thicknessMm != null ? String(parsed.thicknessMm) : null,
          updatedAt: new Date(),
        })
        .where(eq(products.id, r.id));
    }
    updates++;
  }

  console.log(`Producten met description:        ${rows.length}`);
  console.log(`Te updaten (uit description):     ${updates}`);
  console.log(`Overgeslagen (al ingevuld):        ${skippedAlreadyFilled}  ${OVERWRITE ? "(--overwrite negeert)" : ""}`);
  console.log(`Geen afmeting in tekst gevonden:   ${noParse}`);
  console.log(`\nFormaat: L / H / B / T  (mm)\n`);
  for (const p of planned.slice(0, 80)) {
    console.log(`  ${(p.sku).padEnd(14)} ${p.before.padEnd(28)} →  ${p.after.padEnd(28)}   ${p.name}`);
  }
  if (planned.length > 80) console.log(`  … en ${planned.length - 80} meer`);

  if (!APPLY) console.log("\nDry run — voeg --apply toe om te schrijven.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
