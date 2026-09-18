/** Gerenderde technische tekeningen (PNG) naar de productbucket, gekoppeld aan de uitvoering. */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, productVariants } from "@/lib/db/schema";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BUCKET = process.env.SUPABASE_PRODUCT_BUCKET ?? "product-images";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const vars = await db.select({ id: productVariants.id, code: productVariants.code, specs: productVariants.specs }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const teDoen = vars.filter((v) => !v.specs?.tekeningAfbeelding && existsSync(`/tmp/brauer-tekeningen/${v.code}_T.png`));
  console.log(`te uploaden: ${teDoen.length}`);
  let i = 0, klaar = 0, fouten = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < teDoen.length) {
      const v = teDoen[i++];
      try {
        const pad = `brauer/${v.code}_T.png`;
        const { error } = await sb.storage.from(BUCKET).upload(pad, readFileSync(`/tmp/brauer-tekeningen/${v.code}_T.png`), { contentType: "image/png", upsert: true });
        if (error) throw new Error(error.message);
        const url = sb.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl;
        await db.update(productVariants).set({ specs: { ...(v.specs ?? {}), tekeningAfbeelding: url } }).where(eq(productVariants.id, v.id));
        klaar++; if (klaar % 500 === 0) console.log(`  ${klaar}/${teDoen.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
      } catch (e) { fouten++; console.error(`! ${v.code}: ${(e as Error).message}`); }
    }
  }));
  console.log(`klaar: ${klaar} geüpload, ${fouten} fouten, ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(0);
}
main();
