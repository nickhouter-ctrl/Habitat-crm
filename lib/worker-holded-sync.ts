import "server-only";
import { and,eq,inArray,isNotNull,lt,or,isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets as sheets,purchaseOrders } from "@/lib/db/schema";
import { holded } from "@/lib/holded/client";
import { deliverWorkerPurchase,supplierMatches,verifyWorkerPurchase,workerInvoiceTag,workerPurchaseBody } from "@/lib/worker-holded-delivery";

export async function syncWorkerInvoice(id:string) {
  if(process.env.CRM_EXTERNAL_EFFECTS==="disabled")return;
  const attemptAt=new Date();
  const cutoff=new Date(attemptAt.getTime()-5*60_000);
  const claimed=await db.transaction(async tx=>{
    const [s]=await tx.select().from(sheets).where(and(eq(sheets.id,id),eq(sheets.invoiceStatus,"approved"),isNotNull(sheets.purchaseOrderId))).for("update");
    if(!s?.invoice||!s.holdedSyncStatus||s.holdedSyncStatus==="sent")return null;
    if(s.holdedSyncStatus!=="pending"&&s.holdedSyncAttemptAt&&s.holdedSyncAttemptAt>cutoff)return null;
    await tx.update(sheets).set({holdedSyncStatus:["posting","unknown"].includes(s.holdedSyncStatus)?"posting":"processing",holdedSyncAttemptAt:attemptAt}).where(eq(sheets.id,id));
    return s;
  });
  if(!claimed?.invoice||!claimed.purchaseOrderId)return;
  const invoice=claimed.invoice,poId=claimed.purchaseOrderId;
  const [po]=await db.select().from(purchaseOrders).where(eq(purchaseOrders.id,poId));
  if(!po||po.projectId!==claimed.projectId||po.reference!==invoice.number){await db.update(sheets).set({holdedSyncStatus:"error",holdedSyncError:"Inkoopfactuur en weekstaat sluiten niet aan."}).where(eq(sheets.id,id));return;}
  const result=await deliverWorkerPurchase({
    find:async()=>{
      const docs=await holded.documents.list("purchase");
      const tagged=docs.filter(d=>d.tags?.includes(workerInvoiceTag(id))||d.notes?.includes(workerInvoiceTag(id)));
      if(tagged.length>1)throw Error("Multiple matching documents");
      if(tagged[0])return tagged[0].id;
      // A manually imported invoice may already exist. Match tax identity too,
      // never a supplier's invoice number alone.
      const matches=[];
      for(const d of docs.filter(d=>d.docNumber===invoice.number&&d.contact)){
        if(supplierMatches(await holded.contacts.get(d.contact!),invoice))matches.push(d);
      }
      if(matches.length>1)throw Error("Multiple supplier invoices");
      if(matches[0]){verifyWorkerPurchase(matches[0],invoice);return matches[0].id;}
      return null;
    },
    prepare:async()=>{
      const contacts=await holded.contacts.list();const matches=contacts.filter(c=>supplierMatches(c,invoice));
      if(matches.length>1)throw Error("Multiple supplier tax identities");
      let contact=matches[0]?.id;
      if(!contact){const result=await holded.contacts.create({name:invoice.legalName,code:invoice.taxId,type:"supplier",...(invoice.email?{email:invoice.email}:{}),iban:invoice.iban,billAddress:{address:invoice.address}});if(!result.id)throw Error("No supplier ID");contact=result.id;}
      return workerPurchaseBody(id,invoice,contact);
    },
    posting:async()=>{const owned=await db.update(sheets).set({holdedSyncStatus:"posting"}).where(and(eq(sheets.id,id),eq(sheets.holdedSyncAttemptAt,attemptAt))).returning({id:sheets.id});if(!owned.length)throw Error("Sync claim expired");},
    create:async body=>{const result=await holded.documents.create("purchase",body);if(!result.id)throw Error("No document ID");return result.id;},
    remember:async remoteId=>{await db.update(purchaseOrders).set({holdedId:remoteId,updatedAt:new Date()}).where(eq(purchaseOrders.id,poId));},
    verify:async remoteId=>{verifyWorkerPurchase(await holded.documents.get("purchase",remoteId),invoice);},
  },po.holdedId,["posting","unknown"].includes(claimed.holdedSyncStatus!));
  await db.update(sheets).set({holdedSyncStatus:result.status,holdedSyncError:result.error}).where(and(eq(sheets.id,id),eq(sheets.holdedSyncAttemptAt,attemptAt)));
}
export async function syncPendingWorkerInvoices() {
  if(process.env.CRM_EXTERNAL_EFFECTS==="disabled")return {processed:0};
  const rows=await db.select({id:sheets.id}).from(sheets).where(and(eq(sheets.invoiceStatus,"approved"),inArray(sheets.holdedSyncStatus,["pending","error","processing","posting","unknown"]),or(isNull(sheets.holdedSyncAttemptAt),lt(sheets.holdedSyncAttemptAt,new Date(Date.now()-5*60_000))))).limit(5);
  for(const row of rows)await syncWorkerInvoice(row.id);
  return {processed:rows.length};
}
