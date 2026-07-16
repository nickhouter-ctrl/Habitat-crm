import "./load-env";
async function main() {
  const { db } = await import("../lib/db");
  const { sql } = await import("drizzle-orm");
  const q = async (label: string, s: unknown) => {
    const r = await db.execute(s as never);
    console.log(label, JSON.stringify(r));
  };
  await q("products.collection:", sql`select distinct collection from products where collection ilike '%flexibel%'`);
  await q("catalog_collections.category:", sql`select distinct category from catalog_collections where category ilike '%flexibel%'`);
  await q("catalog_collections.nameEn:", sql`select id, name_en from catalog_collections where name_en ilike '%flexibel%' limit 5`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
