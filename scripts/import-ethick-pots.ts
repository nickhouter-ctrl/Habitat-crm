/**
 * Importeer de ETHICK / Prosperplast bloempot-samples in de productcatalogus.
 *
 * Bron:
 *   - Order ZS-700/05/26 ("Showroom Habitat", 2026-05-14) — 63 bloempotten + 1 lounger,
 *     ~/Downloads/samples ethick.pdf  → SKU, EAN, inkoopprijs (netto, EUR).
 *   - ETHICK katalog ETH.26.1 — productfoto's per model
 *     (geëxtraheerd naar /tmp/ethick/final/<baseSKU>.jpg via scripts/ethick-extract-images.py).
 *
 * - Bloempotten → collectie "Bloempotten", categorie = modelserie (Ulpho, Epocco, …).
 * - Lounger     → collectie "Tuinmeubilair", categorie "Loungers" (geen foto in de katalogus).
 * - Inkoopprijs uit de order (levering CPT — vracht v/d leverancier is inbegrepen).
 * - Verkoopprijs: 50% marge ex-BTW, incl-BTW afgerond op .95 (zelfde afrondaanpak
 *   als Magic Stone), aannemersprijs = 80% daarvan (mits resterende marge ≥ 20%).
 * - Foto per basismodel; kleurvarianten van hetzelfde model delen die foto.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const IMG_DIR = "/tmp/ethick/final";
const BUCKET = "product-images";

/* ---------------------------------------------------------------- kleuren */
const COLOR: Record<string, string> = {
  "101GR": "zand",
  "102GR": "zout",
  "106GR": "betongrijs",
  "107GR": "grafiet",
  "109GR": "antraciet",
  "220R": "roodbruin",
  "231R": "macchiato",
  "243R": "terracotta",
  "440R": "wit",
  "460GR": "graniet",
  "467R": "zwart",
};

/* ----------------------------------------------------- basismodellen (45) */
/* baseSKU -> [serie, modelnaam, breedte/Ø mm, hoogte mm, lengte mm]         */
type Model = { serie: string; model: string; w: number | null; h: number | null; l: number | null };
const M = (serie: string, model: string, w: number | null, h: number | null, l: number | null = null): Model =>
  ({ serie, model, w, h, l });

const MODELS: Record<string, Model> = {
  TUO40: M("Ulpho", "Ulpho", 400, 300),
  TUO40M: M("Ulpho", "Ulpho Midl", 400, 450),
  TUO48M: M("Ulpho", "Ulpho Midl", 480, 600),
  TUO60M: M("Ulpho", "Ulpho Midl", 600, 850),
  TU30H: M("Ulpho", "Ulpho High", 300, 600),
  TUO48B: M("Ulpho", "Ulpho Bowl", 480, 220),
  TEP48B: M("Epocco", "Epocco Bold", 480, 600),
  TEP38M: M("Epocco", "Epocco Mild", 380, 700),
  TEP30T: M("Epocco", "Epocco Tall", 300, null),
  TEP46H: M("Epocco", "Epocco High", 460, null),
  TBO40: M("Boge", "Boge", 380, 400),
  TBO48: M("Boge", "Boge", 460, 470),
  TDE40: M("Defora", "Defora", 400, 400),
  TDE48: M("Defora", "Defora", 470, 480),
  TDE60: M("Defora", "Defora", 600, null),
  TDEO40: M("Defora", "Defora", 400, 400),
  TT60: M("Tubra", "Tubra Round", 600, 700),
  TT80: M("Tubra", "Tubra Round", 800, 900),
  TBL120: M("Blumio", "Blumio", null, null, 1200),
  TMOS40: M("Molio", "Molio Round Slim", 390, null),
  TMOS48: M("Molio", "Molio Round Slim", 470, null),
  TMOS60: M("Molio", "Molio Round Slim", 580, null),
  TMBO40: M("Molio", "Molio Bowl", 380, null),
  TMBO60: M("Molio", "Molio Bowl", 600, 250),
  TMBO80: M("Molio", "Molio Bowl", 780, 340),
  TGAO1S: M("Gane", "Gane", 300, 270),
  TCR30: M("Coro", "Coro Round", 300, 300),
  TCR40: M("Coro", "Coro Round", 400, 360),
  TCR48: M("Coro", "Coro Round", 480, 450),
  TCR40H: M("Coro", "Coro Round High", 400, 700),
  TCR48H: M("Coro", "Coro Round High", 480, null),
  TCS40: M("Coro", "Coro Square", 400, 360),
  TCS48: M("Coro", "Coro Square", 480, 440),
  TCS40H: M("Coro", "Coro Square High", 400, 700),
  TCC80: M("Coro", "Coro Case", 380, 360, 800),
  TCB40: M("Coro", "Coro Bowl", 400, 200),
  TCB48: M("Coro", "Coro Bowl", 480, 420),
  TCB40H: M("Coro", "Coro Bowl High", 400, 530),
  TCA40: M("Cano", "Cano", 400, 360),
  TCA60: M("Cano", "Cano", 600, 540),
  TCA80: M("Cano", "Cano", 800, 740),
  TCA40H: M("Cano", "Cano High", 400, 540),
  TR40: M("Rona", "Rona", 400, 360),
  TR60: M("Rona", "Rona", 600, 540),
  TR80: M("Rona", "Rona", 800, 720),
};

