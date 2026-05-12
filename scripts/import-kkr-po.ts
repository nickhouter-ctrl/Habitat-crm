/**
 * One-off: seed the KingKonree proforma invoice (order #33#kkr20251126xm,
 * 9 March 2026 — not yet in stock) as a purchase order.
 *
 *   npx tsx scripts/import-kkr-po.ts          (dry run)
 *   npx tsx scripts/import-kkr-po.ts --apply
 */
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products, purchaseOrders } from "../lib/db/schema";
import { poTotal } from "../lib/purchase-orders";

const APPLY = process.argv.includes("--apply");
const REFERENCE = "33#kkr20251126xm";

function normSku(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\s._/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

// [sku, name, note, unitPriceUSD, units]
const RAW: [string | null, string, string, number, number][] = [
  ["KKR-H5060-D", "Wall Hung Basin", "Design white · 1524×560×101.6mm · solid surface · matt · 2 faucet holes · 2 drainages", 384.25, 2],
  ["KKR-1264-1", "Wall Hung Basin", "Design white · 1202×455×80mm · 2 faucet holes · 1 drainage", 261.73, 2],
  ["KKR-1261-1", "Wall Hung Basin", "Design white · 702×452×80mm · 1 faucet hole · 1 drainage", 181.12, 2],
  ["KKR-PU217", "Basin Drainage Whole Set -C + solid surface cover", "Brushed Bronze · past op KKR-H5060-D / 1264-1 / 1261-1", 79.23, 8],
  ["KKR-B051-A", "Bathtub", "Design white · 1780×785×590mm · solid surface · matt", 811.25, 2],
  ["KKR-B008-B", "Bathtub", "Design white · 1750×832×550mm · solid surface · matt", 1149.8, 1],
  ["KKR-PU9", "Bathtub Drainage + Solid Surface Drain Cover", "Design white · past op KKR-B051-A / B008-B · 75mm", 30.65, 3],
  ["KKR-B051", "Bathtub", "Gold · 1865×840×595mm · resin · glossy", 1290.6, 1],
  ["KKR-PU9-RESIN", "Bathtub Drainage + Resin Drain Cover", "past op KKR-B051 · 75mm", 32.51, 1],
  ["KKR-B-RACK09", "Bathtub Rack", "Design white · 850×220×40mm · solid surface · matt", 52.65, 2],
  ["KKR-H7072-D", "Cabinet Basin", "Design white · 1829×560×30mm · met overloop · 2 faucet holes", 597.78, 1],
  ["KKR-H7036", "Cabinet Basin", "Design white · 914×560×30mm · met overloop · 1 faucet hole", 373.8, 1],
  ["KKR-PU005", "Basin Drainage Whole Set -C + solid surface cover", "Brushed Bronze · past op KKR-H7072-D / H7036", 79.23, 2],
  ["KKR-2120", "Countertop Basin", "Design white · 870×415×160mm · solid surface · matt", 165.9, 50],
  ["KKR-2124", "Countertop Basin", "Design white · 500×330×145mm · solid surface · matt", 66.59, 31],
  ["KKR-1169", "Countertop Basin", "Design white · 500×350×140mm · solid surface · matt", 111.21, 34],
  ["KKR-1507", "Countertop Basin", "Design white · 400×400×320mm · solid surface · matt", 177.25, 20],
  ["KKR-1908", "Freestanding Basin", "Design white · 450×450×850mm · solid surface · matt", 512.73, 8],
  ["KKR-PU004", "Basin Drainage Whole Set -C + solid surface cover", "Brushed Bronze · past op KKR-2120 / 1169 / 1507", 58.69, 135],
  ["KKR-PD032", "Freestanding Basin Drainage Set", "Brushed Bronze · past op KKR-1908 · 800mm pijp", 64.46, 8],
  ["KKR-T001-D", "Solid Surface Base", "Design white · 1225×900×68mm · incl. solid surface cover · excl. drainage", 214.5, 50],
  ["KKR-P15-2", "Shower Tray Drainer (Pop Up Waste)", "plastic · chrome", 7.99, 50],
  ["KKR-1080-1", "Bathroom Tray", "Design white · 250×250×25mm · solid surface · matt", 46.0, 50],
  ["KKR-3502A", "Double Towel Rack", "Brushed Bronze · SUS304", 69.93, 50],
  ["KKR-3512", "Toilet Brush Holder", "Brushed Bronze · SUS304", 27.81, 50],
  ["KKR-3508", "Robe Hook", "Brushed Bronze · SUS304", 9.45, 50],
  ["KKR-3704", "Towel Bar", "Brushed Bronze · SUS304", 19.98, 100],
  ["KKR-3209A", "Paper Holder", "Brushed Bronze · SUS304", 9.72, 100],
  ["KKR-A110", "Translucent Acrylic Solid Surface", "glossy · 2440×1220×10mm", 314.06, 5],
  ["KKR-A025", "Translucent Acrylic Solid Surface", "matt · 2440×1220×10mm", 292.31, 5],
  ["KKR-A001", "Translucent Acrylic Solid Surface", "matt · 2440×1220×10mm", 265.73, 5],
  ["KKR-A027", "Translucent Acrylic Solid Surface", "matt · 2440×1220×10mm", 292.31, 5],
  ["KKR-A026", "Translucent Acrylic Solid Surface", "matt · 2440×1220×10mm", 292.31, 5],
  ["KKR-M8807", "Modified Acrylic Solid Surface Sheets", "matt · 3660×760×12mm", 329.33, 4],
  [null, "Solid Surface Color Samples", "30 kleuren · 160×80×12mm · gratis", 0, 124],
  ["KKR-B051-SAMPLE", "Clear Resin Tub — small sample", "Lake blue · 290×148×105mm · resin · glossy", 135.0, 5],
  [null, "KKR speciale korting voor deze order", "", -2000, 1],
];

async function main() {
  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.reference, REFERENCE),
  });
  if (existing) {
    console.log(`Purchase order "${REFERENCE}" already exists (${existing.id}) — nothing to do.`);
    process.exit(0);
  }

  const crm = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products);
  const bySku = new Map(crm.filter((p) => p.sku).map((p) => [normSku(p.sku), p]));

  let linked = 0;
  const items = RAW.map(([sku, name, note, unitPrice, units]) => {
    const match = sku ? bySku.get(normSku(sku)) : undefined;
    if (match) linked++;
    return {
      name,
      sku: sku ?? undefined,
      productId: match?.id,
      units,
      unitPrice,
      note: note || undefined,
    };
  });

  const total = poTotal(items);
  console.log(`${items.length} regels · ${linked} gekoppeld aan een product · totaal US$${total.toFixed(2)}`);
  for (const it of items) {
    console.log(`  ${it.productId ? "✓" : " "} ${it.sku ?? "—"}  ${it.name}  ×${it.units}  US$${it.unitPrice}`);
  }

  if (!APPLY) {
    console.log("\n(dry run — re-run with --apply to create the purchase order)");
    process.exit(0);
  }

  const [row] = await db
    .insert(purchaseOrders)
    .values({
      supplier: "KingKonree International (H.K) Limited",
      reference: REFERENCE,
      status: "in_transit",
      currency: "USD",
      orderDate: "2026-03-09",
      expectedDate: "2026-04-05",
      total: String(total),
      items,
      notes:
        "Proforma invoice. KKR systeem-nr. 250701144709. Productie gereed ~31 maart (drainage ~5 april). " +
        "Betaling: 50% aanbetaling, 50% voor verzending. FOB Shenzhen. Geldig t/m 8 mei 2026.",
    })
    .returning({ id: purchaseOrders.id });

  console.log(`\nAangemaakt: /inkooporders/${row.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
