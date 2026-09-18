// Read-only snapshot for reviewing the calculator. Never updates the database.
import fs from 'node:fs';
import postgres from 'postgres';
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 15 });
try {
  await db.begin('read only', async tx => {
    const posts = await tx`select * from price_book_items where active order by sort_order,name`;
    const catalog = await tx`select p.id as product_id, p.name, p.category, p.collection, p.unit, p.width_mm, p.height_mm, p.length_mm, p.description, b.name brand,
      v.id as variant_id, v.code, v.label, v.options, v.specs,
      coalesce(v.price_eur,p.price_eur) price, coalesce(v.cost_eur,p.cost_eur) cost,
      v.list_price_eur, v.source_ref, v.last_imported_at
      from products p left join brands b on b.id=p.brand_id
      left join product_variants v on v.product_id=p.id and v.is_active
      where (b.name ilike 'brauer' or p.brand_id is null)
      and coalesce(v.price_eur,p.price_eur)>0`;
    fs.writeFileSync('/private/tmp/habitat-calculator-audit.json', JSON.stringify({posts,catalog},null,2));
    console.log(`${posts.length} prijzenboekposten en ${catalog.length} catalogusuitvoeringen alleen-lezen gecontroleerd.`);
  });
} catch(e) { console.error('Databasecontrole mislukt:',e.code); process.exitCode=1; }
finally { await db.end({timeout:3}); }