/* -------------------------------------------- orderregels (63 potten + 1) */
/* [fullSKU, baseSKU, kleurcode, EAN, inkoopprijs netto EUR]                 */
type Line = [string, string, string, string, number];
const POTS: Line[] = [
  ["TUO40-101GR", "TUO40", "101GR", "5905197864891", 17.26],
  ["TUO40M-101GR", "TUO40M", "101GR", "5905197864983", 22.55],
  ["TUO48B-101GR", "TUO48B", "101GR", "5905197865096", 17.97],
  ["TUO48M-101GR", "TUO48M", "101GR", "5905197865188", 35.95],
  ["TUO60M-101GR", "TUO60M", "101GR", "5905197865249", 55.24],
  ["TU30H-101GR", "TU30H", "101GR", "5905197865270", 26.64],
  ["TEP48B-220R", "TEP48B", "220R", "5905197863795", 41.94],
  ["TEP48B-231R", "TEP48B", "231R", "5905197863801", 41.94],
  ["TEP48B-101GR", "TEP48B", "101GR", "5905197863771", 41.94],
  ["TEP38M-101GR", "TEP38M", "101GR", "5905197860947", 31.75],
  ["TEP38M-231R", "TEP38M", "231R", "5905197861005", 31.75],
  ["TEP38M-220R", "TEP38M", "220R", "5905197860985", 31.75],
  ["TEP30T-101GR", "TEP30T", "101GR", "5905197863733", 29.97],
  ["TEP30T-231R", "TEP30T", "231R", "5905197863764", 29.97],
  ["TEP30T-220R", "TEP30T", "220R", "5905197863757", 29.97],
  ["TEP46H-101GR", "TEP46H", "101GR", "5905197861029", 52.68],
  ["TEP46H-231R", "TEP46H", "231R", "5905197861081", 52.68],
  ["TEP46H-220R", "TEP46H", "220R", "5905197861067", 52.68],
  ["TEP38M-107GR", "TEP38M", "107GR", "5905197860961", 31.75],
  ["TBO40-231R", "TBO40", "231R", "5905197863825", 17.26],
  ["TBO48-231R", "TBO48", "231R", "5905197860398", 32.77],
  ["TBO40-102GR", "TBO40", "102GR", "5905197863818", 17.26],
  ["TDE40-243R", "TDE40", "243R", "5905197784489", 23.36],
  ["TDE48-243R", "TDE48", "243R", "5905197864709", 40.34],
  ["TDE60-243R", "TDE60", "243R", "5905197784519", 56.20],
  ["TDEO40-243R", "TDEO40", "243R", "5905197864761", 21.15],
  ["TDE40-106GR", "TDE40", "106GR", "5905197784465", 23.36],
  ["TDE48-101GR", "TDE48", "101GR", "5905197875637", 40.34],
  ["TT60-101GR", "TT60", "101GR", "5905197770307", 56.39],
  ["TT80-460GR", "TT80", "460GR", "5905197770345", 126.86],
  ["TBL120-440R", "TBL120", "440R", "5905197872841", 185.02],
  ["TMOS40-101GR", "TMOS40", "101GR", "5905197866345", 39.11],
  ["TMOS40-440R", "TMOS40", "440R", "5905197878102", 39.11],
  ["TMOS48-101GR", "TMOS48", "101GR", "5905197866376", 53.04],
  ["TMOS48-440R", "TMOS48", "440R", "5905197878126", 53.04],
  ["TMOS60-101GR", "TMOS60", "101GR", "5905197866406", 74.99],
  ["TMOS60-440R", "TMOS60", "440R", "5905197878140", 74.99],
  ["TMBO40-101GR", "TMBO40", "101GR", "5905197866147", 8.79],
  ["TMBO40-440R", "TMBO40", "440R", "5905197876399", 8.79],
  ["TMBO60-101GR", "TMBO60", "101GR", "5905197771199", 27.31],
  ["TMBO60-440R", "TMBO60", "440R", "5905197877846", 27.31],
  ["TMBO80-101GR", "TMBO80", "101GR", "5905197866178", 35.06],
  ["TMBO80-440R", "TMBO80", "440R", "5905197877907", 35.06],
  ["TGAO1S-101GR", "TGAO1S", "101GR", "5905197865751", 15.86],
  ["TCR30-107GR", "TCR30", "107GR", "5905197771823", 15.69],
  ["TCR40-467R", "TCR40", "467R", "5905197771861", 29.25],
  ["TCR40H-101GR", "TCR40H", "101GR", "5905197771878", 37.71],
  ["TCR48-109GR", "TCR48", "109GR", "5905197784441", 36.65],
  ["TCR48H-101GR", "TCR48H", "101GR", "5905197771939", 52.68],
  ["TCS40-107GR", "TCS40", "107GR", "5905197771977", 36.51],
  ["TCS40H-109GR", "TCS40H", "109GR", "5905197782768", 65.18],
  ["TCS48-101GR", "TCS48", "101GR", "5905197772028", 71.72],
  ["TCC80-107GR", "TCC80", "107GR", "5905197771793", 57.36],
  ["TCB40-467R", "TCB40", "467R", "5905197771700", 14.98],
  ["TCB40H-107GR", "TCB40H", "107GR", "5905197771731", 32.77],
  ["TCB48-101GR", "TCB48", "101GR", "5905197771755", 38.23],
  ["TCA40-243R", "TCA40", "243R", "5905197773063", 26.26],
  ["TCA40H-243R", "TCA40H", "243R", "5905197773100", 40.96],
  ["TCA60-109GR", "TCA60", "109GR", "5905197773148", 54.63],
  ["TCA80-243R", "TCA80", "243R", "5905197773209", 94.97],
  ["TR40-243R", "TR40", "243R", "5905197773575", 20.48],
  ["TR60-243R", "TR60", "243R", "5905197773612", 40.96],
  ["TR80-243R", "TR80", "243R", "5905197773650", 76.47],
];

