import "server-only";
import { and,eq,inArray,isNotNull,lt,or,isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets as sheets,workerLumpInvoices as lumps,purchaseOrders,projects } from "@/lib/db/schema";
import { holded, holdedListAll } from "@/lib/holded/client";
import type { HoldedDocument, HoldedTax } from "@/lib/holded/types";
import { suggestBooking, type HistoryLine } from "@/lib/holded/purchase-learning";
import type { WeekDay, WorkerInvoice } from "@/lib/worker-week";
import { renderWorkerInvoice } from "@/lib/worker-invoice-pdf";
import { deliverWorkerPurchase,PrepareError,supplierMatches,verifyWorkerPurchase,workerInvoiceTag,workerPurchaseBody,type WorkerBooking } from "@/lib/worker-holded-delivery";

/**
 * Goedgekeurde portaalfacturen (weekfactuur of factuur zonder uren) gaan als
 * CONCEPT naar Holded, met het Holded-project van de werf en de rekening en
 * btw zoals jullie die voor deze werker met de hand boeken. Staat de factuur al
 * in Holded (zelfde nummer en NIF), dan wordt hij alleen gekoppeld.
 */
async function bookingFor(invoice:WorkerInvoice,projectId:string,contact:string,docs:HoldedDocument[]):Promise<WorkerBooking> {
  const [p]=await db.select({name:projects.name,holdedProjectId:projects.holdedProjectId}).from(projects).where(eq(projects.id,projectId));
  if(!p?.holdedProjectId)throw new PrepareError(`Project "${p?.name??invoice.projectName}" is nog niet gekoppeld aan een Holded-project. Koppel het op de projectpagina; daarna gaat de factuur vanzelf.`);
  const taxes=(await holded.request<HoldedTax[]>("/invoicing/v1/taxes")).filter(t=>t.scope==="purchases"&&t.status!==false&&(t.group==="iva"||t.group==="retention"));
  const history:HistoryLine[]=docs.flatMap(d=>(d.products??[]).map(l=>({contact:d.contact??null,date:d.date??0,name:l.name,desc:l.desc,units:l.units,price:l.price,account:l.account,taxes:l.taxes})));
  const exempt=invoice.vatRate===0;
  const main=suggestBooking({history,contactId:contact,kind:"labor",vatRate:invoice.vatRate,vatExempt:exempt,retentionPct:invoice.withholdingRate||null,taxes});
  const extra=suggestBooking({history,contactId:contact,kind:"material",vatRate:21,vatExempt:false,retentionPct:null,taxes});
  if(!main.account||!extra.account)throw new PrepareError("Geen grootboekrekening te bepalen voor deze werker. Boek één factuur met de hand in Holded; daarna leert het systeem de rekening.");
  // De IRPF-sleutel moet er zijn als de factuur hem noemt; anders klopt het totaal niet.
  if(invoice.withholdingRate&&!main.retention)throw new PrepareError(`Geen IRPF-sleutel van ${invoice.withholdingRate}% gevonden in Holded.`);
  return {projectId:p.holdedProjectId,main:{account:main.account,vat:main.vat,retention:main.retention},extraAccount:extra.account};
}

type Source={id:string;invoice:WorkerInvoice;projectId:string;poId:string;status:string;attemptAt:Date;days:WeekDay[];reviewStatus:string};

async function deliver(src:Source,knownHoldedId:string|null,setStatus:(status:string,error:string|null)=>Promise<void>,claimPosting:()=>Promise<boolean>) {
  const invoice=src.invoice;
  let docs:HoldedDocument[]|null=null;
  const allDocs=async()=>docs??=await holdedListAll(page=>holded.documents.list("purchase",{page}),20);
  const result=await deliverWorkerPurchase({
    find:async()=>{
      const all=await allDocs();
      const tag=workerInvoiceTag(src.id);
      const tagged=all.filter(d=>d.tags?.includes(tag)||String(d.notes??"").includes(tag));
      if(tagged.length>1)throw Error("Multiple matching documents");
      if(tagged[0])return tagged[0].id;
      // Met de hand geboekt (zoals Abdelmjid 23)? Dan koppelen, nooit een tweede.
      // Match op nummer én NIF, nooit op het nummer alleen.
      const matches=[];
      for(const d of all.filter(d=>d.docNumber===invoice.number&&d.contact)){
        if(supplierMatches(await holded.contacts.get(d.contact!),invoice))matches.push(d);
      }
      if(matches.length>1)throw Error("Multiple supplier invoices");
      if(matches[0]){verifyWorkerPurchase(matches[0],invoice);return matches[0].id;}
      return null;
    },
    prepare:async()=>{
      const contacts=await holdedListAll(page=>holded.contacts.list({page}),30);const matches=contacts.filter(c=>supplierMatches(c,invoice));
      if(matches.length>1)throw Error("Multiple supplier tax identities");
      let contact=matches[0]?.id;
      if(!contact){const result=await holded.contacts.create({name:invoice.legalName,code:invoice.taxId,type:"supplier",...(invoice.email?{email:invoice.email}:{}),iban:invoice.iban,billAddress:{address:invoice.address}});if(!result.id)throw Error("No supplier ID");contact=result.id;}
      const booking=await bookingFor(invoice,src.projectId,contact,await allDocs());
      return workerPurchaseBody(src.id,invoice,contact,booking);
    },
    posting:async()=>{if(!await claimPosting())throw Error("Sync claim expired");},
    create:async body=>{const result=await holded.documents.create("purchase",body);if(!result.id)throw Error("No document ID");return result.id;},
    remember:async remoteId=>{await db.update(purchaseOrders).set({holdedId:remoteId,updatedAt:new Date()}).where(eq(purchaseOrders.id,src.poId));},
    verify:async remoteId=>{verifyWorkerPurchase(await holded.documents.get("purchase",remoteId),invoice);},
  },knownHoldedId,["posting","unknown"].includes(src.status));
  await setStatus(result.status,result.error);
  if(result.status==="sent")await attachInvoicePdf(src);
}

