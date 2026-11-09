import "server-only";
import { createHash } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activities, documents } from "@/lib/db/schema";
import { insertNumberedDocumentInTransaction } from "@/lib/doc-number";
import { planReturnFee } from "@/lib/return-fee";

export function returnFeeVersion(invoice: {id:string;updatedAt:Date}, credits: {id:string;updatedAt:Date}[]) {
  return createHash("sha256").update(JSON.stringify([invoice.id,invoice.updatedAt,credits.map(c=>[c.id,c.updatedAt])])).digest("hex");
}
type Result = {error:string;id?:never;creditId?:never;projectId?:never} | {id:string;creditId?:string;projectId:string|null;error?:never};
export async function prepareReturnFee(invoiceId:string, expectedVersion:string):Promise<Result> {
  const actor=await requireModule("verkoop");
  if(!z.string().uuid().safeParse(invoiceId).success || !/^[a-f0-9]{64}$/.test(expectedVersion))return {error:"Ongeldige aanvraag."} as const;
  return db.transaction(async tx=>{
    // Match the global numbering lock order before locking document rows.
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const year=Number(today.slice(0,4));
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`FAC-${year}-`}))`);
    const related=await tx.select().from(documents).where(or(eq(documents.id,invoiceId),eq(documents.sourceDocumentId,invoiceId))).orderBy(documents.id).for("update");
    const invoice=related.find(d=>d.id===invoiceId);
    if(!invoice || invoice.kind!=="invoice" || ["void","rejected"].includes(invoice.status))return {error:"Deze factuur kan niet worden omgezet."} as const;
    const existing=related.find(d=>d.kind==="invoice"&&d.id!==invoiceId&&d.status!=="void");
    if(existing)return {id:existing.id,projectId:invoice.projectId} as const;
    const credits=related.filter(d=>d.kind==="creditnote"&&!["void","rejected"].includes(d.status));
    const credit=credits[0];
    if(credits.length!==1 || credit.status!=="draft" || credit.sentAt || credit.holdedId || credit.isExternal || credit.stockAppliedAt || credit.lockedAt || Number(credit.paidEur)!==0 || invoice.isExternal || invoice.lockedAt || Number(invoice.paidEur)!==0 || invoice.isAdvance || invoice.vatReverseCharge!==credit.vatReverseCharge)return {error:"Gebruik één onbewerkte conceptcreditnota en een factuur zonder betalingen of verrekeningen."} as const;
    if(credit.contactId!==invoice.contactId || credit.companyId!==invoice.companyId || credit.projectId!==invoice.projectId || credit.currency!==invoice.currency)return {error:"Factuur en creditnota horen niet bij dezelfde klant, valuta en klus."} as const;
    if(returnFeeVersion(invoice,credits)!==expectedVersion)return {error:"De factuur of creditnota is gewijzigd. Vernieuw de pagina en controleer het bedrag opnieuw."} as const;
    const plan=planReturnFee(invoice,credit);
    if(!plan)return {error:"De creditnota moet alle originele regels bevatten, plus een negatieve vergoedingsregel zonder productkoppeling."} as const;
    const number=invoice.docNumber??"factuur";
    const result=await insertNumberedDocumentInTransaction(tx,"invoice",{
      kind:"invoice",status:"draft",sourceDocumentId:invoice.id,title:`Eindfactuur vergoeding — ${number}`,
      contactId:invoice.contactId,companyId:invoice.companyId,projectId:invoice.projectId,dealId:invoice.dealId,propertyId:invoice.propertyId,
      issueDate:today,dueDate:invoice.dueDate && invoice.dueDate>=today?invoice.dueDate:null,currency:invoice.currency,vatReverseCharge:invoice.vatReverseCharge,
      items:plan.items,subtotalEur:plan.totals.subtotal.toFixed(2),taxEur:plan.totals.tax.toFixed(2),totalEur:plan.totals.total.toFixed(2),
      notes:`Vergoeding bij volledige retour van de goederen op ${number}. De goederen worden volledig gecrediteerd via ${credit.docNumber??"de gekoppelde creditnota"}. Deze factuur bevat geen levering van producten.`,
    },year);
    await tx.update(documents).set({items:plan.creditItems,subtotalEur:plan.fullCredit.subtotal.toFixed(2),taxEur:plan.fullCredit.tax.toFixed(2),totalEur:plan.fullCredit.total.toFixed(2),updatedAt:new Date(),notes:[credit.notes,`Volledige retour bij ${number}. De vergoeding staat afzonderlijk op ${result.docNumber}.`].filter(Boolean).join("\n\n")}).where(and(eq(documents.id,credit.id),eq(documents.status,"draft")));
    await tx.insert(activities).values({type:"note",documentId:invoice.id,contactId:invoice.contactId,authorId:actor.id,subject:`Eindfactuur vergoeding aangemaakt — ${result.docNumber}`,body:JSON.stringify({invoice:invoice.docNumber,credit:credit.docNumber,creditBefore:{items:credit.items,subtotal:credit.subtotalEur,tax:credit.taxEur,total:credit.totalEur},creditAfter:plan.fullCredit,fee:plan.totals,invoiceId:result.id,note:"Concepten; niet verstuurd. Geen voorraadmutatie: creditnota boekt bij verwerking alleen eerder afgeboekte goederen terug; eindfactuur heeft geen producten."})});
    return {...result,creditId:credit.id,projectId:invoice.projectId} as const;
  });
}
