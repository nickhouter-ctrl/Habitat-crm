import "./load-env";
import { db } from "../lib/db";
import { purchaseOrders } from "../lib/db/schema";
(async()=>{
  const r = await db.select().from(purchaseOrders);
  let e=0,o=0; for(const p of r){ if((p.currency||"EUR")==="EUR") e+=Number(p.total||0); else o+=Number(p.total||0); }
  console.log("Inkooporders:", r.length, "| EUR-totaal:", e.toFixed(2), "| niet-EUR:", o.toFixed(2));
  console.log("Holded sales-aankopen (EUR-docs):", r.filter(x=>x.holdedId).length, "stuks");
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
