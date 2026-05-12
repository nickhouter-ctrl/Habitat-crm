import "./load-env";
import { db } from "../lib/db";
import { products, contacts, documents, purchaseOrders, deals, activities } from "../lib/db/schema";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
(async()=>{
  const t0=Date.now();
  await Promise.all([
    db.select({n:count()}).from(contacts),
    db.select({stage:deals.stage,n:count(),v:sql`coalesce(sum(${deals.valueEur}),0)`}).from(deals).groupBy(deals.stage),
    db.select({a:sql`coalesce(sum(${documents.paidEur}),0)`}).from(documents).where(eq(documents.kind,"invoice")),
    db.select({a:sql`coalesce(sum(${documents.paidEur}),0)`}).from(documents).where(eq(documents.kind,"creditnote")),
    db.select({n:count(),t:sql`coalesce(sum(case when ${purchaseOrders.currency}='EUR' then ${purchaseOrders.total} else 0 end),0)`}).from(purchaseOrders),
    db.select().from(purchaseOrders).where(inArray(purchaseOrders.status,["ordered","in_transit"])),
    db.query.deals.findMany({orderBy:desc(deals.updatedAt),limit:7,with:{contact:{columns:{name:true}}}}),
    db.query.activities.findMany({orderBy:desc(activities.createdAt),limit:10,with:{author:{columns:{name:true}},contact:{columns:{id:true,name:true}},deal:{columns:{id:true,title:true}},document:{columns:{id:true,docNumber:true,kind:true}}}}),
  ]);
  console.log("dashboard batch:", Date.now()-t0, "ms");
  const t1=Date.now(); await db.select().from(purchaseOrders).limit(2000); console.log("inkooporders list:", Date.now()-t1,"ms");
  const t2=Date.now(); await db.query.products.findMany({limit:1000}); await db.select({n:sql`count(*)::int`,c:sql`coalesce(sum(coalesce(${products.costEur},0)*coalesce(${products.stockQty},0)),0)`}).from(products); console.log("products page:", Date.now()-t2,"ms");
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
