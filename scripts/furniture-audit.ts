/** Read-only: inventariseer de productdata om de meubel-taxonomie te bepalen. */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main() {
  console.log("\n=== Alle collections (count) ===");
  const cols = await db.execute(sql`
    select coalesce(collection,'(leeg)') as collection, count(*)::int as n
    from products group by 1 order by 2 desc`);
  for (const r of cols.rows ?? cols) console.log(`  ${String((r as any).collection).padEnd(28)} ${(r as any).n}`);

  console.log("\n=== collection / category / subcategory (count, sample SKU) ===");
  const tree = await db.execute(sql`
    select coalesce(collection,'(leeg)') as collection,
           coalesce(category,'(leeg)') as category,
           coalesce(subcategory,'(leeg)') as subcategory,
           count(*)::int as n,
           min(sku) as sample_sku,
           bool_or(push_to_website) as any_push,
           count(website_product_id)::int as on_site
    from products group by 1,2,3 order by 1,2,3`);
  for (const r of (tree.rows ?? tree) as any[]) {
    console.log(`  ${String(r.collection).padEnd(20)} | ${String(r.category).padEnd(22)} | ${String(r.subcategory).padEnd(20)} | n=${String(r.n).padEnd(4)} site=${r.on_site} push=${r.any_push} | ${r.sample_sku ?? ""}`);
  }

  console.log("\n=== Meubel-achtige producten (naam/sku/collection match) ===");
  const furn = await db.execute(sql`
    select count(*)::int as n from products
    where collection ilike any(array['%meubel%','%furniture%','%caracole%','%cornelius%','%seating%','%table%','%bedroom%','%dining%','%sofa%','%living%','%decor%'])
       or name ilike any(array['%sofa%','%chair%','%coffee table%','%dining table%','%sideboard%','%dresser%','%nightstand%','%armchair%','%stool%'])
       or sku ilike any(array['CLA-%','CAR%','CARCLA%'])`);
  console.log("  match count:", (furn.rows ?? furn)[0]);

  console.log("\n=== sample meubel-rijen ===");
  const sample = await db.execute(sql`
    select sku, name, collection, category, subcategory, push_to_website, website_product_id,
           (image_url is not null) as has_img
    from products
    where collection ilike any(array['%meubel%','%furniture%','%caracole%','%cornelius%','%seating%','%table%','%bedroom%','%dining%','%living%','%decor%'])
       or name ilike any(array['%sofa%','%chair%','%coffee table%','%dining table%','%sideboard%','%armchair%'])
    order by collection, category, subcategory limit 40`);
  for (const r of (sample.rows ?? sample) as any[]) {
    console.log(`  ${String(r.sku ?? "-").padEnd(16)} | ${String(r.collection ?? "-").padEnd(14)} | ${String(r.category ?? "-").padEnd(16)} | ${String(r.subcategory ?? "-").padEnd(14)} | img=${r.has_img} push=${r.push_to_website} site=${r.website_product_id ?? "-"} | ${r.name}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
