/**
 * Re-organise every product into a collection (the filter tabs) + category:
 *   Wandpanelen          — Magic Stone-panelen (per serie) + XPS montageplaten
 *   Badkamer             — wastafels, baden, douchebakken, toiletten, afvoeren, platen, …
 *   Badkamer accessoires — handdoekrekken, spiegels, kranen, toiletaccessoires, …
 *   Yo Home              — modulaire ruimtes, deuren, beslag
 *
 *   npx tsx scripts/recategorize.ts          (dry run)
 *   npx tsx scripts/recategorize.ts --apply
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");

const KKR_ACC_CATEGORY: Record<string, string> = {
  "KKR-3209A": "Toiletaccessoires", // paper holder
  "KKR-3508": "Toiletaccessoires", // robe hook
  "KKR-3512": "Toiletaccessoires", // toilet brush holder
  "KKR-3502A": "Handdoekrekken", // double towel rack
  "KKR-3704": "Handdoekstangen", // towel bar
  "KKR-8051-2": "Spiegels",
  "KKR-8058": "Spiegels",
  "KKR-8201": "Spiegels",
  "KKR-WB3003B": "Kranen",
  "KKR-B-RACK09": "Badrekken",
};
const KKR_CATEGORY: Record<string, string> = {
  "KKR-B008-B": "Baden", "KKR-B051": "Baden", "KKR-B051-A": "Baden",
  "KKR-T001-D": "Douchebakken", "KKR-T006": "Douchebakken", "KKR-T011": "Douchebakken", "KKR-T122-B": "Douchebakken", "KKR-1080-1": "Douchebakken",
  "KKR-P15-2": "Afvoeren", "KKR-PU004": "Afvoeren", "KKR-PU005": "Afvoeren", "KKR-PU217": "Afvoeren", "KKR-PU9": "Afvoeren", "KKR-PU9-RESIN": "Afvoeren", "KKR-PD032": "Afvoeren",
  "KKR-CT005": "Toiletten", "KKR-CT012": "Toiletten", "KKR-CT11010": "Toiletten", "KKR-CT11023": "Toiletten",
  "KKR-A001": "Solid surface platen", "KKR-A025": "Solid surface platen", "KKR-A026": "Solid surface platen", "KKR-A027": "Solid surface platen", "KKR-A110": "Solid surface platen", "KKR-M8807": "Solid surface platen",
  "KKR-S6006": "Douchesets",
  "KKR-SG": "Douchewanden",
  "KKR-1141-2": "Wastafels", "KKR-1169": "Wastafels", "KKR-1261-1": "Wastafels", "KKR-1264-1": "Wastafels", "KKR-1507": "Wastafels", "KKR-1908": "Wastafels",
  "KKR-2120": "Wastafels", "KKR-2123": "Wastafels", "KKR-2124": "Wastafels",
  "KKR-H5060-D": "Wastafels", "KKR-H7036": "Wastafels", "KKR-H7072-D": "Wastafels",
};

function classify(p: { sku: string | null; name: string }): { collection: string; category: string } {
  const sku = (p.sku ?? "").toUpperCase();
  const name = p.name;
  if (sku.startsWith("MS-")) {
    const family = (name.split(/\s+-\s+/)[0] || name).replace(/\s+/g, " ").trim();
    return { collection: "Wandpanelen", category: family || "Magic Stone" };
  }
  if (sku.startsWith("WB-")) return { collection: "Wandpanelen", category: "XPS montageplaten" };
  if (sku in KKR_ACC_CATEGORY) return { collection: "Badkamer accessoires", category: KKR_ACC_CATEGORY[sku] };
  if (sku.startsWith("KKR-")) return { collection: "Badkamer", category: KKR_CATEGORY[sku] ?? "Badkamer overig" };
  // Magic Stone panels without an MS- code (Romanite, Milan Travertine):
  if (/^romanite\b|^milan travertine\b/i.test(name)) {
    const family = (name.split(/\s+-\s+/)[0] || name).replace(/\s+/g, " ").trim();
    return { collection: "Wandpanelen", category: family };
  }
  if (/yo home|hotel suite/i.test(name)) return { collection: "Yo Home", category: /door/i.test(name) ? "Deuren" : "Modulaire ruimtes" };
  if (/hinge|scharnier|beslag/i.test(name)) return { collection: "Yo Home", category: "Beslag" };
  return { collection: "Overig", category: "Overig" };
}

async function main() {
  const all = await db.select({ id: products.id, sku: products.sku, name: products.name, collection: products.collection, category: products.category }).from(products);
  const updates: { id: string; sku: string; name: string; from: string; to: string }[] = [];
  const byCollection = new Map<string, number>();
  for (const p of all) {
    const c = classify(p);
    byCollection.set(c.collection, (byCollection.get(c.collection) ?? 0) + 1);
    if ((p.collection ?? "") !== c.collection || (p.category ?? "") !== c.category) {
      updates.push({ id: p.id, sku: p.sku ?? "—", name: p.name, from: `${p.collection ?? "(geen)"} / ${p.category ?? "(geen)"}`, to: `${c.collection} / ${c.category}` });
    }
  }
  console.log("Per collectie:", Object.fromEntries(byCollection));
  console.log(`\nBij te werken: ${updates.length}`);
  for (const u of updates.slice(0, 60)) console.log(`  ${u.sku}  ${u.name}:  ${u.from}  →  ${u.to}`);
  if (updates.length > 60) console.log(`  ... +${updates.length - 60} meer`);

  if (!APPLY) { console.log("\n(dry run — --apply)"); process.exit(0); }
  for (const p of all) {
    const c = classify(p);
    await db.update(products).set({ collection: c.collection, category: c.category, updatedAt: new Date() }).where(eq(products.id, p.id));
  }
  console.log(`\nBijgewerkt: ${all.length} producten.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
