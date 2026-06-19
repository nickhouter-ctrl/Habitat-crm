/**
 * Exporteer actieve meubels (Caracole + Cornelius) → website-catalogus, met
 * leverancier-galerijen (op SKU) EN slimme variant-samenvoeging: dezelfde
 * meubel in andere maat/kleur/links-rechts wordt één product met opties.
 * Dry-run standaard; `--apply` schrijft weg.
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OUT = "/Users/nickhouter/projects/Habitat-one/lib/data/furniture-products.generated.ts";

const SUB: Record<string, string> = {
  sofa: "sofas", sofas: "sofas", armchair: "armchairs", armchairs: "armchairs",
  "accent chair": "accent-chairs", "accent chairs": "accent-chairs", chair: "accent-chairs", chairs: "accent-chairs",
  "dining chair": "dining-chairs", "dining chairs": "dining-chairs", "lounge chair": "lounge-chairs",
  barstool: "barstools", barstools: "barstools", "counter stool": "counter-stools",
  bench: "benches", benches: "benches", ottoman: "ottomans", ottomans: "ottomans", pouf: "poufs", poufs: "poufs",
  "coffee table": "coffee-tables", "coffee tables": "coffee-tables", "side table": "side-tables", "side tables": "side-tables",
  "console table": "console-tables", "console tables": "console-tables", "dining table": "dining-tables", "dining tables": "dining-tables",
  "accent table": "accent-tables", dresser: "dressers", nightstand: "nightstands", sideboard: "sideboards",
  "bars & display cabinets": "cabinets", "media unit": "media-units", chest: "chests", desk: "desks", "vanity units": "vanity-units",
  bed: "beds", beds: "beds", mirror: "mirrors", tray: "trays", "throw pillow": "cushions",
  artwork: "artwork", "real touch trees and plants": "plants",
  chandeliers: "chandeliers", "floor lamps": "floor-lamps", pendants: "pendants",
};
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

// Subcategorie bepalen, met naam-overrides (bv. bed-bolsters horen bij beds,
// niet bij decoratie/cushions).
const resolveSub = (r: any): string | undefined => {
  let s = SUB[(r.subcategory ?? "").trim().toLowerCase()];
  if (/\bbolster\b/i.test(r.name) && /\bbed\b/i.test(r.name)) s = "bed-pillows";
  return s;
};

// Kleur-/maat-/richting-woorden — weggehaald uit de naam om dezelfde meubel te
// herkennen, en gebruikt als variant-label.
const COLORS: [RegExp, string][] = [
  [/\bblack\b|\bnoir\b|\bonyx\b|\bebony\b/i, "#1d1d1f"], [/\bcharcoal\b|\banthracite\b|\bgraphite\b/i, "#3a3a3e"],
  [/\bwhite\b|\bivory\b|\bchalk\b/i, "#f3efe7"], [/\bcream\b|\becru\b|\boat\b|\boatmeal\b/i, "#ece2cf"],
  [/\bbeige\b|\bsand\b|\blinn?en\b|\bnatural\b|\bflax\b|\bwheat\b|\balmond\b|\bpearl\b/i, "#d7c4a6"],
  [/\btaupe\b|\bmushroom\b|\bgreige\b|\bstone\b/i, "#b6a890"], [/\bgrey\b|\bgray\b|\bsilver\b|\bdove\b|\bash\b/i, "#9b9b9b"],
  [/\bbrown\b|\bwalnut\b|\bchocolate\b|\bcognac\b|\bcoffee\b|\bespresso\b|\bchestnut\b/i, "#6b4f3a"],
  [/\btan\b|\bcamel\b|\bcaramel\b|\bhoney\b/i, "#b07a4a"], [/\bnavy\b|\bindigo\b/i, "#28324c"],
  [/\bblue\b|\bteal\b|\bdenim\b|\bsky\b|\bazure\b/i, "#5b7c98"], [/\bgreen\b|\bolive\b|\bsage\b|\bmoss\b|\bemerald\b/i, "#6e7d5b"],
  [/\bgold\b|\bbrass\b/i, "#b8985a"], [/\bbronze\b|\bcopper\b/i, "#7d5a3a"], [/\brust\b|\bterracotta\b|\bclay\b/i, "#b0542d"],
  [/\bred\b|\bcrimson\b|\bburgundy\b|\bwine\b/i, "#8a3a3a"], [/\bpink\b|\bblush\b|\brose\b/i, "#cf9aa0"],
  [/\bchampagne\b/i, "#e7d6b0"],
];
const colourHex = (t?: string): string | null => { if (!t) return null; for (const [re, hex] of COLORS) if (re.test(t)) return hex; return null; };
const colourWord = (name: string): string | null => {
  const m = name.match(/\b(black|white|ivory|cream|beige|sand|linn?en|natural|taupe|mushroom|greige|grey|gray|silver|brown|walnut|chocolate|cognac|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|green|olive|sage|moss|gold|brass|bronze|copper|rust|terracotta|red|burgundy|pink|blush|rose|champagne|pearl)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
};
const sizeWord = (name: string): string | null => {
  const m = name.match(/\b(king|queen|full|twin|california king|cal king)\b/i);
  return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
};
const dirWord = (name: string): string | null => {
  const m = name.match(/\b(left chaise|right chaise|left|right|laf|raf)\b/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return v.includes("left") || v === "laf" ? "Left" : "Right";
};
// Naam zónder kleur/maat → herkent hetzelfde element. Richting (links/rechts)
// blijft staan: links- en rechts-elementen zijn aparte producten.
const normName = (name: string): string =>
  name.toLowerCase()
    .replace(/\b(black|white|ivory|cream|ecru|oat|oatmeal|beige|sand|linn?en|natural|flax|wheat|almond|pearl|taupe|mushroom|greige|stone|grey|gray|silver|dove|ash|brown|walnut|chocolate|cognac|coffee|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|sky|azure|green|olive|sage|moss|emerald|gold|brass|bronze|copper|rust|terracotta|clay|red|crimson|burgundy|wine|pink|blush|rose|champagne|dark|light|neutral|toned)\b/gi, " ")
    .replace(/\b(king|queen|full|twin|california|cal|size)\b/gi, " ")
    .replace(/[^\w|]+/g, " ").replace(/\s+/g, " ").trim();

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HabitatOne" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
type ShopProd = { title: string; images: string[]; variantTitle: Map<string, string>; variantImg: Map<string, string> };
async function caracole(): Promise<{ byHandle: Map<string, ShopProd>; handleBySku: Map<string, string> }> {
  const byHandle = new Map<string, ShopProd>(); const handleBySku = new Map<string, string>();
  for (let page = 1; page <= 12; page++) {
    const j = await fetchJson(`https://caracole.eu.com/products.json?limit=250&page=${page}`);
    const arr = j.products ?? []; if (arr.length === 0) break;
    for (const p of arr) {
      const images: string[] = (p.images ?? []).map((i: any) => i.src).filter(Boolean);
      const variantTitle = new Map<string, string>(); const variantImg = new Map<string, string>();
      for (const v of p.variants ?? []) { if (!v.sku) continue; const sku = String(v.sku).trim().toUpperCase(); variantTitle.set(sku, v.title && v.title !== "Default Title" ? v.title : ""); if (v.featured_image?.src) variantImg.set(sku, v.featured_image.src); handleBySku.set(sku, p.handle); }
      byHandle.set(p.handle, { title: p.title, images, variantTitle, variantImg });
    }
    if (arr.length < 250) break;
  }
  return { byHandle, handleBySku };
}
async function cornelius(): Promise<Map<string, string[]>> {
  const idx = new Map<string, string[]>();
  for (let page = 1; page <= 12; page++) {
    const arr = await fetchJson(`https://www.corneliuslifestyle.com/wp-json/wc/store/products?per_page=100&page=${page}`);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr) { const imgs: string[] = (p.images ?? []).map((i: any) => String(i.src ?? "").replace(/-\d+x\d+(?=\.\w+$)/, "")).filter(Boolean); for (const tok of String(p.sku ?? "").split(/[^0-9A-Za-z]+/)) if (tok && tok.length >= 6) idx.set(tok.toUpperCase(), imgs); }
    if (arr.length < 100) break;
  }
  return idx;
}
const dedup = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 12);
// Hoofdfoto = productfoto (packshot op wit), nooit een interieur/room-scene.
// Rangschik: 0) packshot met de SKU in de bestandsnaam, 1) hoek-packshot
// (_front/_back/_side…), 2) onbekend, 3) interieur/room-scene ("…_RS…").
const fileLC = (u: string) => (u.split("/").pop() ?? "").toLowerCase();
const isRoomScene = (u: string) => /_rs(?:[_\d.]|$)/i.test(fileLC(u));
// Binnen de packshots: recht vooraanzicht ("_Main") eerst, dan "_Front", dan de
// kale SKU-foto, dan zij-/achterhoeken. Interieur/room-scenes altijd achteraan.
const suffixPri = (f: string): number => {
  if (/_main\b/.test(f)) return 0;
  if (/_front\b/.test(f)) return 1;
  if (/_(back2?|side|angle|top|open|closed|detail)\b/.test(f)) return 4;
  return 3;
};
const imgRank = (u: string, skus: string[]): number => {
  if (isRoomScene(u)) return 100;
  const f = fileLC(u);
  const hasSku = skus.some((s) => s && f.includes(s.toLowerCase()));
  return (hasSku ? 0 : 50) + suffixPri(f);
};
const orderImgs = (arr: string[], skus: string[]): string[] =>
  arr.map((u, i) => [u, i] as [string, number]).sort((a, b) => (imgRank(a[0], skus) - imgRank(b[0], skus)) || (a[1] - b[1])).map((x) => x[0]);
const dimStr = (r: any) => { const d = [r.widthMm, r.heightMm, r.lengthMm].filter((x: any) => x != null).map((x: any) => Math.round(Number(x))); return d.length ? `${d.join(" × ")} mm` : null; };

// Maat → afmeting (mm, W × H × D) uit de omschrijving, bv. "Queen Size … W178 x
// D229 x H147 cm King Size … W218 x D229 x H147 cm".
function sizeDims(desc?: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!desc) return map;
  const push = (size: string, W: number, D: number, H: number) => {
    const k = size.toLowerCase();
    if (!map.has(k)) map.set(k, `${Math.round(W * 10)} × ${Math.round(H * 10)} × ${Math.round(D * 10)} mm`);
  };
  let m: RegExpExecArray | null;
  // A) "Queen Size … W178 x D229 x H147 cm" (letter vóór getal).
  const reA = /\b(queen|king|full|twin)\s+size\b[^]{0,120}?W\s*(\d+(?:\.\d+)?)\s*[x×]\s*D\s*(\d+(?:\.\d+)?)\s*[x×]\s*H\s*(\d+(?:\.\d+)?)\s*cm/gi;
  while ((m = reA.exec(desc))) push(m[1], +m[2], +m[3], +m[4]);
  // B) "Queen Size 66W x 86D x 58H in 167.64W x 218.44D x 147.32H cm" (cm-groep, getal vóór letter).
  const reB = /\b(queen|king|full|twin)\s+size\b[^]{0,160}?(\d+(?:\.\d+)?)\s*W\s*[x×]\s*(\d+(?:\.\d+)?)\s*D\s*[x×]\s*(\d+(?:\.\d+)?)\s*H\s*cm/gi;
  while ((m = reB.exec(desc))) push(m[1], +m[2], +m[3], +m[4]);
  return map;
}
const sizeKey = (t?: string | null) => (t ?? "").toLowerCase().match(/\b(queen|king|full|twin)\b/)?.[1] ?? null;

// Per-element afmeting uit de omschrijving — gericht op de élement-titel, bv.
// "Left Arm Facing Chaise: W67 x D39 x H27 in W169 x D98 x H69 cm" → mm (W × H × D).
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function elemDimFor(desc: string | null | undefined, title: string): string | null {
  if (!desc) return null;
  const t = title.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).map(escapeRe).join("\\s+");
  if (!t) return null;
  // Dubbele punt is optioneel ("Corner Section W54…" én "Left Arm Facing Chaise: W67…").
  const re = new RegExp(`${t}\\s*:?\\s*W\\s*[\\d.]+\\s*[x×]\\s*D\\s*[\\d.]+\\s*[x×]\\s*H\\s*[\\d.]+\\s*in\\s*W\\s*(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*D\\s*(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*H\\s*(\\d+(?:\\.\\d+)?)\\s*cm`, "i");
  const m = desc.match(re);
  return m ? `${Math.round(+m[1] * 10)} × ${Math.round(+m[3] * 10)} × ${Math.round(+m[2] * 10)} mm` : null;
}

// SKU-ontleding (Caracole): PREFIX-SERIE-ELEMENT-KLEUR, bv. M150-023-LH1-B.
const seriesOf = (sku: string) => sku.trim().toUpperCase().split("-").slice(0, 2).join("-"); // "M150-023", "UPH-425V"
const colourBase = (sku: string) => sku.trim().toUpperCase().replace(/-[A-Z]$/, ""); // element-identiteit zonder kleurletter
// Lijn-naam = eerste woord ná "Caracole" in de titel ("… | Caracole Overlap" → "overlap").
const lineWord = (name: string): string | null => {
  const tail = name.includes("|") ? name.split("|").pop()!.trim() : "";
  const m = tail.match(/caracole\s+([\w'’-]+)/i);
  return m ? m[1].toLowerCase() : null;
};
// Naam zonder " | Caracole …" / " | Cornelius …"-staart → bruikbaar als element-label.
const stripCollection = (name: string) => name.replace(/\s*\|\s*caracole\b.*$/i, "").replace(/\s*\|\s*cornelius\b.*$/i, "").trim();
const cap = (s: string) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase()); // "three's" → "Three's"
// Stuk-type van een bankstel-element — twee verschillende types = écht modulair.
const PIECES: [RegExp, string][] = [
  [/\barmless\b|\bbumper\b/i, "armless"], [/\bcorner\b/i, "corner"], [/\bwedge\b/i, "wedge"],
  [/\bloveseat\b/i, "loveseat"], [/\bchaise\b/i, "chaise"], [/\bottoman\b/i, "ottoman"], [/\bsettee\b/i, "settee"],
  [/\d+\s*-?\s*pc\b|\d+\s*-?\s*piece|\bsectional\b/i, "sectional"], [/\bsofa\b/i, "sofa"], [/\bchair\b/i, "chair"],
];
const pieceType = (name: string): string => { for (const [re, t] of PIECES) if (re.test(name)) return t; return "other"; };
// Splits een element-naam in kleur (losse keuze) en stuk-label (het element).
const MOD = "dark|light|warm|cool|soft|deep|pale|antique|vintage|almost|neutral[- ]?toned";
const COLNAMES = "black|white|ivory|cream|ecru|oat|oatmeal|beige|sand|linen|linnen|natural|flax|wheat|almond|pearl|taupe|mushroom|greige|stone|grey|gray|silver|dove|ash|brown|walnut|chocolate|cognac|coffee|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|sky|azure|green|olive|sage|moss|emerald|gold|brass|bronze|copper|rust|terracotta|clay|red|crimson|burgundy|wine|pink|blush|rose|champagne|eucalyptus|rouge";
const reColourLead = new RegExp(`^\\s*((?:${MOD})\\s+)?(${COLNAMES})\\b`, "i");
const FILLER = /^\s*(?:upholstered|modern|classic|vintage|woven|fully|new|luxurious|elegant)\s+/i;
const colourPhrase = (name: string): string | null => { const m = stripCollection(name).replace(FILLER, "").match(reColourLead); return m ? cap(((m[1] ?? "") + m[2]).trim()) : null; };
const MATERIALS = /\b(upholstered|linen|linnen|velvet|fabric|bouclé|boucle|leather|ribbed|woven|mohair|chenille|performance|micro-?ribbed|plush|fully|modern|classic|vintage|welted)\b/gi;
const pieceLabel = (name: string): string => {
  let s = stripCollection(name).replace(FILLER, "").replace(reColourLead, " ");
  s = s.replace(MATERIALS, " ").replace(/\s+/g, " ").trim();
  return s || stripCollection(name);
};
// Sommige collecties zetten het element ná de lijnnaam ("… | Caracole Altura
// Right Chaise Sectional" → element "Right Chaise Sectional"). Pak dat deel.
const suffixElement = (name: string, line: string | null): string | null => {
  if (!line) return null;
  const m = name.match(new RegExp(`\\|\\s*caracole\\s+${line.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s+(.+)$`, "i"));
  const e = m?.[1]?.replace(MATERIALS, " ").replace(/\s+/g, " ").trim();
  return e || null;
};
// Een Shopify-varianttitel die een modulair element beschrijft (bv. Lumi: "Left
// Arm Facing Chaise", "Wedge Section") i.p.v. een kleur/maat → eigen element-stuk.
const isElementTitle = (t?: string) =>
  !!t && /\b(chaise|loveseat|love seat|armless|corner|wedge|section|sofa|ottoman|settee|arm[- ]?facing|\bl[ar]f\b|bumper|sectional|chair)\b/i.test(t);
const cleanTitle = (t: string) => t.replace(/\bsize\b/i, "").replace(/\s+/g, " ").trim();

type Member = { sku: string; name: string; sub: string; brand: "caracole" | "cornelius"; series: string; line: string | null; cbase: string; dims: string | null; descr: string | null; di18n: any; gallery: string[]; shopVariants: { sku: string; title: string; img?: string }[] };

async function main() {
  console.log("CRM-meubels ophalen…");
  const rows = await db.select().from(products).where(and(eq(products.isActive, true), isNotNull(products.sku)));
  const car = rows.filter((r) => r.collection === "Caracole");
  const cor = rows.filter((r) => r.collection === "Cornelius Lifestyle");
  const [{ byHandle, handleBySku }, corIdx] = await Promise.all([caracole(), cornelius()]);
  console.log(`  Caracole ${car.length} · Cornelius ${cor.length} · Shopify ${byHandle.size} modellen`);

  // Bouw "members" (één per CRM-rij). Elk element = eigen product; alleen kleuren
  // van hetzelfde element worden later samengevoegd. Draagt één Shopify-product de
  // elementen als varianten (bv. Lumi), dan exploderen we die tot losse members
  // (elk met eigen afmeting). Een handle exploderen we maar één keer.
  const members: Member[] = [];
  const explodedHandles = new Set<string>();
  for (const r of car) {
    const subSlug = resolveSub(r); if (!subSlug) continue;
    const h = handleBySku.get((r.sku ?? "").trim().toUpperCase());
    const shop = h ? byHandle.get(h) : undefined;
    const line = lineWord(r.name);
    const elemVs = shop ? [...shop.variantTitle.entries()].filter(([, t]) => isElementTitle(t)) : [];
    if (h && shop && elemVs.length >= 2) {
      if (explodedHandles.has(h)) continue; // collectie-product al uitgesplitst
      explodedHandles.add(h);
      const baseCol = colourPhrase(r.name);
      for (const [esku, etitle] of elemVs) {
        const et = cleanTitle(etitle);
        const colourInTitle = !!colourPhrase(et);
        const nm = `${!colourInTitle && baseCol ? baseCol + " " : ""}${et} | Caracole ${cap(line ?? "")}`.replace(/\s+\|/, " |").trim();
        members.push({
          sku: esku, name: nm, sub: subSlug, brand: "caracole", series: seriesOf(esku), line, cbase: colourBase(esku),
          dims: elemDimFor(r.description, et) ?? dimStr(r), descr: r.description ?? null, di18n: r.descriptionI18n ?? null,
          gallery: dedup([shop.variantImg.get(esku) ?? "", ...(r.imageUrl ? [r.imageUrl] : []), ...shop.images]),
          shopVariants: [{ sku: esku, title: "" }],
        });
      }
      continue;
    }
    const gallery = dedup([...(r.imageUrl ? [r.imageUrl] : []), ...((shop?.images) ?? [])]);
    const sv = shop ? [...shop.variantTitle.entries()].map(([sku, title]) => ({ sku, title, img: shop.variantImg.get(sku) })) : [{ sku: r.sku!, title: "" }];
    members.push({ sku: r.sku!, name: r.name, sub: subSlug, brand: "caracole", series: seriesOf(r.sku!), line, cbase: colourBase(r.sku!), dims: dimStr(r), descr: r.description ?? null, di18n: r.descriptionI18n ?? null, gallery, shopVariants: sv.length ? sv : [{ sku: r.sku!, title: "" }] });
  }
  for (const r of cor) {
    const subSlug = resolveSub(r); if (!subSlug) continue;
    const skuU = (r.sku ?? "").toUpperCase();
    let gal = corIdx.get(skuU) ?? []; if (!gal.length) for (const tok of skuU.split(/[^0-9A-Z]+/)) { const g = corIdx.get(tok); if (g) { gal = g; break; } }
    const gallery = dedup([...(r.imageUrl ? [r.imageUrl] : []), ...gal]);
    members.push({ sku: r.sku!, name: r.name, sub: subSlug, brand: "cornelius", series: seriesOf(r.sku!), line: null, cbase: colourBase(r.sku!), dims: dimStr(r), descr: r.description ?? null, di18n: r.descriptionI18n ?? null, gallery, shopVariants: [{ sku: r.sku!, title: "" }] });
  }

  // ── Groeperen ─────────────────────────────────────────────────────────────
  // Elk element = eigen product. Union-find voegt ALLEEN kleurvarianten van
  // hetzelfde element samen: naam-zonder-kleur/maat (nk) én SKU-kleurbasis (ck),
  // zodat ook niet-standaard kleurnamen ("Eucalyptus"/"Rouge") en maten
  // (Queen/King) samenvallen. Geen configureerbare sets.
  const others: Member[] = members;

  const parent = others.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byNk = new Map<string, number>(); const byCk = new Map<string, number>();
  others.forEach((m, i) => {
    const nk = `${m.sub}||${normName(m.name)}`;
    if (byNk.has(nk)) union(i, byNk.get(nk)!); else byNk.set(nk, i);
    if (m.brand === "caracole" && m.cbase !== m.sku.toUpperCase()) {
      const ck = `${m.sub}||${m.cbase}`;
      if (byCk.has(ck)) union(i, byCk.get(ck)!); else byCk.set(ck, i);
    }
  });
  const comps = new Map<number, Member[]>();
  others.forEach((m, i) => { const r = find(i); (comps.get(r) ?? comps.set(r, []).get(r)!).push(m); });

  const groups: { members: Member[]; setLine?: string }[] = [...comps.values()].map((g) => ({ members: g }));

  const out: { sort: string; json: string }[] = []; const seen = new Set<string>(); let idN = 2_000_000; let mergedFams = 0;
  const uniqSlug = (b: string) => { let s = b; while (seen.has(s)) s += "-x"; seen.add(s); return s; };

  for (const { members: group, setLine } of groups) {
    const isSet = false; // alles is een eigen product; geen configureerbare sets
    if (group.length > 1) mergedFams++;
    const id = idN++;
    // Hoofdfoto = eigen packshot; interieur/room-scenes komen achteraan.
    const ordered = [...group];
    const rep = ordered[0];
    const skus = ordered.map((m) => m.sku);
    const gallery = orderImgs(dedup(ordered.flatMap((m) => m.gallery)), skus);
    const multi = group.length > 1 || group.some((m) => m.shopVariants.length > 1);

    // Gemeenschappelijk woord-achtervoegsel van de membernamen → het verschillende
    // deel (prefix) is de kleur/versie, óók als het geen bekend kleurwoord is
    // (bv. "Eucalyptus"/"Rouge"). Zo krijgen kleurvarianten nette labels + naam.
    const stripNames = ordered.map((m) => stripCollection(m.name).split(/\s+/).filter(Boolean));
    let commonSuf: string[] = [];
    if (stripNames.length > 1) {
      const minLen = Math.min(...stripNames.map((a) => a.length));
      for (let k = 1; k <= minLen; k++) {
        const w = stripNames[0][stripNames[0].length - k];
        if (stripNames.every((a) => a[a.length - k]?.toLowerCase() === w.toLowerCase())) commonSuf.unshift(w); else break;
      }
    }
    const diffOf = (name: string) => { const a = stripCollection(name).split(/\s+/).filter(Boolean); return a.slice(0, a.length - commonSuf.length).join(" ").trim(); };

    const variants: any[] = []; let vi = 0; const vSeen = new Set<string>();
    for (const m of ordered) {
      const col = colourWord(m.name); const dir = dirWord(m.name); const sd = sizeDims(m.descr);
      // Alleen écht maat-varianten (Queen/King) expanden; anders is de member zélf
      // de variant (eigen SKU) — voorkomt dat members elkaars SKU's binnentrekken.
      const sizeVs = m.shopVariants.filter((sv) => sizeKey(sv.title));
      const svList = sizeVs.length ? sizeVs : [{ sku: m.sku, title: "" } as Member["shopVariants"][number]];
      const imgs = orderImgs(m.gallery.length ? m.gallery : gallery, [m.sku]);
      for (const sv of svList) {
        if (vSeen.has(sv.sku.toUpperCase())) continue;
        vSeen.add(sv.sku.toUpperCase());
        const size = (sv.title && sv.title !== "Default Title") ? sv.title.replace(/\bsize\b/i, "").trim() : sizeWord(m.name);
        const sk = sizeKey(sv.title) ?? sizeKey(m.name);
        const dim = (sk && sd.get(sk)) || m.dims;
        // Eén keuze per kleur/maat (links/rechts zijn aparte producten).
        const label = multi ? ([col, size, dir].filter(Boolean).join(" · ") || diffOf(m.name) || `Variant ${vi + 1}`) : null;
        variants.push({ id: id * 100 + vi++, name: label, colorHex: colourHex(col ?? m.name), sku: sv.sku, images: imgs, dim });
      }
    }

    // Productnaam = rep-naam met kleur/maat eruit (behoudt richting "Left"/"Right"
    // en leestekens zoals "Three's Company"), of rep-naam als die leeg wordt.
    const stripped = rep.name
      .replace(/\b(black|white|ivory|cream|ecru|oat|oatmeal|beige|sand|linn?en|natural|flax|wheat|almond|pearl|taupe|mushroom|greige|stone|grey|gray|silver|dove|ash|brown|walnut|chocolate|cognac|coffee|espresso|chestnut|tan|camel|caramel|honey|navy|indigo|blue|teal|denim|sky|azure|green|olive|sage|moss|emerald|gold|brass|bronze|copper|rust|terracotta|clay|red|crimson|burgundy|wine|pink|blush|rose|champagne|dark|light|neutral|toned)\b/gi, " ")
      .replace(/\b(king|queen|full|twin|california|cal|size)\b/gi, " ")
      .replace(/\s+/g, " ").replace(/\s+\|/g, " |").replace(/\|\s+/g, "| ").trim();
    // Onbekende-kleurfamilie (bv. Cocoon "Eucalyptus/Rouge/Ivory"): naam = het
    // gemeenschappelijke deel ("Cocoon Sofa"); kleur zit in de variant-labels.
    const unknownColourFam = multi && commonSuf.length > 0 && !colourWord(rep.name) && !sizeWord(rep.name) && !!diffOf(rep.name);
    const name = (unknownColourFam ? commonSuf.join(" ") : (multi && stripped ? stripped : rep.name)).replace(/^\s*[\s\-–—|·]+/, "").trim();

    // Sorteersleutel: per subcategorie → collectie-lijn → naam, zodat collectie-
    // genoten in de lijst bij elkaar staan (Seta naast Seta, niet verspreid).
    const sortKey = `${rep.sub}__${(rep.line ?? "~~~").toLowerCase()}__${slugify(name)}`;
    out.push({ sort: sortKey, json: "  " + JSON.stringify({
      id, name, slug: uniqSlug(`${slugify(name)}-${slugify(rep.sku)}`), sku: rep.sku, short: null,
      description: rep.descr, descriptionI18n: rep.di18n, additionalSizes: null,
      image: gallery[0] ?? null, images: gallery, featured: false, dimensions: rep.dims,
      materials: [], spaces: [], categories: [rep.sub], collection: "furniture", variants,
    }) + "," });
  }

  out.sort((a, b) => a.sort.localeCompare(b.sort));
  console.log(`\n${out.length} producten · ${mergedFams} kleur-samengevoegde families`);
  if (!APPLY) { console.log("\nDRY-RUN. Voeg --apply toe om weg te schrijven."); return; }
  writeFileSync(OUT, `// AUTO-GENERATED — meubels (Caracole + Cornelius) uit het CRM. Niet handmatig bewerken.\nimport type { CatalogProduct } from "./products.generated";\n\nexport const furnitureProducts: CatalogProduct[] = [\n` + out.map((o) => o.json).join("\n") + "\n];\n");
  console.log(`Geschreven: ${OUT}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
