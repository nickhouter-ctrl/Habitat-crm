/**
 * Import Golden Ocean "Ultra Thin Magnetic Track Light" (PI GOV260716, 16-07-2026).
 *
 * Prijsregels (opdracht Nick, 17-07-2026):
 *  - inkoop = USD-prijs × live USD→EUR-koers (ECB)
 *  - kostprijs = inkoop + 15% handling + 40% invoer  (×1,55 — zelfde als kozijnen;
 *    vastgelegd via purchaseCostEur + dutyPct 55 zodat het bewerkscherm gelijk rekent)
 *  - verkoop ex btw = kostprijs / 0,40  (60% MARGE VAN DE VERKOOPPRIJS — definitief
 *    bevestigd door Nick 17-07 via keuzevraag; targetMarginPct 60)
 *  - aannemersprijs = verkoop × 0,80 (vaste regel)
 * SKU's = de Item No's van de leverancier. 3 SKU's staan dubbel op de PI
 * (wit+zwart zonder kleur-suffix) → één product met beide kleuren in de naam.
 * Maakt ook de inkooporder (concept/proforma, USD) met alle regels aan.
 *
 *   npx tsx scripts/import-golden-ocean-tracklight.ts          (dry-run)
 *   npx tsx scripts/import-golden-ocean-tracklight.ts --apply
 */
