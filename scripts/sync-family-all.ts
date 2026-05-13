/**
 * Eénpass-sync voor álle website-products: zet CRM-SKU + afmetingen +
 * omschrijving op de juiste waarde, ook voor family-producten waarvan de
 * SKU op de site nu nog een oude family-code is (CBWB-001 etc.).
 *
 * Match-strategie:
 *   1. SKU exact match in CRM    → gebruik dat CRM-product
 *   2. Naam exact match (norm)    → gebruik dat CRM-product
 *   3. Naam prefix-match: CRM-naam start met website-naam (variant van een family)
 *      → kies de eerste variant met afmetingen (lengte/hoogte/breedte ingevuld)
 *
 * Wat er meegesynct wordt:
 *   - sku                     (overschrijft oude family-codes)
 *   - width/height/length/thickness, dimension_unit = "mm"
 *   - description (alleen als CRM een description heeft)
 *
 * Lokaal schrijven naar habitat-one/tmp-data/products.json — daarna handmatig:
 *   cd ../habitat-one && node tmp-data/gen2.mjs && git push
 *
 *   npx tsx scripts/sync-family-all.ts                (dry run)
 *   npx tsx scripts/sync-family-all.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const SITE_JSON = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data", "products.json");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const hasAnyDim = (c: { widthMm: unknown; heightMm: unknown; lengthMm: unknown; thicknessMm: unknown }) =>
  num(c.widthMm) || num(c.heightMm) || num(c.lengthMm) || num(c.thicknessMm);

interface WP {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  length: number | null;
  thickness: number | null;
  dimension_unit: string | null;
  [key: string]: unknown;
}

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(SITE_JSON, "utf8"));
  const crm = await db
    .select({
      name: products.name,
      sku: products.sku,
      description: products.description,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      lengthMm: products.lengthMm,
      thicknessMm: products.thicknessMm,
    })
    .from(products)
    .where(isNotNull(products.name));

  const bySku = new Map<string, typeof crm[number]>();
  const byName = new Map<string, typeof crm[number]>();
  for (const c of crm) {
    if (c.sku) bySku.set(normSku(c.sku), c);
    byName.set(normName(c.name), c);
  }
  // Sorteer CRM op naam-lengte (lang→kort) zodat we de specifiekste prefix vinden,
  // bv. "Roman Huge Travertine" wint van "Huge Travertine".
  const sortedCrm = [...crm].sort((a, b) => normName(b.name).length - normName(a.name).length);

  const changes: Array<{
    wp: WP;
    via: string;
    src: typeof crm[number];
    skuBefore: string | null;
    skuAfter: string;
    fields: string[];
  }> = [];
  const unmatched: WP[] = [];

  for (const w of site) {
    let src: typeof crm[number] | undefined;
    let via = "";

    // 1. SKU exact
    if (w.sku) {
      const m = bySku.get(normSku(w.sku));
      if (m) { src = m; via = "sku"; }
    }
    // 2. Naam exact
    if (!src) {
      const m = byName.get(normName(w.name));
      if (m) { src = m; via = "naam"; }
    }
    // 3. Naam prefix — kies eerste variant met dims (anders eerste variant)
    if (!src) {
      const wn = normName(w.name);
      if (wn.length >= 4) {
        const matches = sortedCrm.filter((c) => {
          const cn = normName(c.name);
          return cn === wn || cn.startsWith(wn + " ") || cn.startsWith(wn + "-");
        });
        if (matches.length) {
          // Kies de variant met de laagste numerieke SKU (bv. MS-070 voor Age Stone)
          // en bij voorkeur eentje met afmetingen ingevuld.
          const skuNumber = (s: string | null) => {
            const m = s?.match(/(\d+)/);
            return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
          };
          const sorted = [...matches].sort((a, b) => skuNumber(a.sku) - skuNumber(b.sku));
          src = sorted.find(hasAnyDim) ?? sorted[0];
          via = `naam-prefix (${matches.length} varianten)`;
        }
      }
    }

    if (!src) { unmatched.push(w); continue; }

    const fields: string[] = [];
    const wantedSku = src.sku ?? null;
    if (wantedSku && normSku(wantedSku) !== normSku(w.sku ?? "")) {
      fields.push(`sku: ${w.sku ?? "(leeg)"} → ${wantedSku}`);
      w.sku = wantedSku;
    }
    const nextW = num(src.widthMm);
    const nextH = num(src.heightMm);
    const nextL = num(src.lengthMm);
    const nextT = num(src.thicknessMm);
    if (nextW !== w.width || nextH !== w.height || nextL !== w.length || nextT !== w.thickness) {
      fields.push("dims");
      w.width = nextW; w.height = nextH; w.length = nextL; w.thickness = nextT;
      w.dimension_unit = "mm";
    }
    if (src.description && w.description !== src.description) {
      fields.push("omschrijving");
      w.description = src.description;
    }
    if (!fields.length) continue;

    changes.push({
      wp: w,
      via,
      src,
      skuBefore: w.sku === wantedSku ? null : (w.sku ?? null),
      skuAfter: wantedSku ?? (w.sku ?? ""),
      fields,
    });
  }

  console.log(`Website-producten:    ${site.length}`);
  console.log(`Wijzigen:             ${changes.length}`);
  console.log(`Geen CRM-match:        ${unmatched.length}\n`);

  for (const c of changes) {
    console.log(`  ${c.wp.name}  (via ${c.via})`);
    console.log(`    → ${c.fields.join(", ")}    (src: ${c.src.sku ?? "?"} ${c.src.name})`);
  }
  if (unmatched.length) {
    console.log("\nNiet gematcht:");
    for (const u of unmatched) console.log(`  · ${u.sku ?? "—"}  ${u.name}`);
  }
  if (!APPLY) {
    console.log("\nDry run — voeg --apply toe om te schrijven.");
    process.exit(0);
  }

  fs.writeFileSync(SITE_JSON, JSON.stringify(site, null, 2) + "\n", "utf8");
  console.log(`\n✅ Geschreven: ${SITE_JSON}`);
  console.log("Volgende: cd ../habitat-one && node tmp-data/gen2.mjs && git commit -am 'sync product attrs from CRM' && git push");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
