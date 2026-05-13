/**
 * Fix afmetingen voor "family-products" op de habitat-one website: één
 * website-entry per materiaal (bv. "Age Stone"), terwijl in CRM elk
 * kleur-variant een eigen product is (MS-070 t/m MS-075).
 *
 * Voor elk website-product zonder SKU-match in CRM zoeken we CRM-producten
 * waarvan de naam met de website-naam begint en pakken we de afmetingen
 * van het eerste variant met ingevulde maten. We schrijven die terug naar
 * tmp-data/products.json en committen via de GitHub API zodat habitat-one
 * automatisch redeployt.
 *
 *   npx tsx scripts/sync-family-dims.ts                (dry run)
 *   npx tsx scripts/sync-family-dims.ts --apply        (commit via GitHub API)
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { ilike, isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { commitFiles, getTextFile } from "../lib/website/github-client";

const APPLY = process.argv.includes("--apply");
const LOCAL_ONLY = process.argv.includes("--local-only");
const LOCAL_JSON = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data", "products.json");

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

interface WP {
  id: number;
  name: string;
  sku: string | null;
  width: number | null;
  height: number | null;
  length: number | null;
  thickness: number | null;
  dimension_unit: string | null;
  [key: string]: unknown;
}

async function main() {
  // 1. Site JSON laden — bij dry run uit local, bij apply via GitHub.
  let site: WP[];
  let originalText = "";
  if (LOCAL_ONLY || !APPLY) {
    site = JSON.parse(fs.readFileSync(LOCAL_JSON, "utf8"));
  } else {
    const f = await getTextFile("tmp-data/products.json");
    if (!f) throw new Error("Kon tmp-data/products.json niet ophalen via GitHub API.");
    originalText = f.text;
    site = JSON.parse(originalText);
  }

  const crm = await db
    .select({
      name: products.name,
      sku: products.sku,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      lengthMm: products.lengthMm,
      thicknessMm: products.thicknessMm,
    })
    .from(products)
    .where(isNotNull(products.name));

  const crmBySku = new Map<string, typeof crm[number]>();
  for (const c of crm) if (c.sku) crmBySku.set(normSku(c.sku), c);

  const planned: Array<{ wp: WP; src: typeof crm[number]; before: string; after: string }> = [];
  const noMatch: WP[] = [];

  for (const w of site) {
    // Skip als sku al matched (die zijn al gesynct door sync-products-to-website.ts)
    if (w.sku && crmBySku.has(normSku(w.sku))) continue;

    // Naam-fuzzy: pak CRM-producten waarvan de naam start met de website-naam
    const wn = normName(w.name);
    if (!wn) continue;
    const matches = crm.filter((c) => normName(c.name).startsWith(wn));
    const withDims = matches.find(
      (c) => num(c.widthMm) || num(c.heightMm) || num(c.lengthMm) || num(c.thicknessMm),
    );
    if (!withDims) {
      noMatch.push(w);
      continue;
    }
    const nextW = num(withDims.widthMm);
    const nextH = num(withDims.heightMm);
    const nextL = num(withDims.lengthMm);
    const nextT = num(withDims.thicknessMm);

    if (
      nextW === w.width &&
      nextH === w.height &&
      nextL === w.length &&
      nextT === w.thickness &&
      w.dimension_unit === "mm"
    ) {
      continue;
    }

    const before = `L${w.length ?? "-"} × W${w.width ?? "-"} × H${w.height ?? "-"} · t${w.thickness ?? "-"} ${w.dimension_unit ?? ""}`;
    const after = `L${nextL ?? "-"} × W${nextW ?? "-"} × H${nextH ?? "-"} · t${nextT ?? "-"} mm`;
    w.width = nextW;
    w.height = nextH;
    w.length = nextL;
    w.thickness = nextT;
    w.dimension_unit = "mm";
    planned.push({ wp: w, src: withDims, before, after });
  }

  console.log(`Website-producten:            ${site.length}`);
  console.log(`Wijzigen via familie-match:   ${planned.length}`);
  console.log(`Geen CRM-match gevonden:      ${noMatch.length}`);
  console.log("\nWijzigingen:");
  for (const p of planned) {
    console.log(`  ${(p.wp.sku ?? "—").padEnd(14)} ${p.wp.name}`);
    console.log(`    voor: ${p.before}`);
    console.log(`    na:   ${p.after}    (uit ${p.src.sku ?? "?"} ${p.src.name})`);
  }
  if (noMatch.length) {
    console.log("\nGeen match in CRM (handmatig fixen):");
    for (const n of noMatch) console.log(`  · ${(n.sku ?? "—").padEnd(14)} ${n.name}`);
  }

  if (!planned.length) {
    console.log("\nNiets te wijzigen.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\nDry run — voeg --apply toe om te schrijven.");
    process.exit(0);
  }

  const newJson = JSON.stringify(site, null, 2) + "\n";
  if (LOCAL_ONLY) {
    fs.writeFileSync(LOCAL_JSON, newJson, "utf8");
    console.log(`\n✅ Lokaal geschreven: ${LOCAL_JSON}`);
    console.log("Vergeet niet: cd ../habitat-one && node tmp-data/gen2.mjs && git push.");
    process.exit(0);
  }

  // Commit via GitHub API — atomic, automatische deploy
  void originalText;
  const commit = await commitFiles({
    message: `chore(products): sync family-product dimensions from CRM (${planned.length})`,
    files: [{ path: "tmp-data/products.json", content: newJson }],
  });
  console.log(`\n✅ Gecommit naar habitat-one: ${commit.commitUrl}`);
  console.log("Vercel deployt de site automatisch.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