import "./load-env";
import { inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { products, purchaseOrders } from "../lib/db/schema";
import { rateToEur } from "../lib/fx";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;

// [sku, naam, omschrijving-extra, usd, qty]
type Row = [string, string, string, number, number];
const spec = (p: string, size: string, angle?: string) =>
  `${p} · ${size} mm · 3000K · DC48V · Sanan LED · CRI>90${angle ? ` · ${angle}` : ""}`;

const ROWS: Row[] = [
  ["GO-MG-F6W-White", "Magnetic track floodlight 6W – White", spec("6W", "26×26×120", "120°"), 2.79, 60],
  ["GO-MG-F6W-Black", "Magnetic track floodlight 6W – Black", spec("6W", "26×26×120", "120°"), 2.79, 140],
  ["GO-MG-F12W-White", "Magnetic track floodlight 12W – White", spec("12W", "26×26×235", "120°"), 3.97, 50],
  ["GO-MG-F12W-Black", "Magnetic track floodlight 12W – Black", spec("12W", "26×26×235", "120°"), 3.97, 110],
  ["GO-MG-F18W-White", "Magnetic track floodlight 18W – White", spec("18W", "26×26×450", "120°"), 4.96, 40],
  ["GO-MG-F18W-Black", "Magnetic track floodlight 18W – Black", spec("18W", "26×26×450", "120°"), 4.96, 80],
  ["GO-MG-G6W-White", "Magnetic track grille light 6W – White", spec("6W", "26×26×120", "24°"), 2.96, 60],
  ["GO-MG-G6W-Black", "Magnetic track grille light 6W – Black", spec("6W", "26×26×120", "24°"), 2.96, 140],
  ["GO-MG-G12W-White", "Magnetic track grille light 12W – White", spec("12W", "26×26×235", "24°"), 4.18, 50],
  ["GO-MG-G12W-Black", "Magnetic track grille light 12W – Black", spec("12W", "26×26×235", "24°"), 4.18, 110],
  ["GO-MG-G18W-White", "Magnetic track grille light 18W – White", spec("18W", "26×26×450", "24°"), 5.64, 40],
  ["GO-MG-G18W-Black", "Magnetic track grille light 18W – Black", spec("18W", "26×26×450", "24°"), 5.64, 80],
  ["GO-MG-GF6W-White", "Magnetic track honeycomb grille light 6W – White", spec("6W", "26×26×120", "24°"), 3.06, 50],
  ["GO-MG-GF6W-Black", "Magnetic track honeycomb grille light 6W – Black", spec("6W", "26×26×120", "24°"), 3.06, 50],
  ["GO-MG-GF12W-White", "Magnetic track honeycomb grille light 12W – White", spec("12W", "26×26×235", "24°"), 4.27, 50],
  ["GO-MG-GF12W-Black", "Magnetic track honeycomb grille light 12W – Black", spec("12W", "26×26×235", "24°"), 4.27, 50],
  ["GO-MG-ZF6W-White", "Magnetic track folding floodlight 6W – White", spec("6W", "26×90×120", "120°"), 4.33, 40],
  ["GO-MG-ZF6W-Black", "Magnetic track folding floodlight 6W – Black", spec("6W", "26×90×120", "120°"), 4.33, 80],
  ["GO-MG-ZF12W-White", "Magnetic track folding floodlight 12W – White", spec("12W", "26×90×235", "120°"), 5.89, 40],
  ["GO-MG-ZF12W-Black", "Magnetic track folding floodlight 12W – Black", spec("12W", "26×90×235", "120°"), 5.89, 80],
  ["GO-MG-ZG6W-White", "Magnetic track folding grille light 6W – White", spec("6W", "26×90×120", "24°"), 4.51, 40],
  ["GO-MG-ZG6W-Black", "Magnetic track folding grille light 6W – Black", spec("6W", "26×90×120", "24°"), 4.51, 105],
  ["GO-MG-ZG12W-White", "Magnetic track folding grille light 12W – White", spec("12W", "26×90×235", "24°"), 6.24, 40],
  ["GO-MG-ZG12W-Black", "Magnetic track folding grille light 12W – Black", spec("12W", "26×90×235", "24°"), 6.24, 105],
  ["GO-MG-ZGF6W-White", "Magnetic track folding honeycomb grille 6W – White", spec("6W", "26×90×120", "24°"), 4.69, 40],
  ["GO-MG-ZGF6W-Black", "Magnetic track folding honeycomb grille 6W – Black", spec("6W", "26×90×120", "24°"), 4.69, 40],
  ["GO-MG-ZGF12W-White", "Magnetic track folding honeycomb grille 12W – White", spec("12W", "26×90×235", "24°"), 6.68, 40],
  ["GO-MG-ZGF12W-Black", "Magnetic track folding honeycomb grille 12W – Black", spec("12W", "26×90×235", "24°"), 6.68, 40],
  ["GO-MG-S10W-White", "Magnetic track spotlight 10W – White", spec("10W", "45×100", "24°"), 5.59, 50],
  ["GO-MG-S10W-Black", "Magnetic track spotlight 10W – Black", spec("10W", "45×100", "24°"), 5.59, 110],
  ["GO-MG-S20W-White", "Magnetic track spotlight 20W – White", spec("20W", "55×120", "24°"), 8.44, 50],
  ["GO-MG-S20W-Black", "Magnetic track spotlight 20W – Black", spec("20W", "55×120", "24°"), 8.44, 110],
  // Dubbele SKU op de PI (wit 50 + zwart 110) → één product, kleuren in omschrijving.
  ["GO-MG-S10W2", "Magnetic track double spotlight 2×10W – White/Black", spec("2×10W", "45×100", "24°") + " · leverbaar in wit en zwart", 9.45, 160],
  ["GO-MG-RG10W-White", "Magnetic track flexible light 10W 1m – White", spec("10W", "26×1000", "360°"), 14.07, 20],
  ["GO-MG-RG10W-Black", "Magnetic track flexible light 10W 1m – Black", spec("10W", "26×1000", "360°"), 14.07, 20],
  ["GO-MG-RG20W-White", "Magnetic track flexible light 20W 2m – White", spec("20W", "26×2000", "360°"), 20.3, 10],
  ["GO-MG-RG20W-Black", "Magnetic track flexible light 20W 2m – Black", spec("20W", "26×2000", "360°"), 20.3, 10],
  ["GO-MG-D8W-White", "Magnetic track pendant light 8W – White", spec("8W", "30×300", "24°"), 8.03, 30],
  ["GO-MG-D8W-Black", "Magnetic track pendant light 8W – Black", spec("8W", "30×300", "24°"), 8.03, 50],
  // Dubbele SKU's (wit+zwart): één product per vermogen.
  ["GO-MG-P100W-220V", "Power supply 100W 220V→DC48V – White/Black", "100W · in 180-245V · uit DC48V · leverbaar in wit en zwart", 6.42, 180],
  ["GO-MG-P200W-220V", "Power supply 200W 220V→DC48V – White/Black", "200W · in 180-245V · uit DC48V · leverbaar in wit en zwart", 9.07, 90],
  ["GO-MG-T4327-1m-White", "Ultra thin surface-mounted track 1m – White", "1 m · 26×6 mm", 2.45, 120],
  ["GO-MG-T4327-1m-Black", "Ultra thin surface-mounted track 1m – Black", "1 m · 26×6 mm", 2.45, 200],
  ["GO-MG-T4327-2m-White", "Ultra thin surface-mounted track 2m – White", "2 m · 26×6 mm", 4.89, 60],
  ["GO-MG-T4327-2m-Black", "Ultra thin surface-mounted track 2m – Black", "2 m · 26×6 mm", 4.89, 150],
  ["GO-MG-MZ-I-White", "Track connector I – White", "30×26×6,1 mm · opbouw", 0.51, 100],
  ["GO-MG-MZ-I-Black", "Track connector I – Black", "30×26×6,1 mm · opbouw", 0.51, 200],
  ["GO-MG-MZ-L-White", "Track connector L – White", "55×55×6,1 mm · opbouw", 0.77, 50],
  ["GO-MG-MZ-L-Black", "Track connector L – Black", "55×55×6,1 mm · opbouw", 0.77, 100],
  ["GO-MG-MZ-L2-White", "Track connector corner L2 – White", "55×55×6,1 mm · opbouw", 0.77, 30],
  ["GO-MG-MZ-L2-Black", "Track connector corner L2 – Black", "55×55×6,1 mm · opbouw", 0.77, 50],
  ["GO-MG-MZ-T-White", "Track connector T – White", "60×94×6,1 mm · opbouw", 0.94, 30],
  ["GO-MG-MZ-T-Black", "Track connector T – Black", "60×94×6,1 mm · opbouw", 0.94, 50],
  ["GO-MG-MZ-CL-White", "Track connector vertical L – White", "35×35×6,1 mm · opbouw", 0.77, 30],
  ["GO-MG-MZ-CL-Black", "Track connector vertical L – Black", "35×35×6,1 mm · opbouw", 0.77, 50],
  ["GO-MG-ZXH-White", "Wire cover box (built-in PSU) – White", "26×26×103 mm", 0.88, 50],
  ["GO-MG-ZXH-Black", "Wire cover box (built-in PSU) – Black", "26×26×103 mm", 0.88, 50],
  ["GO-MG-DDH-White", "Track feed box 5A – White", "5A · 26×26×120 mm", 1.91, 50],
  ["GO-MG-DDH-Black", "Track feed box 5A – Black", "5A · 26×26×120 mm", 1.91, 50],
];

const SHIPPING_USD = 3841.52;
const PI_TOTAL_USD = 21891.97;

async function main() {
  const rate = await rateToEur("USD");
  console.log(`USD→EUR koers: ${rate}`);

  const existing = await db
    .select({ sku: products.sku })
    .from(products)
    .where(inArray(products.sku, ROWS.map((r) => r[0])));
  const have = new Set(existing.map((e) => e.sku));

  let totUsd = 0;
  const toInsert: (typeof products.$inferInsert)[] = [];
  for (const [sku, name, desc, usd, qty] of ROWS) {
    totUsd += usd * qty;
    const inkoopEur = r2(usd * rate);
    const kostEur = r2(inkoopEur * 1.55);
    const verkoopEur = r2(kostEur / 0.4); // 60% marge van de verkoopprijs
    const tradeEur = r2(verkoopEur * 0.8);
    const status = have.has(sku) ? "BESTAAT AL — overslaan" : "";
    console.log(
      `${sku.padEnd(24)} $${String(usd).padEnd(6)} → inkoop €${String(inkoopEur).padEnd(6)} kost €${String(kostEur).padEnd(6)} verkoop €${String(verkoopEur).padEnd(7)} (incl. btw €${r2(verkoopEur * 1.21)}) ${status}`,
    );
    if (have.has(sku)) continue;
    toInsert.push({
      name,
      sku,
      collection: "Verlichting",
      category: "Magnetic Track",
      unit: "stuk",
      priceEur: String(verkoopEur),
      tradePriceEur: String(tradeEur),
      vatRate: 21,
      purchaseCostEur: String(inkoopEur),
      dutyPct: "55", // 15% handling + 40% invoer op de inkoop → kost = inkoop × 1,55
      targetMarginPct: "60",
      costEur: String(kostEur),
      description: `Ultra Thin Magnetic Track systeem — ${desc}. Leverancier: Golden Ocean Lighting (PI GOV260716, $${usd}/st).`,
      stockQty: "0",
      isActive: true,
      pushToWebsite: false,
    });
  }
  console.log(`\n${toInsert.length} nieuwe producten (${have.size} bestonden al) · PI goederen $${r2(totUsd)} + verzending $${SHIPPING_USD} = $${r2(totUsd + SHIPPING_USD)} (PI zegt $${PI_TOTAL_USD})`);

  if (!APPLY) {
    console.log("dry-run — niets geschreven (draai met --apply)");
    process.exit(0);
  }

  const inserted = toInsert.length
    ? await db.insert(products).values(toInsert).returning({ id: products.id, sku: products.sku })
    : [];
  const idBySku = new Map(inserted.map((p) => [p.sku, p.id]));
  console.log(`producten aangemaakt: ${inserted.length}`);

  // Inkooporder (concept/proforma — goedkeuren zet 'm op besteld; ontvangst boekt voorraad).
  const [existingPo] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(inArray(purchaseOrders.reference, ["GOV260716"]));
  if (existingPo) {
    console.log(`inkooporder GOV260716 bestaat al (${existingPo.id}) — overslaan`);
  } else {
    const items = ROWS.map(([sku, name, , usd, qty]) => ({
      name,
      sku,
      productId: idBySku.get(sku),
      units: qty,
      unitPrice: usd,
    }));
    items.push({ name: "Shipping DDP Sea (55-65 dagen)", sku: undefined as unknown as string, productId: undefined, units: 1, unitPrice: SHIPPING_USD });
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        supplier: "Shenzhen Golden Ocean Lighting Co., Ltd",
        reference: "GOV260716",
        status: "draft", // proforma — eerst goedkeuren
        currency: "USD",
        orderDate: "2026-07-16",
        total: String(PI_TOTAL_USD),
        subtotal: String(PI_TOTAL_USD), // EXW/DDP: geen btw op de PI
        tax: "0",
        items,
        notes:
          "Proforma GOV260716 — Ultra Thin Magnetic Track Light. 4.160 stuks, prijzen EXW (USD), verzending DDP Sea $3.841,52 (55-65 dagen na afvaart). Prijs 7 dagen geldig; betaling 50% vooraf / 50% vóór verzending. Contact: Teresa (Teresa.etrading@gmail.com).",
      })
      .returning({ id: purchaseOrders.id });
    console.log(`inkooporder aangemaakt (concept): ${po.id}`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
