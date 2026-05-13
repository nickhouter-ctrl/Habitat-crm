import "./load-env";
import { db, pgClient } from "../lib/db";
import { purchaseOrders } from "../lib/db/schema";
import { sql, eq, and, ne } from "drizzle-orm";
(async()=>{
  const all = await db.select().from(purchaseOrders);
  let inclAll=0, exAll=0, inclNonDraft=0, exNonDraft=0, draftN=0;
  for(const p of all){
    if((p.currency||"EUR")!=="EUR") continue;
    inclAll+=Number(p.total||0);
    exAll+=Number(p.subtotal||p.total||0);
    if(p.status!=="draft"){ inclNonDraft+=Number(p.total||0); exNonDraft+=Number(p.subtotal||p.total||0);} else draftN++;
  }
  console.log("PO totaal:", all.length, "| concepten:", draftN);
  console.log("ALLE EUR-docs:");
  console.log("  incl. BTW:", inclAll.toFixed(2));
  console.log("  ex.   BTW:", exAll.toFixed(2));
  console.log("ZONDER concept:");
  console.log("  incl. BTW:", inclNonDraft.toFixed(2));
  console.log("  ex.   BTW:", exNonDraft.toFixed(2));
  await pgClient.end(); process.exit(0);
})();
