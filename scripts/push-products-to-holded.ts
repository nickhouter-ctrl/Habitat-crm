/**
 * Push CRM products that aren't in Holded yet → create them in Holded.
 * We ONLY create new products (matched by SKU so we never duplicate); we never
 * modify existing Holded products. After creating, we store the Holded id back
 * on the CRM product so the sync links up.
 *
 *   npx tsx scripts/push-products-to-holded.ts                 (dry run, all CRM products without a holdedProductId)
 *   npx tsx scripts/push-products-to-holded.ts --apply
 *   npx tsx scripts/push-products-to-holded.ts --apply --prefix KKR-   (only SKUs starting with KKR-)
 */
import "./load-env";
import { eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { holded, holdedListAll } from "../lib/holded/client";

const APPLY = process.argv.includes("--apply");
const prefixArg = (() => { const i = process.argv.indexOf("--prefix"); return i >= 0 ? (process.argv[i + 1] ?? "") : ""; })();
const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s._/()]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
const n2 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function main() {
  if (!process.env.HOLDED_API_KEY) { console.error("HOLDED_API_KEY niet gezet."); process.exit(1); }

  const candidates = (await db.select().from(products).where(isNull(products.holdedProductId)))
    .filter((p) => p.sku && (!prefixArg || (p.sku ?? "").toUpperCase().startsWith(prefixArg.toUpperCase())));

  // Existing Holded SKUs/barcodes — never create a duplicate.
  const remote = await holdedListAll((page) => holded.products.list({ page }));
  const remoteBySku = new Map(remote.filter((r) => r.sku).map((r) => [normSku(r.sku), r]));
  const remoteByBarcode = new Map(remote.filter((r) => r.barcode).map((r) => [String(r.barcode).trim(), r]));

  const toCreate: typeof candidates = [];
  const linkOnly: { id: string; sku: string; holdedId: string }[] = [];
  for (const p of candidates) {
    const match = remoteBySku.get(normSku(p.sku)) ?? (p.barcode ? remoteByBarcode.get(p.barcode.trim()) : undefined);
    if (match) { linkOnly.push({ id: p.id, sku: p.sku!, holdedId: match.id }); continue; }
    toCreate.push(p);
  }

  console.log(`CRM-producten zonder Holded-koppeling${prefixArg ? ` (prefix ${prefixArg})` : ""}: ${candidates.length}`);
  console.log(`  → al in Holded (alleen koppelen): ${linkOnly.length}`);
  console.log(`  → nieuw in Holded aanmaken: ${toCreate.length}\n`);
  for (const p of toCreate) console.log(`  CREATE  ${p.sku}  ${p.name}  ·  prijs €${n2(p.priceEur)} · kostprijs €${n2(p.costEur)} · aankoop €${n2(p.purchaseCostEur)}`);
  for (const l of linkOnly) console.log(`  LINK    ${l.sku}  → Holded ${l.holdedId}`);

  if (!APPLY) { console.log("\n(dry run — --apply om door te voeren)"); process.exit(0); }

  for (const l of linkOnly) {
    await db.update(products).set({ holdedProductId: l.holdedId, updatedAt: new Date() }).where(eq(products.id, l.id));
  }
  let created = 0;
  for (const p of toCreate) {
    const body = {
      name: p.name,
      desc: p.description ?? "",
      sku: p.sku,
      ...(p.barcode ? { barcode: p.barcode } : {}),
      kind: "simple",
      price: n2(p.priceEur),
      tax: p.vatRate ?? 21,
      cost: n2(p.costEur),
      purchasePrice: n2(p.purchaseCostEur),
      hasStock: true,
      stock: n2(p.stockQty),
      forSale: p.isActive,
      forPurchase: true,
    };
    try {
      const res = await holded.products.create(body);
      const holdedId = res.id;
      if (!holdedId) { console.warn(`! ${p.sku}: geen id terug van Holded`, res); continue; }
      await db.update(products).set({ holdedProductId: holdedId, updatedAt: new Date() }).where(eq(products.id, p.id));
      created++;
      console.log(`  ✓ ${p.sku} → Holded ${holdedId}`);
    } catch (err) {
      console.error(`  ✗ ${p.sku}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nKlaar: ${created} producten aangemaakt in Holded, ${linkOnly.length} gekoppeld.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
