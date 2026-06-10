/**
 * Zet per waterdamphaard (SS-FPW700…3000) de eigen studio-productfoto als
 * image_url, i.p.v. één gedeelde foto.
 *
 * Bron:    scripts/haard-fotos/<SKU>.jpg  (studio-productfoto's, 1500px)
 * Doel:    upload naar product-images/sfeerhaarden/<SKU>.jpg + products.image_url per SKU.
 *
 * Dependency-vrij (pure fetch + Supabase Storage/PostgREST). Geen npm install nodig.
 *
 * Draaien:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/set-fireplace-images.mjs
 *
 * (Pakt de twee variabelen ook automatisch uit .env.local als die bestaat.)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_PRODUCT_BUCKET ?? "product-images";
if (!URL || !KEY) {
  console.error("Ontbrekend: SUPABASE_URL en/of SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const SRC_DIR = "scripts/haard-fotos";

async function main() {
  const files = readdirSync(SRC_DIR).filter((f) => /^SS-FPW\d+\.jpg$/.test(f));
  let updated = 0;
  let missing = 0;

  for (const file of files) {
    const sku = file.replace(/\.jpg$/, "");
    const path = `sfeerhaarden/${file}`;
    const body = readFileSync(`${SRC_DIR}/${file}`);

    // 1) upload (upsert) naar de publieke bucket
    const up = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body,
    });
    if (!up.ok) throw new Error(`Upload ${file}: ${up.status} ${await up.text()}`);

    const publicUrl = `${URL}/storage/v1/object/public/${BUCKET}/${path}`;

    // 2) image_url zetten op het product met deze SKU
    const patch = await fetch(
      `${URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${KEY}`,
          apikey: KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ image_url: publicUrl, updated_at: new Date().toISOString() }),
      },
    );
    if (!patch.ok) throw new Error(`Update ${sku}: ${patch.status} ${await patch.text()}`);
    const rows = await patch.json();
    if (rows.length >= 1) {
      updated++;
      console.log(`✓ ${sku} → ${publicUrl}`);
    } else {
      missing++;
      console.warn(`! geen product met sku ${sku}`);
    }
  }
  console.log(`\n${updated} haard-foto's bijgewerkt${missing ? `, ${missing} niet gevonden` : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
