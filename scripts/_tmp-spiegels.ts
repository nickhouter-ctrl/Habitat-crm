/** Spiegels, spiegelkasten en planchetten uit het meubelpakket als producten (namen uit de mapstructuur; prijzen volgen). */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { productSku } from "@/lib/import/product-import";
import { buildVariantLabel, buildVariantSku } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const idx = JSON.parse(readFileSync(`${S}/brauer-meubel-bestanden.json`, "utf8")) as Record<string, string[]>;

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const bestaand = new Set(vars.map((v) => v.code));
  // kleurcode → kleurnaam, geleerd van de meubel-uitvoeringen die er al zijn (OK-AR100MZ → "Mat zwart")
  const kleurVanCode = new Map<string, string>();
  for (const v of vars) { const m = v.code.match(/^(?:OK|HK|TB|2xOK|WT)-[A-Z]+\d+([A-Z]{2,3})$/i); if (m && v.options?.kleur) kleurVanCode.set(m[1].toUpperCase(), v.options.kleur); }
  console.log("kleurcodes bekend:", [...kleurVanCode.entries()].map(([k, v]) => `${k}=${v}`).join(", "));

  type Groep = { naam: string; categorie: string; serie: string | null; codes: Array<{ code: string; options: Record<string, string> }> };
  const groepen = new Map<string, Groep>();
  for (const [code, paden] of Object.entries(idx)) {
    if (bestaand.has(code)) continue;
    const m = paden[0].match(/v09022026\/([^/]+)\/([^/]+)(?:\/([^/]+))?\//); if (!m) continue;
    const [, hoofd, sub, subsub] = m;
    let naam: string | null = null, categorie = "", serie: string | null = null; const options: Record<string, string> = {};
    if (hoofd === "Spiegels") {
      if (sub === "Spiegelverwarming") { naam = "Spiegelverwarming"; categorie = "Accessoires"; const mm = code.match(/SPV(\d{2})(\d{2})$/); if (mm) options.maat = `${mm[1]}x${mm[2]} cm`; }
      else {
        serie = sub.replace(/^Spiegels?\s+/, ""); naam = `Spiegel ${serie}`; categorie = "Spiegels";
        // maat uit de map of uit de code (SP-JS160RH → 160); achtervoegsel = uitvoering (RH/OV …) als er per maat meerdere zijn
        const mm = (subsub ?? "").match(/(\d{2,3})\s*$/) ?? code.match(/^SP-[A-Z]+(\d{2,3})/i);
        if (mm) options.maat = `${mm[1]} cm`;
        const suf = code.match(/\d([A-Z]{1,3})$/i)?.[1]; if (suf) options.uitvoering = suf.toUpperCase();
      }
    } else if (hoofd === "Spiegelkasten") {
      serie = sub.replace(/^Spiegelkasten\s+/, ""); naam = `Spiegelkast ${serie}`; categorie = "Spiegelkasten";
      const mm = (subsub ?? "").match(/(\d{2,3})\s*$/); if (mm) options.maat = `${mm[1]} cm`;
      // kleurcode, eventueel met L/R ervoor (scharnierzijde)
      let k = code.match(/\d([A-Z]{2,4})$/i)?.[1]?.toUpperCase() ?? "";
      if (!kleurVanCode.has(k) && /^[LR]/.test(k) && k.length >= 3) { options.positie = k[0] === "L" ? "Links" : "Rechts"; k = k.slice(1); }
      if (k) options.kleur = kleurVanCode.get(k) ?? `?${k}`;
    } else if (hoofd === "Accessoires & Extra's" && sub === "Planchetten") {
      serie = (subsub ?? "").replace(/^Planchet\s+/, ""); naam = `Planchet ${serie}`; categorie = "Accessoires";
      const mm = code.match(/^AE-[A-Z]+(\d{2,3})([A-Z]{2,3})$/i); if (mm) { options.maat = `${mm[1]} cm`; options.kleur = kleurVanCode.get(mm[2].toUpperCase()) ?? `?${mm[2].toUpperCase()}`; }
    } else continue;
    if (!naam) continue;
    const g = groepen.get(naam) ?? { naam, categorie, serie, codes: [] }; g.codes.push({ code, options }); groepen.set(naam, g);
  }
  for (const g of groepen.values()) {
    const maten = new Set(g.codes.map((c) => c.options.maat).filter(Boolean)); const kleuren = new Set(g.codes.map((c) => c.options.kleur).filter(Boolean));
    console.log(`${g.categorie} · ${g.naam}: ${g.codes.length} uitvoeringen · maten ${[...maten].sort((a, b) => parseInt(a) - parseInt(b)).join("/")}${kleuren.size ? ` · kleuren ${[...kleuren].join("/")}` : ""}`);
    if (!TOEPASSEN) continue;
    // "uitvoering" alleen als er per maat meerdere codes zijn; anders is het ruis
    const perMaat = new Map<string, number>(); for (const c of g.codes) perMaat.set(c.options.maat ?? "", (perMaat.get(c.options.maat ?? "") ?? 0) + 1);
    if (![...perMaat.values()].some((n) => n > 1)) for (const c of g.codes) delete c.options.uitvoering;
    const keys = [...new Set(g.codes.flatMap((c) => Object.keys(c.options)))].sort((a) => (a === "kleur" ? -1 : 1));
    const LABEL: Record<string, string> = { kleur: "Kleur", maat: "Maat", positie: "Positie", uitvoering: "Uitvoering" };
    const assen: ProductOptionAxis[] = keys.map((k) => ({ key: k, label: LABEL[k] ?? k, values: [...new Set(g.codes.map((c) => c.options[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })).map((w) => ({ value: w, label: w })) })).filter((a) => a.values.length > 1 || a.key === "kleur");
    const bestaandP = prods.find((p) => p.name === g.naam);
    const [p] = bestaandP ? [bestaandP] : await db.insert(products).values({ name: g.naam, sku: productSku(merk.skuPrefix ?? "BRA", g.serie, g.naam), brandId: merk.id, category: g.categorie, subcategory: g.serie, collection: "Brauer", unit: "stuk", optionAxes: assen, pushToWebsite: true, availability: "order_only" }).returning({ id: products.id, name: products.name, category: products.category });
    for (const [i, c] of g.codes.entries()) await db.insert(productVariants).values({ productId: p.id, brandId: merk.id, code: c.code, sku: buildVariantSku(merk.skuPrefix, c.code), label: buildVariantLabel(assen, c.options) || c.code, options: c.options, availability: "order_only", sortOrder: i,
      // kleurcode die we (nog) niet kennen: wel in het CRM, niet op de site tot de prijslijst hem benoemt
      isActive: !(c.options.kleur ?? "").startsWith("?"), sourceRef: "meubelpakket 09-02-2026" }).onConflictDoNothing();
    await syncVariantProjection(p.id);
  }
  console.log(`${groepen.size} producten` + (TOEPASSEN ? " aangemaakt" : " (droogloop)"));
  process.exit(0);
}
main();