/* --------------------------------------------------------------- pricing */
/** Gewenste marge (ex-BTW) op de inkoopprijs. */
const MARGIN_PCT = 50;

function roundTo95(incl: number): number {
  const cents95 = Math.round((incl - 0.95) / 1);
  return Math.max(0.95, cents95 + 0.95);
}
function pricing(cost: number): { priceEx: number; tradeEx: number; inclP: number } {
  const targetIncl = (cost / (1 - MARGIN_PCT / 100)) * 1.21; // marge ex-BTW, dan +21% IVA
  const inclP = roundTo95(targetIncl);
  const priceEx = Math.round((inclP / 1.21) * 10000) / 10000;
  const tradeIncl = roundTo95(inclP * 0.8);
  const tradeExRaw = Math.round((tradeIncl / 1.21) * 10000) / 10000;
  const tradeEx = (tradeExRaw - cost) / tradeExRaw >= 0.2 ? tradeExRaw : priceEx;
  return { priceEx, tradeEx, inclP };
}

function dimText(m: Model): string {
  if (m.l && !m.w) return `Lengte ${m.l} mm.`;
  if (m.l) return `${m.l} × ${m.w} × ${m.h} mm.`;
  const parts: string[] = [];
  if (m.w) parts.push(`Ø ${m.w} mm`);
  if (m.h) parts.push(`${m.h} mm hoog`);
  return parts.length ? parts.join(", ") + "." : "";
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 0. zorg dat de bucket bestaat
  const { data: bk } = await sb.storage.getBucket(BUCKET);
  if (!bk) {
    await sb.storage.createBucket(BUCKET, { public: true });
    console.log(`Bucket '${BUCKET}' aangemaakt.`);
  }

  // 1. upload de 45 modelfoto's, onthoud publieke URL per basismodel
  const imageUrl = new Map<string, string>();
  const baseSkus = [...new Set(POTS.map((p) => p[1]))];
  for (const base of baseSkus) {
    const buf = readFileSync(`${IMG_DIR}/${base}.jpg`);
    const path = `ethick/${base}.jpg`;
    const up = await sb.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`Upload ${base}: ${up.error.message}`);
    imageUrl.set(base, sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  console.log(`${imageUrl.size} modelfoto's geüpload naar ${BUCKET}/ethick/.`);

  // 2. al bestaande SKU's overslaan (idempotent)
  const allSkus = [...POTS.map((p) => p[0]), "FCAK1867R-440R"];
  const existing = new Set(
    (await sql<{ sku: string }[]>`SELECT sku FROM products WHERE sku = ANY(${allSkus})`).map(
      (r) => r.sku,
    ),
  );
  if (existing.size) console.log(`Overslaan (bestaat al): ${[...existing].join(", ")}`);

  // 3. bloempotten invoegen
  let added = 0;
  for (const [fullSku, base, color, ean, cost] of POTS) {
    if (existing.has(fullSku)) continue;
    const m = MODELS[base];
    if (!m) throw new Error(`Onbekend basismodel: ${base}`);
    const kleur = COLOR[color] ?? color;
    const { priceEx, tradeEx } = pricing(cost);
    const name = `Bloempot ${m.model} ${base} — ${kleur}`;
    const desc = `ETHICK ${m.serie}-collectie. ${m.model}, kleur ${kleur}. ${dimText(m)}`.trim();
    await sql`
      INSERT INTO products
        (name, sku, barcode, collection, category, unit,
         price_eur, trade_price_eur, vat_rate,
         purchase_cost_eur, cost_eur, target_margin_pct,
         currency, description, width_mm, height_mm, length_mm,
         image_url, is_active, stock_qty)
      VALUES
        (${name}, ${fullSku}, ${ean}, 'Bloempotten', ${m.serie}, 'stuk',
         ${priceEx.toFixed(4)}, ${tradeEx.toFixed(4)}, 21,
         ${cost.toFixed(2)}, ${cost.toFixed(2)}, ${MARGIN_PCT},
         'EUR', ${desc}, ${m.w}, ${m.h}, ${m.l},
         ${imageUrl.get(base)!}, true, 1)
    `;
    added++;
  }

  // 4. lounger (geen katalogusfoto)
  if (!existing.has("FCAK1867R-440R")) {
    const cost = 175.8;
    const { priceEx, tradeEx } = pricing(cost);
    await sql`
      INSERT INTO products
        (name, sku, barcode, collection, category, unit,
         price_eur, trade_price_eur, vat_rate,
         purchase_cost_eur, cost_eur, target_margin_pct,
         currency, description, is_active, stock_qty)
      VALUES
        ('Lounger Capre FCAK1867R — wit', 'FCAK1867R-440R', '5905197875156',
         'Tuinmeubilair', 'Loungers', 'stuk',
         ${priceEx.toFixed(4)}, ${tradeEx.toFixed(4)}, 21,
         ${cost.toFixed(2)}, ${cost.toFixed(2)}, ${MARGIN_PCT},
         'EUR', 'Prosperplast Capre lounger, mono white. Niet in de ETHICK-katalogus.',
         true, 1)
    `;
    added++;
  }

  console.log(`\n${added} producten toegevoegd (${POTS.length} bloempotten + 1 lounger verwacht).`);

  // 5. samenvatting
  const rows = await sql<{ category: string; n: bigint; avgcost: string; avgprice: string }[]>`
    SELECT category, COUNT(*) n, ROUND(AVG(cost_eur),2) avgcost, ROUND(AVG(price_eur),2) avgprice
    FROM products WHERE collection IN ('Bloempotten','Tuinmeubilair')
    GROUP BY category ORDER BY category
  `;
  console.log("\nCategorie         | n  | gem. inkoop | gem. verkoop ex-BTW");
  console.log("─".repeat(58));
  for (const r of rows) {
    console.log(
      `${r.category.padEnd(17)} | ${String(r.n).padStart(2)} | € ${String(r.avgcost).padStart(9)} | € ${String(r.avgprice).padStart(9)}`,
    );
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
