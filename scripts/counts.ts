import "./load-env";
import { db } from "../lib/db";
import { products, contacts, documents, purchaseOrders, activities, holdedSyncMap } from "../lib/db/schema";
import { sql } from "drizzle-orm";
(async()=>{
  for (const [name,t] of [["products",products],["contacts",contacts],["documents",documents],["purchaseOrders",purchaseOrders],["activities",activities],["holdedSyncMap",holdedSyncMap]] as const) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t);
    console.log(name, r.n);
  }
  // size of jsonb items on purchaseOrders
  const po = await db.select({ id: purchaseOrders.id, items: purchaseOrders.items }).from(purchaseOrders);
  let totItems=0, maxItems=0; for (const x of po){const n=(x.items?.length??0);totItems+=n;maxItems=Math.max(maxItems,n);}
  console.log("PO line items: total", totItems, "max", maxItems);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
