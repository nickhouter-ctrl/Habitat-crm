/**
 * BRAUER-contentpakket verwerken: prijslijsten + foto's + technische tekeningen.
 *
 *   npx tsx --env-file=.env.local scripts/brauer-content.ts [stappen] [--toepassen]
 *
 * Stappen (zonder stap-vlag draaien ze allemaal):
 *   --prijzen   adviesprijs ex btw als verkoopprijs, inkoop = 50% (marge 50%),
 *               EAN als barcode, leverstatus als beschikbaarheid
 *   --nieuw     codes uit de prijslijst die het CRM nog niet kent: bij een
 *               bestaand product (zelfde nummer, andere kleur) of als nieuw
 *               product via de gewone import
 *   --fotos     hoofdfoto + extra foto's + tekening per uitvoering naar de
 *               productbucket; productfoto en kleurplaatjes afleiden
 *
 * Zonder --toepassen is het een droogloop: alleen tellen en tonen.
 *   --force     ook foto's opnieuw doen bij uitvoeringen die er al een hebben
 *   --limit N   hoogstens N uitvoeringen fotograferen (om te proeven)
 *
 * Invoer: de twee JSON-bestanden die uit de WeTransfer-mappen zijn gehaald
 * (prijslijst per code, en bestandspaden per code); zie --prijslijst/--bestanden.
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { parseBrauerCode, BRAUER_HENDELS } from "@/lib/brauer";
import { db } from "@/lib/db";
import { brands, productVariants, products, type ProductOptionAxis } from "@/lib/db/schema";
import { applyImport } from "@/lib/import/apply-import";
import { planImport, type BestaandeVariant, type ImportRow } from "@/lib/import/product-import";
import { buildVariantLabel, buildVariantSku, normalizeCode } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";

/* ----------------------------------------------------------------------------
   Argumenten
---------------------------------------------------------------------------- */
const args = process.argv.slice(2);
const vlag = (n: string) => args.includes(`--${n}`);
const waarde = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SCRATCH =
  "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const PRIJSLIJST = waarde("prijslijst") ?? `${SCRATCH}/brauer-prijslijst.json`;
const BESTANDEN = waarde("bestanden") ?? `${SCRATCH}/brauer-bestanden.json`;
/** Map waartegen relatieve paden in het bestandenoverzicht worden opgelost. */
const BASIS = waarde("basis") ?? path.join(os.homedir(), "Downloads");
const TOEPASSEN = vlag("toepassen");
const FORCE = vlag("force");
const LIMIT = Number(waarde("limit") ?? 0) || 0;
const alleStappen = !vlag("prijzen") && !vlag("nieuw") && !vlag("fotos");
const DOE = { prijzen: alleStappen || vlag("prijzen"), nieuw: alleStappen || vlag("nieuw"), fotos: alleStappen || vlag("fotos") };

/** Onze marge: inkoop is de helft van de adviesverkoopprijs. */
const INKOOP_KORTING_PCT = 50;
const MAX_EXTRA_FOTOS = 8;
const FOTO_BREEDTE = 1400;
const GELIJKTIJDIG = 6;
const BUCKET = process.env.SUPABASE_PRODUCT_BUCKET ?? "product-images";

/* ----------------------------------------------------------------------------
   Invoer
---------------------------------------------------------------------------- */
type Lijstregel = {
  bron: "kranen" | "glas" | "beide";
  naam?: string | null;
  prijs?: number | string | null;
  kleur?: string | null;
  materiaal?: string | null;
  ean?: string | number | null;
  status?: string | null;
  hoofdcat?: string | null;
  cat?: string | null;
  groep?: string | null;
  serie?: string | null;
};
const lijst = JSON.parse(readFileSync(PRIJSLIJST, "utf8")) as Record<string, Lijstregel>;
const bestanden = JSON.parse(readFileSync(BESTANDEN, "utf8")) as Record<string, string[]>;

