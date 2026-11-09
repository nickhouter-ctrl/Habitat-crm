import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({current:null as unknown,userId:"",allow:true}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/guards",()=>({requireModule:async()=>{if(!m.allow)throw Error("DENIED");return {id:m.userId}}}));
vi.mock("@/lib/db",async()=>{const real=await vi.importActual<typeof import("@/lib/db")>("@/lib/db");return {...real,db:new Proxy(real.db,{get(target,key){const active=(m.current??target) as typeof real.db;const value=Reflect.get(active,key);return typeof value==="function"?value.bind(active):value}})}});
import { documents,products,users } from "../db/schema";
import { computeTotals } from "../documents";
import { prepareReturnFee,returnFeeVersion } from "../return-fee-service";
const enabled=process.env.RETURN_FEE_DB_TEST==="1";
afterAll(async()=>{if(enabled)await(await vi.importActual<typeof import("@/lib/db")>("@/lib/db")).pgClient.end({timeout:1})});
it.skipIf(!enabled)("atomically prepares draft fee and full credit, rejects stale/issued/unauthorized requests, preserves stock and deduplicates",async()=>{
 const real=await vi.importActual<typeof import("@/lib/db")>("@/lib/db"),stop=new Error("ROLLBACK");
 try{await real.db.transaction(async tx=>{m.current=tx;m.userId=randomUUID();await tx.insert(users).values({id:m.userId,name:"Return fee test",email:m.userId+"@example.invalid",role:"admin"});const [p]=await tx.insert(products).values({name:"Test return product",stockQty:"148"}).returning();const items=[{name:"Test return product",productId:p.id,units:148,price:82.6,taxRate:21}];const totals=computeTotals(items);const [inv]=await tx.insert(documents).values({kind:"invoice",status:"draft",docNumber:"TEST-"+randomUUID(),items,subtotalEur:String(totals.subtotal),taxEur:String(totals.tax),totalEur:String(totals.total)}).returning();const creditItems=[...items,{name:"fee",units:1,price:-2218.8,taxRate:21}];const ct=computeTotals(creditItems);const [cn]=await tx.insert(documents).values({kind:"creditnote",status:"draft",sourceDocumentId:inv.id,items:creditItems,subtotalEur:String(ct.subtotal),taxEur:String(ct.tax),totalEur:String(ct.total)}).returning();
 const version=returnFeeVersion(inv,[cn]);m.allow=false;await expect(prepareReturnFee(inv.id,version)).rejects.toThrow("DENIED");m.allow=true;
 expect((await prepareReturnFee(inv.id,"0".repeat(64))).error).toContain("gewijzigd");
 await tx.update(documents).set({sentAt:new Date()}).where(eq(documents.id,cn.id));expect((await prepareReturnFee(inv.id,version)).error).toContain("conceptcreditnota");await tx.update(documents).set({sentAt:null}).where(eq(documents.id,cn.id));
 await tx.update(documents).set({paidEur:"1"}).where(eq(documents.id,inv.id));expect((await prepareReturnFee(inv.id,version)).error).toContain("betalingen");await tx.update(documents).set({paidEur:"0"}).where(eq(documents.id,inv.id));
 const [freshInv]=await tx.select().from(documents).where(eq(documents.id,inv.id));const [freshCn]=await tx.select().from(documents).where(eq(documents.id,cn.id));
 const result=await prepareReturnFee(inv.id,returnFeeVersion(freshInv,[freshCn]));expect(result.error).toBeUndefined();if(!result.id)throw Error("Missing invoice");
 const [feeDoc]=await tx.select().from(documents).where(eq(documents.id,result.id));const [credit]=await tx.select().from(documents).where(eq(documents.id,cn.id));const [stock]=await tx.select().from(products).where(eq(products.id,p.id));expect(feeDoc.totalEur).toBe("2684.75");expect(feeDoc.items.every(i=>!i.productId)).toBe(true);expect(feeDoc.status).toBe("draft");expect(feeDoc.stockAppliedAt).toBeNull();expect(credit.totalEur).toBe("14792.01");expect(credit.status).toBe("draft");expect(credit.stockAppliedAt).toBeNull();expect(stock.stockQty).toBe("148.000");expect((await prepareReturnFee(inv.id,version)).id).toBe(result.id);
 throw stop;
 });}catch(e){if(e!==stop)throw e}finally{m.current=null;m.allow=true}
},30000);
