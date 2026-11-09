import { invoiceAmounts, supplierInvoiceSchema, type WorkerInvoice } from "./worker-week";
import type { HoldedDocument, HoldedContact } from "./holded/types";
export const workerInvoiceTag=(id:string)=>`crm-worker-${id}`;
const normal=(s:string|undefined)=>s?.replace(/[^a-z0-9]/gi,"").toUpperCase()??"";
export function workerPurchaseBody(id:string,invoice:WorkerInvoice,contact:string) {
  supplierInvoiceSchema.parse(invoice);
  const amounts=invoiceAmounts(invoice.hours,invoice.rate,invoice.vatRate,invoice.withholdingRate);
  if(!Number.isFinite(invoice.hours)||invoice.hours<=0||!Number.isFinite(invoice.rate)||invoice.rate<=0||Object.entries(amounts).some(([key,value])=>Math.abs(value-invoice[key as keyof typeof amounts])>.001))throw Error("Factuurbedragen sluiten niet aan.");
  return {contact,docNumber:invoice.number,date:Math.floor(Date.parse(invoice.date)/1000),currency:"eur",draft:false,
    desc:`${invoice.projectName} · ${invoice.weekStart}`,tags:[workerInvoiceTag(id)],
    notes:`${workerInvoiceTag(id)}\nLeverancier: ${invoice.legalName} · NIF/CIF: ${invoice.taxId}\n${invoice.address}\n${invoice.email}\nIBAN: ${invoice.iban||"—"}\nProject: ${invoice.projectName}\n${invoice.taxNote}`,
    products:[{name:`Trabajo · ${invoice.projectName}`,desc:`Semana ${invoice.weekStart} · ${invoice.hours} horas`,units:invoice.hours,price:invoice.rate,taxes:[`p_iva_${invoice.vatRate}`,...(invoice.withholdingRate?[`p_ret_${invoice.withholdingRate}`]:[])]}],
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
  } catch {
    return {status:posted?"unknown":"error",error:posted?"Verzending moet worden gecontroleerd in Holded; er wordt niet opnieuw geboekt.":"Holded niet bereikbaar of gegevens niet passend. Automatisch opnieuw proberen."};
  }
}
