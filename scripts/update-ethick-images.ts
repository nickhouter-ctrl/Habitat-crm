/**
 * Vervang de productfoto's van de ETHICK-bloempotten door kleur-correcte
 * varianten: één foto per kleurvariant i.p.v. één gedeelde modelfoto.
 *
 * Bron: /tmp/ethick/variants/<fullSKU>.jpg  (van scripts/ethick-recolour-variants.py)
 * Upload naar product-images/ethick/var/ en zet products.image_url per SKU.
 */
import { readdirSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const VARIANT_DIR = "/tmp/ethick/variants";
const BUCKET = "product-images";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const files = readdirSync(VARIANT_DIR).filter((f) => f.endsWith(".jpg"));
  let updated = 0;
  let missing = 0;
  for (const file of files) {
    const sku = file.replace(/\.jpg$/, "");
    const path = `ethick/var/${file}`;
    const up = await sb.storage
      .from(BUCKET)
      .upload(path, readFileSync(`${VARIANT_DIR}/${file}`), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (up.error) throw new Error(`Upload ${file}: ${up.error.message}`);
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const res = await sql`UPDATE products SET image_url = ${url}, updated_at = NOW() WHERE sku = ${sku}`;
    if (res.count === 1) updated++;
    else {
      missing++;
      console.warn(`! geen product met sku ${sku}`);
    }
  }
  console.log(`${updated} productfoto's bijgewerkt${missing ? `, ${missing} niet gevonden` : ""}.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
