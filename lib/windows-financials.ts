export type WindowsDealer = {id:string;companyName:string|null;email:string;status:string;accountId:string;contactId:string|null;contactName:string|null;lastSeenAt:string|null};
export type WindowsOrder = {id:string;number:string;dealerId:string|null;status:string;createdAt:string;customer:string;project:string;m2:number;elements:number;
  factory:number;factoryFinal:boolean;cost:number;dealerPrice:number;profit:number;markupPct:number|null;plannedDelivery:string|null;invoiced:number;paid:number;open:number};
export type WindowsQuote = {id:string;number:string;version:number;dealerId:string|null;status:string;createdAt:string;customer:string;project:string;dealerPrice:number;elements:number;m2:number};
export type WindowsInvoice = {id:string;number:string;orderId:string;orderNumber:string;dealerId:string|null;kind:string;issuedAt:string;dueAt:string;crmDocumentId:string|null;
  net:number;gross:number;paidNet:number;paidGross:number;openGross:number;cancelled:boolean};
export type WindowsData = {dealers:WindowsDealer[];orders:WindowsOrder[];quoteRows:WindowsQuote[];invoices:WindowsInvoice[]};

const cents=(v:number)=>Math.round(v*100)/100;
/** Windows is the source, including its payment status. CRM mirrors are links, never extra amounts. */
export function invoiceAmounts(i:{netCents:number;grossCents:number;status:string}) {
  const cancelled=i.status==="cancelled";
  const net=i.netCents/100,gross=i.grossCents/100;
  const paid=i.status==="paid";
  return {net,gross,cancelled,paidGross:paid?gross:0,paidNet:paid?net:0,openGross:cancelled||paid?0:gross};
}

export function latestWindowsQuotes(rows:WindowsQuote[]) {
  const latest=new Map<string,WindowsQuote>();
  for(const q of rows) {
    const key=`${q.dealerId??"own"}:${q.number}`;
    if(!latest.has(key)||latest.get(key)!.version<q.version) latest.set(key,q);
  }
  return [...latest.values()];
}
export function summarizeWindows(data:WindowsData) {
  const live=data.orders.filter(o=>o.status!=="cancelled");
  const invoices=data.invoices.filter(i=>!i.cancelled);
  const quotes=latestWindowsQuotes(data.quoteRows);
  const openQuotes=quotes.filter(q=>["draft","sent"].includes(q.status));
  const sum=<T,>(rows:T[],f:(r:T)=>number)=>cents(rows.reduce((s,r)=>s+f(r),0));
  const cost=sum(live,o=>o.cost),dealer=sum(live,o=>o.dealerPrice);
  return {totals:{orders:live.length,active:live.filter(o=>o.status!=="delivered").length,delivered:live.filter(o=>o.status==="delivered").length,
    elements:sum(live,o=>o.elements),m2:sum(live,o=>o.m2),cost,dealer,profit:cents(dealer-cost),markupPct:cost>0?(dealer-cost)/cost:null,
    invoiced:sum(invoices,i=>i.net),paid:sum(invoices,i=>i.paidNet),invoicedGross:sum(invoices,i=>i.gross),paidGross:sum(invoices,i=>i.paidGross),open:sum(invoices,i=>i.openGross)},
    quotes:{open:openQuotes.length,openValue:sum(openQuotes,q=>q.dealerPrice),accepted:quotes.filter(q=>q.status==="accepted").length}};
}

export function filterWindowsDealer<T extends WindowsData>(data:T,dealerId:string):T {
  if(!dealerId) return data;
  const match=(id:string|null)=>dealerId==="own"?id===null:id===dealerId;
  return {...data,dealers:data.dealers.filter(d=>match(d.id)),orders:data.orders.filter(o=>match(o.dealerId)),quoteRows:data.quoteRows.filter(q=>match(q.dealerId)),invoices:data.invoices.filter(i=>match(i.dealerId))};
}

export const WINDOWS_STATUS:Record<string,string>={received:"Binnengekomen",forwarded:"Naar fabriek",factory_review:"Bij fabriek",final_quote:"Definitieve offerte",confirmed:"Bevestigd",production:"In productie",shipped:"Verzonden",delivered:"Geleverd",cancelled:"Geannuleerd",draft:"Concept",sent:"Verstuurd",accepted:"Geaccepteerd",rejected:"Afgewezen",expired:"Verlopen"};
export const windowsStatusLabel=(status:string)=>WINDOWS_STATUS[status]??status;
export const windowsPortalHref=(path:string)=>`/kozijnen/portaal?next=${encodeURIComponent(path)}`;
