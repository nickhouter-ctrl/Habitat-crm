import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet, normalizeDocItems } from "@/lib/documents";

type Input = { items: unknown; subtotalEur: string; taxEur: string; totalEur: string };
const cents = (n: number | string) => Math.round(Number(n) * 100);
const signature = (i: DocumentLineItem) => JSON.stringify([i.productId ?? "",i.name,i.description ?? "",i.unit ?? "",Number(i.units),Number(i.price),Number(i.discount ?? 0),Number(i.taxRate ?? 0),i.category ?? ""]);
function agrees(doc: Input) {
  const t=computeTotals(normalizeDocItems(doc.items));
  return [t.subtotal,t.tax,t.total].every((n,k)=>cents(n)===cents([doc.subtotalEur,doc.taxEur,doc.totalEur][k]));
}
/** Only a full return plus a retained monetary fee is eligible. Never infer returned quantities from money. */
export function planReturnFee(invoice: Input, credit: Input) {
  const original=normalizeDocItems(invoice.items),returned=normalizeDocItems(credit.items);
  const valid=(i:DocumentLineItem)=>[i.units,i.price,i.taxRate??0,i.discount??0].every(n=>Number.isFinite(Number(n))) && !i.advanceRef;
  if(!original.length || !original.some(i=>i.productId) || !original.every(i=>valid(i)&&i.units>0&&lineNet(i)>0) || !returned.every(valid) || !agrees(invoice) || !agrees(credit))return null;
  const goods=returned.filter(i=>lineNet(i)>=0),fees=returned.filter(i=>lineNet(i)<0);
  if(!fees.length || fees.some(i=>i.productId) || goods.map(signature).sort().join("\n")!==original.map(signature).sort().join("\n"))return null;
  // Financial-only lines deliberately carry no product/cost/advance reference.
  const items:DocumentLineItem[]=fees.map(i=>({name:"Vergoeding bij volledige retour",description:"Alle goederen retour; uitsluitend de overeengekomen vergoeding.",units:Math.abs(Number(i.units)),price:Math.abs(Number(i.price)),discount:i.discount,taxRate:i.taxRate,category:"overig"}));
  const totals=computeTotals(items),fullCredit=computeTotals(original);
  if(totals.total<=0 || !["subtotal","tax","total"].every((k,n)=>cents(totals[k as keyof typeof totals])===cents([invoice.subtotalEur,invoice.taxEur,invoice.totalEur][n])-cents([credit.subtotalEur,credit.taxEur,credit.totalEur][n])))return null;
  return {items,totals,fullCredit,creditItems:original};
}