const bedrag = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const inkoop = (advies: number) => Math.round(advies * (1 - INKOOP_KORTING_PCT / 100) * 100) / 100;
const beschikbaar = (status: string | null | undefined): "stock" | "order_only" =>
  /^uit voorraad leverbaar$/i.test((status ?? "").trim()) ? "stock" : "order_only";

/* ----------------------------------------------------------------------------
   Kleuren — de prijslijst schrijft ze anders dan het CRM
---------------------------------------------------------------------------- */
const KLEUR_CANON: Record<string, string> = {
  chroom: "Chroom",
  "mat zwart": "Mat zwart",
  zwart: "Mat zwart",
  "rvs-kleurig geborsteld": "Geborsteld RVS",
  "rvs-kleurig": "Geborsteld RVS",
  rvs: "Geborsteld RVS",
  "goud geborsteld": "Geborsteld goud",
  goud: "Geborsteld goud",
  "koper geborsteld": "Geborsteld koper",
  koper: "Geborsteld koper",
  "gunmetal geborsteld": "Geborsteld gunmetal",
  gunmetal: "Geborsteld gunmetal",
  coffee: "Coffee",
  wit: "Wit",
};
const KLEURCODE_CANON: Record<string, string> = {
  CE: "Chroom",
  S: "Mat zwart",
  GK: "Geborsteld koper",
  NG: "Geborsteld RVS",
  GM: "Geborsteld gunmetal",
  GG: "Geborsteld goud",
  CF: "Coffee",
};
const GLASSOORTEN = new Set(["helder", "mat", "grijs", "rookglas", "gesatineerd"]);

