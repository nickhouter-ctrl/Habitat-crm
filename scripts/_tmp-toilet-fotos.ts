import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
import { syncVariantProjection } from "@/lib/variants-sync";
async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const map = "/Users/nickhouter/Downloads/wetransfer_contentpakket-brauer-meubels-v09022026_2026-09-09_1421/Contentpakket BRAUER meubels v09022026/Accessoires & Extra's/Voor je toiletruimte/Toilet Tornado/";
  const urls: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const pad = `brauer/TL-TOHW_${i}.jpg`;
    const { error } = await sb.storage.from("product-images").upload(pad, readFileSync(`${map}TL-TOHW_${i}.jpg`), { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    if (error) throw error;
    urls.push(sb.storage.from("product-images").getPublicUrl(pad).data.publicUrl);
  }
  const [v] = await db.select().from(productVariants).where(eq(productVariants.code, "TL-TOHW"));
  await db.update(productVariants).set({ images: urls, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
  await syncVariantProjection(v.productId);
  console.log("7 extra's opnieuw geüpload");
  process.exit(0);
}
main();
