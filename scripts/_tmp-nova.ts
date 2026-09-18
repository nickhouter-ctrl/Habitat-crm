/** Nova: pakket gebruikt kleurcode NE (Nero Marquina), catalogus NM. Foto's van NE → NM, NE-uitvoeringen uit. */
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
async function main() {
  const vs = await db.select().from(productVariants).where(like(productVariants.code, "WT-NO60%"));
  for (const ne of vs.filter((v) => v.code.endsWith("NE"))) {
    const nm = vs.find((v) => v.code === ne.code.replace(/NE$/, "NM"));
    console.log(ne.code, "img:", !!ne.imageUrl, "→", nm?.code, "img:", !!nm?.imageUrl, "actief NE:", ne.isActive);
    if (!nm) continue;
    if (ne.imageUrl && !nm.imageUrl) await db.update(productVariants).set({ imageUrl: ne.imageUrl, images: ne.images, specs: { ...(nm.specs ?? {}), ...(ne.specs?.tekeningAfbeelding ? { tekeningAfbeelding: ne.specs.tekeningAfbeelding } : {}) }, updatedAt: new Date() }).where(eq(productVariants.id, nm.id));
    if (ne.isActive) await db.update(productVariants).set({ isActive: false, updatedAt: new Date() }).where(eq(productVariants.id, ne.id));
  }
  process.exit(0);
}
main();