/**
 * De factuur-PDF als bijlage in Holded — alleen als er nog geen bijlage hangt,
 * zodat een met de hand geboekte factuur (met zijn eigen PDF) geen tweede krijgt.
 * Mislukt dit, dan staat de factuur er wel; de PDF kan er dan met de hand bij.
 */
async function attachInvoicePdf(src:Source) {
  try{
    const [po]=await db.select({holdedId:purchaseOrders.holdedId}).from(purchaseOrders).where(eq(purchaseOrders.id,src.poId));
    if(!po?.holdedId||(await holded.documents.attachments("purchase",po.holdedId)).length)return;
    const pdf=await renderWorkerInvoice(src.invoice,src.days,src.reviewStatus);
    await holded.documents.attach("purchase",po.holdedId,pdf,`Factura-${src.invoice.number.replace(/[^\p{L}\p{N}._-]/gu,"-")}.pdf`);
  }catch(e){console.warn("[worker-invoice] pdf-niet-bijgevoegd",{id:src.id,error:e instanceof Error?e.message:String(e)});}
}

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
  const mine=and(eq(sheets.id,id),eq(sheets.holdedSyncAttemptAt,attemptAt));
  await deliver({id,invoice,projectId:claimed.projectId,poId,status:claimed.holdedSyncStatus!,attemptAt,days:claimed.days,reviewStatus:claimed.invoiceStatus!},po.holdedId,
    async(status,error)=>{await db.update(sheets).set({holdedSyncStatus:status,holdedSyncError:error}).where(mine);},
    async()=>(await db.update(sheets).set({holdedSyncStatus:"posting"}).where(mine).returning({id:sheets.id})).length>0);
}

/** Factuur zonder uren — zelfde route als een weekfactuur. */
export async function syncLumpInvoice(id:string) {
  if(process.env.CRM_EXTERNAL_EFFECTS==="disabled")return;
  const attemptAt=new Date();
  const cutoff=new Date(attemptAt.getTime()-5*60_000);
  const claimed=await db.transaction(async tx=>{
    const [l]=await tx.select().from(lumps).where(and(eq(lumps.id,id),eq(lumps.status,"approved"),isNotNull(lumps.purchaseOrderId))).for("update");
    if(!l||!l.holdedSyncStatus||l.holdedSyncStatus==="sent")return null;
    if(l.holdedSyncStatus!=="pending"&&l.holdedSyncAttemptAt&&l.holdedSyncAttemptAt>cutoff)return null;
    await tx.update(lumps).set({holdedSyncStatus:["posting","unknown"].includes(l.holdedSyncStatus)?"posting":"processing",holdedSyncAttemptAt:attemptAt}).where(eq(lumps.id,id));
    return l;
  });
  if(!claimed?.purchaseOrderId)return;
  const poId=claimed.purchaseOrderId;
  const [po]=await db.select().from(purchaseOrders).where(eq(purchaseOrders.id,poId));
  if(!po||po.projectId!==claimed.projectId||po.reference!==claimed.invoice.number){await db.update(lumps).set({holdedSyncStatus:"error",holdedSyncError:"Inkoopfactuur en losse factuur sluiten niet aan."}).where(eq(lumps.id,id));return;}
  const mine=and(eq(lumps.id,id),eq(lumps.holdedSyncAttemptAt,attemptAt));
  await deliver({id,invoice:claimed.invoice,projectId:claimed.projectId,poId,status:claimed.holdedSyncStatus!,attemptAt,days:[],reviewStatus:claimed.status},po.holdedId,
    async(status,error)=>{await db.update(lumps).set({holdedSyncStatus:status,holdedSyncError:error}).where(mine);},
    async()=>(await db.update(lumps).set({holdedSyncStatus:"posting"}).where(mine).returning({id:lumps.id})).length>0);
}

export async function syncPendingWorkerInvoices() {
  if(process.env.CRM_EXTERNAL_EFFECTS==="disabled")return {processed:0};
  const retry=new Date(Date.now()-5*60_000);
  const open=["pending","error","processing","posting","unknown"];
  const rows=await db.select({id:sheets.id}).from(sheets).where(and(eq(sheets.invoiceStatus,"approved"),inArray(sheets.holdedSyncStatus,open),or(isNull(sheets.holdedSyncAttemptAt),lt(sheets.holdedSyncAttemptAt,retry)))).limit(5);
  for(const row of rows)await syncWorkerInvoice(row.id);
  const lumpRows=await db.select({id:lumps.id}).from(lumps).where(and(eq(lumps.status,"approved"),inArray(lumps.holdedSyncStatus,open),or(isNull(lumps.holdedSyncAttemptAt),lt(lumps.holdedSyncAttemptAt,retry)))).limit(5);
  for(const row of lumpRows)await syncLumpInvoice(row.id);
  return {processed:rows.length+lumpRows.length};
}
