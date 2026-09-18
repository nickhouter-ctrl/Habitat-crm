/**
 * Meubelprogramma per onderdeel: onderkast / bijkast / hoge kast / fonteinkast /
 * fonteinbak / wastafel / topblad / waskom per serie, met breedte, uitvoering en
 * kleur uit de mapstructuur en de code. Bestaande uitvoeringen verhuizen mee;
 * nieuwe codes uit het pakket komen erbij (prijzen volgen met de prijslijst).
 */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { productSku } from "@/lib/import/product-import";
import { buildVariantLabel, buildVariantSku } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const idx = JSON.parse(readFileSync(`${S}/brauer-meubel-bestanden.json`, "utf8")) as Record<string, string[]>;
const TYPE: Record<string, { label: string; cat: string }> = {
  "Onderkasten": { label: "Onderkast", cat: "Badkamermeubels" }, "Bijkasten": { label: "Bijkast", cat: "Badkamermeubels" },
  "Hoge kasten": { label: "Hoge kast", cat: "Badkamermeubels" }, "Fonteinkasten": { label: "Fonteinkast", cat: "Badkamermeubels" }, "Fonteinbak": { label: "Fonteinbak", cat: "Badkamermeubels" },
  "Wastafels": { label: "Wastafel", cat: "Badkamermeubels" }, "Wastafel": { label: "Wastafel", cat: "Badkamermeubels" }, "Topbladen": { label: "Topblad", cat: "Badkamermeubels" }, "Waskommen": { label: "Waskom", cat: "Badkamermeubels" },
};
type Onderdeel = { code: string; type: string; serie: string; options: Record<string, string> };

