/**
 * Reproduceer de exacte body die pushPurchaseOrderToHolded() bouwt voor één
 * PO. Test de POST + log de error body.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const k = process.env.HOLDED_API_KEY!;

  // Een PO die faalde
  const r = await sql<Array<any>>`
    SELECT id, supplier, reference, currency, order_date, expected_date, total, items, notes
    FROM purchase_orders WHERE reference = 'HN-K-20251208-S-PL' AND holded_id IS NULL LIMIT 1
  `;
  if (!r.length) { console.log("Geen PO gevonden"); process.exit(0); }
  const po = r[0];
  console.log("PO:", po.supplier, po.reference, po.total);
  console.log("Items:", po.items.length, "regels");

  // Bouw exact zoals sync.ts
  const items = po.items;
  const productIds: string[] = items.map((i: any) => i.productId).filter(Boolean);
  let lookup = new Map<string, string | null>();
  if (productIds.length) {
    const ps = await sql<Array<{ id: string; holded_product_id: string | null }>>`
      SELECT id, holded_product_id FROM products WHERE id IN ${sql(productIds)}
    `;
    lookup = new Map(ps.map((p) => [p.id, p.holded_product_id]));
  }

  const productsBody = items.map((it: any) => ({
    name: it.name,
    ...(it.sku ? { sku: it.sku } : {}),
    ...(it.productId && lookup.get(it.productId) ? { productId: lookup.get(it.productId) } : {}),
    units: it.units,
    price: it.unitPrice,
    tax: 0,
    ...(it.note ? { desc: it.note } : {}),
  }));

  const dateUnix = po.order_date ? Math.floor(new Date(po.order_date).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const body: any = {
    desc: po.reference,
    date: dateUnix,
    currency: (po.currency ?? "EUR").toLowerCase(),
    notes: po.notes ?? "",
    products: productsBody,
    docNumber: po.reference,
    contactName: po.supplier,
    draft: true,
  };

  console.log("\nProducts body (eerste 2):", JSON.stringify(productsBody.slice(0, 2), null, 2));

  const res = await fetch("https://api.holded.com/api/invoicing/v1/documents/purchase", {
    method: "POST",
    headers: { key: k, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("\nStatus:", res.status);
  console.log("Body:", text);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
