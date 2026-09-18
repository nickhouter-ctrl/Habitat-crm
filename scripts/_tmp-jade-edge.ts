/** Spiegel Jade Edge: twee uitvoeringen hadden dezelfde opties (70 cm · Rond) → geen keuze-as, dus geen prijs op de site. */
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const UITVOERING: Record<string, string> = { "SP-JDE70RO": "Zwart frame", "SP-JDE70ROO": "Zwart frame met ophangband" };
async function main() {
  const vs = await db.select().from(productVariants).where(like(productVariants.code, "SP-JDE%"));
  if (!vs.length) { console.log("geen uitvoeringen"); process.exit(0); }
  const assen: ProductOptionAxis[] = [
    { key: "maat", label: "Maat", values: [{ value: "70 cm", label: "70 cm" }] },
    { key: "uitvoering", label: "Uitvoering", values: Object.values(UITVOERING).map((v) => ({ value: v, label: v })) },
  ];
  for (const v of vs) {
    const o = { ...(v.options ?? {}), uitvoering: UITVOERING[v.code] ?? "Zwart frame" } as Record<string, string>;
    delete o.vorm; // beide zijn rond — dat hoort in de naam, niet als keuze
    await db.update(productVariants).set({ options: o, label: buildVariantLabel(assen, o) || v.code, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    console.log(v.code, "→", o.uitvoering);
  }
  await db.update(products).set({ optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, vs[0].productId));
  await syncVariantProjection(vs[0].productId);
  process.exit(0);
}
main();