function ontleed(code: string, paden: string[], kleurVanCode: Map<string, string>): Onderdeel | null {
  if (code.includes(",")) return null;
  // de eigen packshot (bestandsnaam == code) bepaalt de map; een combo-render kan elders staan
  const eigen = paden.find((p) => new RegExp(`/${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(_\\d+)?\\.(jpe?g|png)$`, "i").test(p)) ?? paden[0];
  const m = eigen.match(/v09022026\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/[^/]+$/); if (!m) return null;
  const [, hoofd, sub, subsub] = m;
  // meubelgrepen en Believe-fronten: eigen onderdelen
  if (/^MB-MG/i.test(code)) { const k = code.match(/^MB-MG([A-Z])([A-Z])(\d+)([A-Z]+)$/i); const kl = k ? kleurVanCode.get(k[4].toUpperCase()) ?? { CE: "Chroom", GG: "Geborsteld goud", GK: "Geborsteld koper", GM: "Geborsteld gunmetal", NG: "Geborsteld RVS", MZ: "Mat zwart", ALU: "Aluminium" }[k[4].toUpperCase()] ?? `?${k[4]}` : "?"; return { code, type: "Meubelgreep", serie: k ? `model ${k[2].toUpperCase()}` : "", options: { kleur: kl, ...(k ? { maat: `${k[3]} mm` } : {}) } }; }
  if (/^BP-/i.test(code)) { const k = code.match(/^BP-([A-Z]+)(\d+)([A-Z]+)$/i); return { code, type: "Front", serie: "Believe", options: { kleur: k ? kleurVanCode.get(k[3].toUpperCase()) ?? `?${k[3]}` : "?", breedte: k ? `${k[2]} cm` : "" } }; }
  if (!/^(Onderkasten & Bijkasten|Hoge kasten|Fonteinkasten & Fonteinbakken|Wastafels|Topbladen|Waskommen)$/.test(hoofd)) return null;
  const sm = sub.match(/^(Onderkasten|Bijkasten|Hoge kasten|Fonteinkasten|Fonteinbak|Wastafels|Wastafel|Topbladen|Waskommen)\s+(.+)$/); if (!sm) return null;
  const type = TYPE[sm[1]].label; const serie = sm[2].trim();
  const o: Record<string, string> = {};
  // breedte + uitvoering uit de submap: "Adore 120-1", "Adore 60 ondiep", "Aurora 100 links"
  const f = (subsub ?? "").replace(/^.*?\b(\d{2,3})/, "$1");
  const fm = f.match(/^(\d{2,3})(?:-(\d))?\s*(ondiep|links|rechts)?/i);
  // "120-1" = 1 sifonuitsparing (1 wasbak), "120-2" = 2 uitsparingen (2 wasbakken), "120-4" = 4 lades met 2 uitsparingen (catalogus p36)
  if (fm) { o.breedte = `${fm[1]} cm`; if (fm[3]) o[/ondiep/i.test(fm[3]) ? "uitvoering" : "positie"] = fm[3][0].toUpperCase() + fm[3].slice(1).toLowerCase(); }
  else { const cm = code.match(/^[A-Z0-9]+-[A-Z]+(\d{2,4})/i); if (cm) { let b = Number(cm[1]); if (b >= 250) b = Math.round(b / 10); o.breedte = `${b} cm`; } }
  // waskommen: maat + vorm + kleur (WK-BO40ROMW → 40 cm, rond, mat wit)
  if (/^WK-/i.test(code)) { const w = code.match(/^WK-[A-Z]+(\d+)(RO|RA|OV|PO)([A-Z]+)$/i); if (w) { delete o.breedte; o.maat = `${w[1]} cm`; o.vorm = { RO: "Rond", RA: "Rechthoekig", OV: "Ovaal", PO: "Organisch" }[w[2].toUpperCase()]!; const kk = w[3].toUpperCase(); o.kleur = kleurVanCode.get(kk) ?? { HW: "Hoogglans Wit", MW: "Mat Wit", MZ: "Mat zwart", MG: "Mat Grijs", AN: "Antraciet", MPB: "Mat Pastel Blauw", MPG: "Mat Pastel Groen", MPR: "Mat Pastel Roze" }[kk] ?? `?${kk}`; return { code, type, serie, options: o }; } }
  // wastafels: WT-AU1001HW → 100 cm, 1 kraangat; WT-LU120-22MZ → 120 cm, 2 wasbakken, 2 kraangaten
  if (/^WT-/i.test(code)) { const w = code.match(/^WT-[A-Z]+?(\d{2,3})(?:-(\d)(\d)|(\d))([A-Z]+)$/i); if (w) {
    o.breedte = `${w[1]} cm`; if (/lade/.test(o.uitvoering ?? "")) delete o.uitvoering; // "120-1" is hier 1 wasbak, geen lade
    if (w[2]) o.wasbakken = w[2] === "1" ? "1 wasbak" : `${w[2]} wasbakken`;
    const g = w[3] ?? w[4]; o.kraangat = g === "0" ? "Zonder kraangat" : g === "1" ? "1 kraangat" : `${g} kraangaten`;
    const kk = w[5].toUpperCase(); o.kleur = kleurVanCode.get(kk) ?? `?${kk}`;
    return { code, type, serie, options: o }; } }
  // onderkasten: lades en sifonuitsparingen per maat (catalogus p36 e.v.): 60–100 en 120-1 = 1 uitsparing,
  // 120-2 = 2 uitsparingen, 120-4/140/160/200 = 4 lades en 2 uitsparingen; Hope 1 lade; Embrace 2 lades breed, 3 lades bij 220 (geen uitsparing)
  if (type === "Onderkast" && !/^(Believe|Amaze)/.test(serie)) { // open frames zonder lades
    const b = parseInt(o.breedte ?? "0", 10); const v = fm?.[2];
    const smal = /^Hope/.test(serie) ? 1 : 2;
    if (b === 220) { o.lades = "3 lades"; }
    else if (b >= 140 || v === "4") { o.lades = /^Embrace/.test(serie) ? "2 lades" : "4 lades"; o.uitsparingen = "2 uitsparingen"; }
    else if (b === 120) { o.lades = `${smal} lade${smal === 1 ? "" : "s"}`; o.uitsparingen = v === "2" ? "2 uitsparingen" : "1 uitsparing"; }
    else if (b > 0) { o.lades = `${smal} lade${smal === 1 ? "" : "s"}`; o.uitsparingen = "1 uitsparing"; }
  }
  // kleur uit de code, eventueel met L/R ervoor
  let k = code.match(/\d([A-Z]{1,4})$/i)?.[1]?.toUpperCase() ?? "";
  if (k && !kleurVanCode.has(k) && /^[LR]/.test(k) && k.length >= 3 && kleurVanCode.has(k.slice(1))) { o.positie = k[0] === "L" ? "Links" : "Rechts"; k = k.slice(1); }
  if (k) o.kleur = kleurVanCode.get(k) ?? `?${k}`;
  return { code, type, serie, options: o };
}

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  let prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const kleurVanCode = new Map<string, string>();
  for (const v of vars) { const m = v.code.match(/^(?:OK|HK|TB|2xOK|WT|FO|MD)-[A-Z]+\d+([A-Z]{2,3})$/i); if (m && v.options?.kleur && !v.options.kleur.startsWith("?")) kleurVanCode.set(m[1].toUpperCase(), v.options.kleur); }
  for (const [k, v] of [["HW", "Hoogglans Wit"], ["MW", "Mat Wit"], ["ZW", "Zwart"], ["IT", "Italiaans marmer"], ["HO", "Honey"], ["AN", "Antraciet"]] as const) if (!kleurVanCode.has(k)) kleurVanCode.set(k, v);
  // de meubelcatalogus (brauer-meubel.csv) is leidend: MZ = Mat Zand, MS = Mat zwart (bij kranen is MZ mat zwart)
  for (const [k, v] of [["MZ", "Mat Zand"], ["MS", "Mat zwart"], ["MB", "Mat Beige"], ["MG", "Mat Grijs"], ["MM", "Mat Mokka"], ["MT", "Mat Taupe"], ["NM", "Basalt Nero Marquina"], ["NE", "Basalt Nero Marquina"], ["CG", "Calacatta Gold"], ["CB", "Copper Brown"], ["SL", "Sunlit"], ["TA", "Timber Anthracite"], ["TB", "Timber Black"], ["TG", "Timber Grey"], ["VEG", "Vingerlas Eiken Grijs"]] as const) kleurVanCode.set(k, v);

  // dezelfde code met andere hoofdletters (2xOK-… / 2XOK-…) is één uitvoering: samenvoegen op de bestaande schrijfwijze
  const codeBijUpper = new Map(vars.map((v) => [v.code.toUpperCase(), v.code]));
  const idxNorm = new Map<string, string[]>();
  for (const [code, paden] of Object.entries(idx)) { const c = codeBijUpper.get(code.toUpperCase()) ?? [...idxNorm.keys()].find((k) => k.toUpperCase() === code.toUpperCase()) ?? code; idxNorm.set(c, [...(idxNorm.get(c) ?? []), ...paden]); }
  const perProduct = new Map<string, Onderdeel[]>(); let onbekend = 0;
  for (const [code, paden] of idxNorm.entries()) {
    const o = ontleed(code, paden, kleurVanCode); if (!o) continue;
    const naam = `${o.type} ${o.serie}`; perProduct.set(naam, [...(perProduct.get(naam) ?? []), o]);
    if ((o.options.kleur ?? "").startsWith("?")) onbekend++;
  }
  const bestaandCode = new Map(vars.map((v) => [v.code, v]));
  let nieuw = 0, verhuisd = 0;
  for (const [naam, delen] of [...perProduct.entries()].sort()) {
    const n = delen.filter((d) => !bestaandCode.has(d.code)).length; nieuw += n; verhuisd += delen.length - n;
    const breedtes = [...new Set(delen.map((d) => d.options.breedte).filter(Boolean))].sort((a, b) => parseInt(a!) - parseInt(b!));
    const kleuren = new Set(delen.map((d) => d.options.kleur).filter(Boolean));
    console.log(`${naam}: ${delen.length} (${n} nieuw) · breedtes ${breedtes.join("/")} · ${kleuren.size} kleuren${[...kleuren].some((k) => k!.startsWith("?")) ? " (waarvan onbekend: " + [...kleuren].filter((k) => k!.startsWith("?")).join(",") + ")" : ""}`);
    if (!TOEPASSEN) continue;
    const keys = ["kleur", "breedte", "maat", "vorm", "uitvoering", "lades", "uitsparingen", "positie", "wasbakken", "kraangat"].filter((k) => delen.some((d) => d.options[k]));
    const LABEL: Record<string, string> = { kleur: "Kleur", breedte: "Breedte", maat: "Maat", vorm: "Vorm", uitvoering: "Uitvoering", positie: "Positie", lades: "Lades", uitsparingen: "Sifonuitsparingen", wasbakken: "Wasbakken", kraangat: "Kraangat" };
    const assen: ProductOptionAxis[] = keys.map((k) => ({ key: k, label: LABEL[k], values: [...new Set(delen.map((d) => d.options[k]).filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "nl", { numeric: true })).map((w) => ({ value: w!, label: w! })) })).filter((a) => a.values.length > 1 || a.key === "kleur");
    let p = prods.find((x) => x.name === naam);
    if (!p) { [p] = await db.insert(products).values({ name: naam, sku: productSku(merk.skuPrefix ?? "BRA", delen[0].type, naam), brandId: merk.id, category: "Badkamermeubels", subcategory: delen[0].serie, collection: "Brauer", unit: "stuk", optionAxes: assen, pushToWebsite: false, availability: "order_only" }).returning(); prods.push(p); }
    else await db.update(products).set({ optionAxes: assen, imageUrl: null, updatedAt: new Date() }).where(eq(products.id, p.id));
    for (const [i, d] of delen.entries()) {
      const actief = !(d.options.kleur ?? "").startsWith("?");
      const b = bestaandCode.get(d.code);
      if (b) await db.update(productVariants).set({ productId: p.id, options: d.options, label: buildVariantLabel(assen, d.options) || d.code, isActive: actief, updatedAt: new Date() }).where(eq(productVariants.id, b.id));
      else await db.insert(productVariants).values({ productId: p.id, brandId: merk.id, code: d.code, sku: buildVariantSku(merk.skuPrefix, d.code), label: buildVariantLabel(assen, d.options) || d.code, options: d.options, availability: "order_only", sortOrder: i, isActive: actief, sourceRef: "meubelpakket 09-02-2026" });
    }
    await syncVariantProjection(p.id);
  }
  console.log(`producten ${perProduct.size} · uitvoeringen nieuw ${nieuw}, verhuisd ${verhuisd} · onbekende kleurcodes ${onbekend}` + (TOEPASSEN ? " — gedaan" : " (droogloop)"));
  if (TOEPASSEN) {
    // lege oude serieproducten opruimen
    const leeg = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.brandId, merk.id));
    for (const p of leeg) { const [{ n }] = await db.select({ n: productVariants.id }).from(productVariants).where(eq(productVariants.productId, p.id)).limit(1).then((r) => [{ n: r.length }]); if (!n && p.name && (pm.get(p.id)?.category === "Badkamermeubels")) { await db.delete(products).where(eq(products.id, p.id)); console.log("leeg weg:", p.name); } }
  }
  process.exit(0);
}
main();
