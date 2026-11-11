import { invoiceAmounts, supplierInvoiceSchema, type WorkerInvoice } from "./worker-week";
import type { HoldedDocument, HoldedContact } from "./holded/types";
export const workerInvoiceTag=(id:string)=>`crm-worker-${id}`;
const normal=(s:string|undefined)=>s?.replace(/[^a-z0-9]/gi,"").toUpperCase()??"";

/**
 * Hoe de factuur in Holded geboekt wordt — zoals jullie het met de hand doen:
 * het Holded-project van de werf, de grootboekrekening die voor deze werker
 * gebruikt wordt, en btw/IRPF. Materiaalregels krijgen hun eigen rekening.
 */
export type WorkerBooking={projectId:string;main:{account:string;vat:string;retention:string|null};extraAccount:string};

/** Uitzondering die vóór het posten optreedt en een duidelijke melding verdient. */
export class PrepareError extends Error {}

/** Losse factuur zonder uren: geen uren × tarief, maar één bedrag met een omschrijving. */
const isLump=(invoice:WorkerInvoice)=>!!invoice.concept;

export function workerPurchaseBody(id:string,invoice:WorkerInvoice,contact:string,booking?:WorkerBooking) {
  supplierInvoiceSchema.parse(invoice);
  const extras=isLump(invoice)?[]:invoice.extras??[];
  const laborUnits=isLump(invoice)?1:invoice.hours;
  const laborPrice=isLump(invoice)?Math.round((invoice.subtotal-extras.reduce((s,e)=>s+e.amount,0))*100)/100:invoice.rate;
  const amounts=invoiceAmounts(laborUnits,laborPrice,invoice.vatRate,invoice.withholdingRate,extras);
  if(!Number.isFinite(laborUnits)||laborUnits<=0||!Number.isFinite(laborPrice)||laborPrice<=0||Object.entries(amounts).some(([key,value])=>Math.abs(value-invoice[key as keyof typeof amounts])>.001))throw Error("Factuurbedragen sluiten niet aan.");
  const project=booking?{projectid:booking.projectId}:{};
  const main={
    name:isLump(invoice)?invoice.projectName:`Trabajo · ${invoice.projectName}`,
    desc:isLump(invoice)?invoice.concept!:`Periodo desde ${invoice.weekStart} · ${invoice.hours} horas`,
    // Aanmaken: `subtotal` is de stuksprijs ex btw, `tax` het btw-percentage (uitlezen heet het `price`).
    units:laborUnits,subtotal:laborPrice,tax:invoice.vatRate,
    taxes:booking?[booking.main.vat,...(booking.main.retention?[booking.main.retention]:[])]:[`p_iva_${invoice.vatRate}`,...(invoice.withholdingRate?[`p_ret_${invoice.withholdingRate}`]:[])],
    // v1 neemt de rekening alleen als `accountingAccountId` (getest 11-11); het project per regel
    // neemt v1 niet over — dat kan pas met een v2-sleutel (items[].project_id).
    ...(booking?{accountingAccountId:booking.main.account}:{}),...project,
  };
  // Zelf gekochte materialen: eigen btw, geen IRPF (die hoort bij de arbeid).
  const extraLines=extras.map(e=>({name:invoice.projectName,desc:e.description,units:1,subtotal:e.amount,tax:e.vatRate,taxes:[`p_iva_${e.vatRate}`],
    ...(booking?{accountingAccountId:booking.extraAccount}:{}),...project}));
  // Holded wil "contactId"; met "contact" weigert hij de factuur (400).
  // Bij aanmaken heet het nummer `invoiceNum` en de regels `items` (uitlezen: docNumber/products).
  // Een nieuw document is in Holded standaard een concept: daar nog goedkeuren (Nick, 11-11-2026).
  return {contactId:contact,invoiceNum:invoice.number,docNumber:invoice.number,date:Math.floor(Date.parse(invoice.date)/1000),currency:"eur",
    desc:`${invoice.projectName} · ${invoice.weekStart}`,tags:[workerInvoiceTag(id)],
    notes:`${workerInvoiceTag(id)}\nLeverancier: ${invoice.legalName} · NIF/CIF: ${invoice.taxId}\n${invoice.address}${invoice.email?`\n${invoice.email}`:""}\nIBAN: ${invoice.iban||"—"}${invoice.accountHolder?` · titular ${invoice.accountHolder}`:""}\nProject: ${invoice.projectName}\n${invoice.taxNote}`,
    items:[main,...extraLines],
  };
}
export function supplierMatches(contact:HoldedContact,invoice:WorkerInvoice) {return [contact.code,contact.vatnumber].some(v=>normal(v)===normal(invoice.taxId));}
export function verifyWorkerPurchase(remote:HoldedDocument,invoice:WorkerInvoice) {
  if(remote.docNumber!==invoice.number||!Number.isFinite(Number(remote.total))||!Number.isFinite(Number(remote.subtotal))||Math.abs(Number(remote.total)-invoice.total)>.011||Math.abs(Number(remote.subtotal)-invoice.subtotal)>.011)throw Error("Controle in Holded nodig: factuurnummer of bedragen wijken af.");
}
export type DeliveryIO={find:()=>Promise<string|null>;prepare:()=>Promise<Record<string,unknown>>;posting:()=>Promise<void>;create:(body:Record<string,unknown>)=>Promise<string>;remember:(id:string)=>Promise<void>;verify:(id:string)=>Promise<void>};
/** A lost POST response may only be reconciled, never blindly posted again. */
export async function deliverWorkerPurchase(io:DeliveryIO,knownId:string|null,uncertain:boolean) {
  let posted=uncertain;
  try {
    let id=knownId??await io.find();
    if(!id){
      if(uncertain)return {status:"unknown",error:"Uitkomst van verzending onzeker. Controleer Holded; er wordt geen tweede factuur aangemaakt."};
      const body=await io.prepare();await io.posting();posted=true;
      id=await io.create(body);if(!id)throw Error("Holded gaf geen documentnummer terug.");
    }
    await io.remember(id);await io.verify(id);
    return {status:"sent",error:null};
  } catch(e) {
    // Iets dat vóór het posten ontbreekt (project niet gekoppeld, geen rekening): zeg wat.
    if(!posted&&e instanceof PrepareError)return {status:"error",error:e.message};
    return {status:posted?"unknown":"error",error:posted?"Verzending moet worden gecontroleerd in Holded; er wordt niet opnieuw geboekt.":"Holded niet bereikbaar of gegevens niet passend. Automatisch opnieuw proberen."};
  }
}