/** Kleur (en eventueel glassoort) van een regel: eerst uit de code, dan uit de kolom. */
function kleurVan(code: string, regel: Lijstregel): { kleur: string | null; glas: string | null } {
  const c = parseBrauerCode(code);
  if (c) return { kleur: KLEURCODE_CANON[c.kleur] ?? null, glas: null };
  const delen = String(regel.kleur ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  let kleur: string | null = null;
  let glas: string | null = null;
  for (const d of delen) {
    if (GLASSOORTEN.has(d)) glas = d[0].toUpperCase() + d.slice(1);
    else if (KLEUR_CANON[d]) kleur = KLEUR_CANON[d];
  }
  return { kleur, glas };
}

/* ----------------------------------------------------------------------------
   Namen en categorieën voor nieuwe producten
---------------------------------------------------------------------------- */
// De prijslijst zet de kleur óók in de naam, half Engels ("Gold Edition",
// "Brushed", "PVD"); alles wat kleur is gaat eruit, de kleur-as doet de rest.
const KLEURWOORDEN =
  /\b(PVD\s+)?(chroom|chrome|mat\s+zwart|zwart|black|goud(\s+geborsteld)?|gold|koper(\s+geborsteld)?|copper|gunmetal(\s+geborsteld)?|rvs(-kleurig)?(\s+geborsteld)?|brushed|geborsteld|coffee|wit|pvd|brauer)\b/gi;
const MAAT = /\b(\d{1,3})\s*[x×]\s*(\d{2,3})\b/;

function schoneNaam(naam: string): { productName: string; series: string | null; maat: string | null } {
  let n = naam.replace(/^BRAUER\s+/i, "").replace(/\bONDERDEEL\b/i, "Onderdeel");
  const m = n.match(MAAT);
  const maat = m ? `${m[1]}x${m[2]} cm` : null;
  if (m) n = n.replace(MAAT, " ");
  n = n.replace(KLEURWOORDEN, " ");
  let series: string | null = null;
  if (/\bCarving\b/i.test(n)) series = "Carving";
  else if (/\bStripe\b/i.test(n)) series = "Stripe";
  else if (/\bEdition\b/i.test(n)) series = "Edition";
  if (series) n = n.replace(/\b(Chrome\s+)?Edition\b/gi, " ").replace(/\b(Carving|Stripe|Chrome)\b/gi, " ");
  n = n
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim()
    .replace(/[,\-–]\s*$/, "")
    .trim();
  if (n) n = n[0].toUpperCase() + n.slice(1);
  return { productName: n, series, maat };
}

/** CRM-categorie voor een nieuwe code: uit de glaslijst, anders uit de map, anders uit de naam. */
function categorieVoor(code: string, regel: Lijstregel): string {
  const cat = (regel.cat ?? "").toLowerCase();
  const hoofd = (regel.hoofdcat ?? "").toLowerCase();
  const n = (regel.naam ?? "").toLowerCase();
  // Eerst op de naam: de lijst zet accessoires en losse onderdelen nogal eens in een verzamelbak.
  if (/^brauer onderdeel|^onderdeel/.test(n)) return "Onderdelen";
  if (/handdoek|afvalbak|raamtrekker|zeep|klikwaste|bedieningsplaat|inbouwnis|opbouwnis|\bnis\b|radiator|sifon|overloop|toiletrol|toiletborstel|haak\b|schoonmaak|planchet/.test(n))
    return "Accessoires";
  if (/muurarm|plafondarm|douchearm/.test(n)) return "Douchearmen";
  if (/glijstang/.test(n) && !/set|douche\b/.test(n)) return "Glijstangen";
  if (/wandhouder|wandaansluitbocht|losse inbouw stopkraan|uitloop met rozet/.test(n) && !/\bset\b|thermostaat/.test(n))
    return "Kraan-onderdelen";
  if (/rooster/.test(n) && /los/.test(n)) return "Douchegoten";
  if (/^brauer onderdeel|^onderdeel/.test(n)) return "Onderdelen";
  if (cat) {
    if (/inloopdouche|douchecabine|badwand|wanden en deuren|nisopstelling|zelf samenstellen/.test(cat)) return "Douchewanden";
    if (/onderdelen/.test(cat)) return "Onderdelen";
    if (/beslag/.test(cat)) return "Douchewand-onderdelen";
    if (/douchevloer/.test(cat)) return code.startsWith("DB") ? "Douchebakken" : "Douchegoten";
    if (/nissen/.test(cat)) return "Accessoires";
    if (/toilet/.test(cat) && /toiletten/.test(cat)) return "Toiletten";
    if (hoofd.includes("accessoires") || /wastafel|handdoek|toiletruimte|opbergen|verzorging|diverse|topblad|onderhoud/.test(cat))
      return "Accessoires";
  }
  const map = bestanden[code]?.[0] ?? "";
  const mm = map.match(/Contentpakket BRAUER kranen v26112025\/([^/]+)\//);
  if (mm) return mm[1].replace(/ & extra's$/i, "").replace(/^Accessoires$/, "Accessoires").replace(/^Overige$/, "Overig");
  if (/fonteinkraan/.test(n)) return "Fonteinkranen";
  if (/wastafelkraan|wastafelmengkraan/.test(n)) return "Wastafelkranen";
  if (/badkraan|badmengkraan|badvuller/.test(n)) return "Badkranen";
  if (/douche|regendouche|thermostaat/.test(n)) return "Douchekranen";
  if (/douchegoot|drain/.test(n)) return "Douchegoten";
  return "Overig";
}

/* ----------------------------------------------------------------------------
   Opslag
---------------------------------------------------------------------------- */
function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreekt");
  return createClient(url, key, { auth: { persistSession: false } });
}
const sb = supabase();

async function upload(pad: string, data: Buffer, contentType: string): Promise<string> {
  const { error } = await sb.storage.from(BUCKET).upload(pad, data, { contentType, upsert: true });
  if (error) throw new Error(`upload ${pad}: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl;
}

async function fotoBytes(bestand: string): Promise<Buffer> {
  return sharp(bestand)
    .rotate()
    .resize({ width: FOTO_BREEDTE, height: FOTO_BREEDTE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Bestanden van één code, gesorteerd: hoofdfoto, extra's op volgnummer, tekening. */
function bestandenVan(code: string): { hoofd: string | null; extra: string[]; tekening: string | null } {
  const paden = (bestanden[code] ?? []).map((p) => (path.isAbsolute(p) ? p : path.join(BASIS, p)));
  const stam = (p: string) => path.basename(p).replace(/\.[^.]+$/, "");
  const jpgs = paden.filter((p) => /\.(jpe?g|png)$/i.test(p));
  const hoofd = jpgs.find((p) => stam(p) === code) ?? jpgs[0] ?? null;
  const extra = jpgs
    .filter((p) => p !== hoofd)
    .sort((a, b) => stam(a).localeCompare(stam(b), "nl", { numeric: true }))
    .slice(0, MAX_EXTRA_FOTOS);
  const tekening = paden.find((p) => /_T\.pdf$/i.test(p)) ?? null;
  return { hoofd, extra, tekening };
}

async function inGroepen<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let i = 0;
  const werkers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(werkers);
}

/* ----------------------------------------------------------------------------
   Hoofdprogramma
---------------------------------------------------------------------------- */
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  if (!merk) throw new Error("merk brauer niet gevonden");
  const laadVarianten = () => db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const laadProducten = () => db.select().from(products).where(eq(products.brandId, merk.id));

  let varianten = await laadVarianten();
  let producten = await laadProducten();
  const codes = Object.keys(lijst).map(normalizeCode);
  console.log(
    `${producten.length} producten, ${varianten.length} uitvoeringen in het CRM; ${codes.length} codes in de prijslijst` +
      (TOEPASSEN ? "" : "   [DROOGLOOP]"),
  );

  /* ---- 1. prijzen -------------------------------------------------------- */
  if (DOE.prijzen) {
    const perCode = new Map(varianten.map((v) => [v.code, v]));
    let n = 0;
    let zonderPrijs = 0;
    const updates: Array<{ id: string; set: Partial<typeof productVariants.$inferInsert> }> = [];
    for (const code of codes) {
      const v = perCode.get(code);
      if (!v) continue;
      const regel = lijst[code];
      const advies = bedrag(regel.prijs);
      if (advies == null) {
        zonderPrijs++;
        continue;
      }
      updates.push({
        id: v.id,
        set: {
          priceEur: String(advies),
          listPriceEur: String(advies),
          discountPct: String(INKOOP_KORTING_PCT),
          purchaseCostEur: String(inkoop(advies)),
          costEur: String(inkoop(advies)),
          barcode: regel.ean ? String(regel.ean) : v.barcode,
          availability: beschikbaar(regel.status),
          sourceRef: `prijslijst ${regel.bron}`,
          lastImportedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      n++;
    }
    console.log(`prijzen: ${n} uitvoeringen krijgen advies/inkoop (50%), ${zonderPrijs} regels zonder prijs`);
    if (TOEPASSEN) {
      await inGroepen(updates, 8, async (u) => {
        await db.update(productVariants).set(u.set).where(eq(productVariants.id, u.id));
      });
      if (merk.dealerDiscountPct == null || Number(merk.dealerDiscountPct) !== INKOOP_KORTING_PCT) {
        await db.update(brands).set({ dealerDiscountPct: String(INKOOP_KORTING_PCT), updatedAt: new Date() }).where(eq(brands.id, merk.id));
        console.log(`merk: inkoopkorting op ${INKOOP_KORTING_PCT}% gezet (aannemerskorting blijft leeg)`);
      }
    }
  }

  /* ---- 2. nieuwe codes ---------------------------------------------------- */
  if (DOE.nieuw) {
    const perCode = new Map(varianten.map((v) => [v.code, v]));
    const perProduct = new Map(producten.map((p) => [p.id, p]));
    // Kranencodes zonder hun kleur: "5-*-001-HD5" (nummer + suffix) en "5-*-001"
    // (alleen nummer). Ruimer dan brauerModelKey, want de prijslijst kent ook
    // suffixen als A1/B4 die niet in de catalogus stonden.
    const sleutels = (code: string) => {
      const m = code.match(/^5-([A-Z]{1,2})-(\d{3})(?:-(.+))?$/);
      if (!m) return null;
      return { kleur: m[1], suffix: m[3] ?? "", exact: `5-*-${m[2]}${m[3] ? `-${m[3]}` : ""}`, nummer: `5-*-${m[2]}` };
    };
    const perExact = new Map<string, Set<string>>();
    const perNummer = new Map<string, Set<string>>();
    for (const v of varianten) {
      const k = sleutels(v.code);
      if (!k) continue;
      perExact.set(k.exact, (perExact.get(k.exact) ?? new Set()).add(v.productId));
      perNummer.set(k.nummer, (perNummer.get(k.nummer) ?? new Set()).add(v.productId));
    }
    const nieuw = codes.filter((c) => !perCode.has(c) && !/ACTIE/i.test(c));
    const overgeslagen = codes.filter((c) => /ACTIE/i.test(c)).length;

    // 2a. bij een bestaand product: zelfde nummer, andere kleur
    const bijBestaand: Array<{ code: string; productId: string; broer: (typeof varianten)[number] }> = [];
    const echtNieuw: string[] = [];
    const restSuffix = new Map<string, number>();
    for (const code of nieuw) {
      const k = sleutels(code);
      const kandidaten = k ? (perExact.get(k.exact) ?? perNummer.get(k.nummer)) : undefined;
      if (k && kandidaten && kandidaten.size === 1 && KLEURCODE_CANON[k.kleur]) {
        const productId = [...kandidaten][0];
        // de broer met dezelfde suffix levert de overige keuzes (handdouche, hendel, …)
        const broers = varianten.filter((v) => v.productId === productId && sleutels(v.code)?.nummer === k.nummer);
        const broer = broers.find((b) => sleutels(b.code)?.suffix === k.suffix) ?? broers[0];
        bijBestaand.push({ code, productId, broer });
      } else {
        echtNieuw.push(code);
        if (k) restSuffix.set(k.suffix || "(geen)", (restSuffix.get(k.suffix || "(geen)") ?? 0) + 1);
      }
    }
    if (restSuffix.size) console.log("  kranencodes zonder bestaand product, per suffix:", Object.fromEntries(restSuffix));
    console.log(
      `nieuw: ${nieuw.length} codes (${overgeslagen} ACTIE-codes overgeslagen): ${bijBestaand.length} bij een bestaand product, ${echtNieuw.length} als nieuw product`,
    );

    if (TOEPASSEN) {
      const geraakt = new Set<string>();
      for (const { code, productId, broer } of bijBestaand) {
        const product = perProduct.get(productId)!;
        const regel = lijst[code];
        const advies = bedrag(regel.prijs);
        const k = sleutels(code)!;
        const kleur = KLEURCODE_CANON[k.kleur];
        const hendel = BRAUER_HENDELS.find((h) => h.suffix === k.suffix)?.label;
        const options: Record<string, string> = { ...(broer.options ?? {}) };
        options.kleur = kleur;
        if ("typehendel" in options && hendel) options.typehendel = hendel;
        // kleur-as van het product uitbreiden als de kleur nieuw is (Coffee)
        const assen: ProductOptionAxis[] = (product.optionAxes ?? []).map((a) => ({ ...a, values: [...a.values] }));
        const kleurAs = assen.find((a) => a.key === "kleur");
        if (kleurAs && !kleurAs.values.some((w) => w.value === kleur)) {
          kleurAs.values.push({ value: kleur, label: kleur });
          product.optionAxes = assen;
          await db.update(products).set({ optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, productId));
        }
        await db.insert(productVariants).values({
          productId,
          brandId: merk.id,
          code,
          sku: buildVariantSku(merk.skuPrefix, code),
          barcode: regel.ean ? String(regel.ean) : null,
          label: buildVariantLabel(assen, options) || code,
          options,
          priceEur: advies != null ? String(advies) : null,
          listPriceEur: advies != null ? String(advies) : null,
          discountPct: String(INKOOP_KORTING_PCT),
          purchaseCostEur: advies != null ? String(inkoop(advies)) : null,
          costEur: advies != null ? String(inkoop(advies)) : null,
          availability: beschikbaar(regel.status),
          sortOrder: (broer.sortOrder ?? 0) + 1,
          sourceRef: `prijslijst ${regel.bron}`,
          lastImportedAt: new Date(),
        });
        geraakt.add(productId);
      }
      for (const id of geraakt) await syncVariantProjection(id);
      console.log(`  ${bijBestaand.length} uitvoeringen toegevoegd aan ${geraakt.size} bestaande producten`);
    }

    // 2b. nieuwe producten via de gewone import (droogloop toont het plan)
    const rows: ImportRow[] = echtNieuw.map((code) => {
      const regel = lijst[code];
      const { productName, series, maat } = schoneNaam(regel.naam ?? code);
      const { kleur, glas } = kleurVan(code, regel);
      const options: Record<string, string> = {};
      if (kleur) options.Kleur = kleur;
      if (maat) options.Maat = maat;
      if (glas) options.Glas = glas;
      return {
        code,
        productName: productName || code,
        series,
        collection: "Brauer",
        category: categorieVoor(code, regel),
        unit: "stuk",
        options,
        listPriceEur: bedrag(regel.prijs),
        discountPct: INKOOP_KORTING_PCT,
        sourceRef: `prijslijst ${regel.bron}`,
      };
    });
    const bestaandMap = new Map<string, BestaandeVariant>(
      varianten.map((v) => [
        v.code,
        { code: v.code, productId: v.productId, priceEur: v.priceEur ? Number(v.priceEur) : null, purchaseCostEur: v.purchaseCostEur ? Number(v.purchaseCostEur) : null, label: v.label ?? "", imageUrl: v.imageUrl },
      ]),
    );
    const plan = planImport(rows, bestaandMap, { skuPrefix: merk.skuPrefix ?? "BRA", dealerDiscountPct: INKOOP_KORTING_PCT });
    const perCat = new Map<string, number>();
    for (const p of plan.producten) perCat.set(p.category ?? "?", (perCat.get(p.category ?? "?") ?? 0) + 1);
    console.log(`  nieuwe producten: ${plan.producten.length} (${plan.nieuweUitvoeringen} uitvoeringen); per categorie:`, Object.fromEntries(perCat));
    if (plan.conflicten.length) console.log("  conflicten:", plan.conflicten.slice(0, 10));
    if (!TOEPASSEN) {
      for (const p of plan.producten.slice(0, vlag("alles") ? 9999 : 25)) {
        console.log(`   · ${p.name} [${p.category}] ${p.varianten.length}× — ${p.optionAxes.map((a) => `${a.label}: ${a.values.map((w) => w.value).join("/")}`).join("; ")}`);
      }
      if (plan.producten.length > 25) console.log(`   … en ${plan.producten.length - 25} meer`);
    } else if (plan.producten.length) {
      const uit = await applyImport(plan, { id: merk.id, skuPrefix: merk.skuPrefix });
      console.log("  import:", uit);
      // beschikbaarheid + barcode staan niet in de import; los bijwerken
      for (const code of echtNieuw) {
        const regel = lijst[code];
        await db
          .update(productVariants)
          .set({ availability: beschikbaar(regel.status), barcode: regel.ean ? String(regel.ean) : null })
          .where(and(eq(productVariants.brandId, merk.id), eq(productVariants.code, code)));
      }
    }
    varianten = await laadVarianten();
    producten = await laadProducten();
  }

  /* ---- 3. foto's ---------------------------------------------------------- */
  if (DOE.fotos) {
    let teDoen = varianten.filter((v) => bestanden[v.code] && (FORCE || !v.imageUrl));
    if (LIMIT) teDoen = teDoen.slice(0, LIMIT);
    const metBestand = varianten.filter((v) => bestanden[v.code]).length;
    console.log(`foto's: ${metBestand} uitvoeringen hebben bestanden, ${teDoen.length} te verwerken` + (TOEPASSEN ? "" : " (droogloop: niets geüpload)"));
    if (TOEPASSEN) {
      let klaar = 0;
      let fouten = 0;
      const t0 = Date.now();
      await inGroepen(teDoen, GELIJKTIJDIG, async (v) => {
        try {
          const { hoofd, extra, tekening } = bestandenVan(v.code);
          if (!hoofd) return;
          const hoofdUrl = await upload(`brauer/${v.code}.jpg`, await fotoBytes(hoofd), "image/jpeg");
          const extraUrls: string[] = [];
          for (const [i, pad] of extra.entries()) {
            extraUrls.push(await upload(`brauer/${v.code}_${i + 1}.jpg`, await fotoBytes(pad), "image/jpeg"));
          }
          let tekeningUrl: string | null = null;
          if (tekening) tekeningUrl = await upload(`brauer/${v.code}_T.pdf`, readFileSync(tekening), "application/pdf");
          const specs = { ...(v.specs ?? {}) };
          if (tekeningUrl) specs.tekening = tekeningUrl;
          await db
            .update(productVariants)
            .set({ imageUrl: hoofdUrl, images: extraUrls.length ? extraUrls : null, specs, updatedAt: new Date() })
            .where(eq(productVariants.id, v.id));
          klaar++;
          if (klaar % 100 === 0) console.log(`  ${klaar}/${teDoen.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
        } catch (e) {
          fouten++;
          console.error(`  ! ${v.code}: ${(e as Error).message}`);
        }
      });
      console.log(`  ${klaar} uitvoeringen met foto's, ${fouten} fouten, ${Math.round((Date.now() - t0) / 1000)} s`);
      varianten = await laadVarianten();
    }

    // productfoto + kleurplaatjes afleiden — ook in de droogloop tellen
    const perProduct = new Map<string, typeof varianten>();
    for (const v of varianten) perProduct.set(v.productId, [...(perProduct.get(v.productId) ?? []), v]);
    const modelA = (v: (typeof varianten)[number]) => !v.options?.typehendel || v.options.typehendel === "Model A";
    let productFotos = 0;
    let kleurPlaatjes = 0;
    for (const p of producten) {
      const vs = (perProduct.get(p.id) ?? []).filter((v) => v.imageUrl);
      if (!vs.length) continue;
      const rep = vs.find((v) => v.options?.kleur === "Chroom" && modelA(v)) ?? vs.find((v) => modelA(v)) ?? vs[0];
      const set: Partial<typeof products.$inferInsert> = {};
      if ((FORCE || !p.imageUrl) && rep.imageUrl) {
        set.imageUrl = rep.imageUrl;
        productFotos++;
      }
      const assen: ProductOptionAxis[] = (p.optionAxes ?? []).map((a) => ({ ...a, values: a.values.map((w) => ({ ...w })) }));
      let gewijzigd = false;
      for (const as of assen) {
        if (as.key !== "kleur") continue;
        for (const w of as.values) {
          if (w.imageUrl && !FORCE) continue;
          const kandidaat = vs.find((v) => v.options?.kleur === w.value && modelA(v)) ?? vs.find((v) => v.options?.kleur === w.value);
          if (kandidaat?.imageUrl) {
            w.imageUrl = kandidaat.imageUrl;
            gewijzigd = true;
            kleurPlaatjes++;
          }
        }
      }
      if (gewijzigd) set.optionAxes = assen;
      if (Object.keys(set).length && TOEPASSEN) {
        await db.update(products).set({ ...set, updatedAt: new Date() }).where(eq(products.id, p.id));
        await syncVariantProjection(p.id);
      }
    }
    console.log(`  productfoto's: ${productFotos}, kleurplaatjes: ${kleurPlaatjes}` + (TOEPASSEN ? "" : " (droogloop)"));
  }

  console.log(TOEPASSEN ? "klaar." : "droogloop klaar — niets gewijzigd. Draai met --toepassen om het te doen.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
