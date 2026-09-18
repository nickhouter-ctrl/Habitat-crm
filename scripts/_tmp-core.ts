/** CORE series (voorraadmeubels): Onderkast Core (configurator) + Meubelset Core A1/A2 (site), met prijs, EAN, voorraad. */
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { productSku } from "@/lib/import/product-import";
import { buildVariantLabel, buildVariantSku } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { bron: string; naam?: string; prijs?: number; ean?: number | string; status?: string; kleur?: string }>;
const BTW = 21, KORTING = 50;
const netto = (a: number) => { const incl = a * (1 + BTW / 100); const stap = incl < 100 ? 1 : incl < 1000 ? 5 : 10; return Math.round((Math.ceil(incl / stap - 1e-9) * stap / (1 + BTW / 100)) * 100) / 100; };
const KLEUR: Record<string, string> = { FC: "Forest Cacao", FW: "Forest Wheat", HO: "Honey" };
type Def = { naam: string; type: string; site: boolean; omschrijving: string; codes: (c: string) => boolean };
const DEFS: Def[] = [
  { naam: "Onderkast Core", type: "Onderkast", site: false, omschrijving: "Greeploze onderkast uit de CORE-serie met twee softclose lades en sifonuitsparing. Uit voorraad leverbaar.", codes: (c) => c.startsWith("OK-COA") },
  { naam: "Meubelset Core A1", type: "Meubelset", site: true, omschrijving: "Complete badkamermeubelset uit de CORE-serie: greeploze onderkast met twee softclose lades en keramische wastafel Frost met 1 kraangat. Uit voorraad leverbaar.", codes: (c) => c.startsWith("MS-COA1") },
  { naam: "Meubelset Core A2", type: "Meubelset", site: true, omschrijving: "Complete badkamermeubelset uit de CORE-serie: greeploze onderkast met twee softclose lades en keramische wastafel Starfall met 1 kraangat. Uit voorraad leverbaar.", codes: (c) => c.startsWith("MS-COA2") },
];
function opties(code: string): Record<string, string> {
  const m = code.match(/^(?:OK|MS)-COA\d?(\d{2,3})(?:-(\d))?([A-Z]{2})$/)!;
  const b = Number(m[1]); const o: Record<string, string> = { kleur: KLEUR[m[3]] ?? m[3], breedte: `${b} cm`, lades: "2 lades", uitsparingen: m[2] === "2" ? "2 uitsparingen" : "1 uitsparing" };
  if (m[2] === "2") o.wasbakken = "2 wasbakken";
  return o;
}
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const codes = Object.keys(lijst).filter((c) => lijst[c].bron === "core");
  const bestaand = new Map((await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id))).map((v) => [v.code, v]));
  for (const d of DEFS) {
    const eigen = codes.filter(d.codes).sort();
    const os = eigen.map((c) => ({ code: c, o: opties(c) }));
    const keys = ["breedte", "kleur", "lades", "uitsparingen", "wasbakken"].filter((k) => os.some((x) => x.o[k]));
    const LABEL: Record<string, string> = { breedte: "Breedte", kleur: "Kleur", lades: "Lades", uitsparingen: "Sifonuitsparingen", wasbakken: "Wasbakken" };
    const assen: ProductOptionAxis[] = keys.map((k) => ({ key: k, label: LABEL[k], values: [...new Set(os.map((x) => x.o[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })).map((w) => ({ value: w, label: w })) })).filter((a) => a.values.length > 1 || a.key === "kleur");
    let [p] = await db.select().from(products).where(and(eq(products.brandId, merk.id), eq(products.name, d.naam)));
    if (!p) [p] = await db.insert(products).values({ name: d.naam, sku: productSku(merk.skuPrefix ?? "BRA", d.type, d.naam), brandId: merk.id, category: "Badkamermeubels", subcategory: "Core", collection: "Brauer", unit: "stuk", optionAxes: assen, pushToWebsite: d.site, availability: "stock", description: d.omschrijving }).returning();
    else await db.update(products).set({ optionAxes: assen, pushToWebsite: d.site, availability: "stock", subcategory: "Core", description: p.description ?? d.omschrijving, updatedAt: new Date() }).where(eq(products.id, p.id));
    for (const [i, x] of os.entries()) {
      const r = lijst[x.code]; const advies = Number(r.prijs);
      const set = { productId: p.id, options: x.o, label: buildVariantLabel(assen, x.o) || x.code, listPriceEur: String(advies), priceEur: String(netto(advies)), discountPct: String(KORTING), purchaseCostEur: String(advies / 2), costEur: String(advies / 2), barcode: r.ean ? String(r.ean) : null, availability: "stock" as const, isActive: true, sortOrder: i, sourceRef: "prijslijst core v19-6-2026", updatedAt: new Date() };
      const b = bestaand.get(x.code);
      if (b) await db.update(productVariants).set(set).where(eq(productVariants.id, b.id));
      else await db.insert(productVariants).values({ ...set, brandId: merk.id, code: x.code, sku: buildVariantSku(merk.skuPrefix, x.code) });
    }
    await syncVariantProjection(p.id);
    console.log(`${d.naam}: ${os.length} uitvoeringen, assen ${assen.map((a) => a.key).join("/")}, site=${d.site}`);
  }
  process.exit(0);
}
main();
