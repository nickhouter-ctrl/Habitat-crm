import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoiceAmounts, summarizeWindows, type WindowsDealer, type WindowsInvoice, type WindowsOrder, type WindowsQuote } from "@/lib/windows-financials";

const configured = cache(async () => (await db.execute(sql`select 1 from information_schema.tables where table_schema='windows' and table_name='orders' limit 1`)).length > 0);

/** Match by the existing account ID only; names and email addresses are not ownership keys. */
export const getWindowsDealers = cache(async (): Promise<WindowsDealer[]> => {
  if (!await configured()) return [];
  const rows = await db.execute<WindowsDealer>(sql`
    select d.id, d.company_name as "companyName", d.email, d.status,
      d.portal_account_id as "accountId", ca.contact_id as "contactId", c.name as "contactName",
      d.last_seen_at::text as "lastSeenAt"
    from windows.dealers d
    left join public.customer_accounts ca on ca.id::text=d.portal_account_id
    left join public.contacts c on c.id=ca.contact_id
    order by coalesce(d.company_name,d.email)`);
  return [...rows];
});

type Snapshot = { totals: { cost: number; dealer: number; sell: number; totalM2: number }; elements: unknown[]; customer?: { name?: string }; projectName?: string };
type OrderSql = { id:string; number:string; dealer_id:string|null; created_at:string; status:string; snapshot:Snapshot; planned_delivery:string|null;
  factory_final:{factoryPrice:number|null;dealerPrice:number|null;leadTimeDays:number|null}|null };
type QuoteSql = { id:string;number:string;dealer_id:string|null;version:number;status:string;created_at:string;snapshot:Snapshot };
type InvoiceSql = { id:string;number:string;order_id:string;dealer_id:string|null;order_number:string;status:string;kind:string;
  issued_at:string;due_at:string;net_cents:number;gross_cents:number;crm_document_id:string|null };

/** Live Windows data. Existing CRM invoices are linked, never copied or added to these totals. */
export const getWindowsReport = cache(async (contactId?: string) => {
  const dealers = (await getWindowsDealers()).filter(d => !contactId || d.contactId === contactId);
  const empty = { configured:await configured(), dealers, orders:[] as WindowsOrder[], quoteRows:[] as WindowsQuote[], invoices:[] as WindowsInvoice[],
    pricing:{importPct:0.4,handlingPct:0.15,habitatMarginPct:0.4} };
  if (!empty.configured || (contactId && !dealers.length)) return {...empty,...summarizeWindows(empty)};
  const dealerScope = contactId ? sql`d.id in (${sql.join(dealers.map(d => sql`${d.id}`),sql`,`)})` : sql`true`;
  const [settings, orderRows, quoteRows, invoiceRows] = await Promise.all([
    db.execute<{data:{habitatMarginPct?:number;pricing?:{importDutyPct?:number;handlingPct?:number}}}>(sql`select data from windows.settings where id='global' limit 1`),
    db.execute<OrderSql>(sql`select o.id,o.number,o.dealer_id,o.created_at::text,o.status,o.snapshot,o.factory_final,o.planned_delivery::text
      from windows.orders o left join windows.dealers d on d.id=o.dealer_id where ${dealerScope} order by o.created_at desc`),
    db.execute<QuoteSql>(sql`select q.id,q.number,q.dealer_id,q.version,q.status,q.created_at::text,q.snapshot
      from windows.quotes q left join windows.dealers d on d.id=q.dealer_id where ${dealerScope} order by q.created_at desc`),
    db.execute<InvoiceSql>(sql`select i.id,i.number,i.order_id,o.dealer_id,o.number as order_number,i.status,i.kind,
      i.issued_at::text,i.due_at::text,i.net_cents,i.gross_cents,doc.id as crm_document_id
      from windows.invoices i join windows.orders o on o.id=i.order_id
      left join windows.dealers d on d.id=o.dealer_id
      left join public.documents doc on doc.id=i.crm_document_id
      where i.issuer='habitat' and ${dealerScope} order by i.issued_at desc`),
  ]);
  const s=settings[0]?.data;
  const pricing={importPct:s?.pricing?.importDutyPct??0.4,handlingPct:s?.pricing?.handlingPct??0.15,habitatMarginPct:s?.habitatMarginPct??0.4};
  const uplift=1+pricing.importPct+pricing.handlingPct;
  const invoices:WindowsInvoice[]=invoiceRows.map(i => ({
    id:i.id,number:i.number,orderId:i.order_id,orderNumber:i.order_number,dealerId:i.dealer_id,
    kind:i.kind,issuedAt:i.issued_at,dueAt:i.due_at,crmDocumentId:i.crm_document_id,
    ...invoiceAmounts({netCents:i.net_cents,grossCents:i.gross_cents,status:i.status}),
  }));
  const orders:WindowsOrder[]=orderRows.map(o => {
    const t=o.snapshot.totals, ff=o.factory_final;
    const factoryFinal=ff?.factoryPrice!=null;
    const factory=factoryFinal?ff!.factoryPrice!:Math.round(t.cost/uplift);
    const cost=factoryFinal?Math.round(factory*uplift):t.cost;
    const dealerPrice=ff?.dealerPrice??t.dealer;
    const bills=invoices.filter(i=>i.orderId===o.id&&!i.cancelled);
    return {id:o.id,number:o.number,dealerId:o.dealer_id,status:o.status,createdAt:o.created_at,
      customer:o.snapshot.customer?.name??"",project:o.snapshot.projectName??"",m2:t.totalM2,elements:o.snapshot.elements.length,
      factory:factory/100,factoryFinal,cost:cost/100,dealerPrice:dealerPrice/100,profit:(dealerPrice-cost)/100,
      markupPct:cost>0?(dealerPrice-cost)/cost:null,plannedDelivery:o.planned_delivery,
      invoiced:bills.reduce((a,i)=>a+i.net,0),paid:bills.reduce((a,i)=>a+i.paidNet,0),open:bills.reduce((a,i)=>a+i.openGross,0)};
  });
  const quotes:WindowsQuote[]=quoteRows.map(q=>({id:q.id,number:q.number,version:q.version,dealerId:q.dealer_id,status:q.status,createdAt:q.created_at,
    customer:q.snapshot.customer?.name??"",project:q.snapshot.projectName??"",dealerPrice:q.snapshot.totals.dealer/100,
    elements:q.snapshot.elements.length,m2:q.snapshot.totals.totalM2}));
  const data={configured:true,dealers,orders,quoteRows:quotes,invoices,pricing};
  return {...data,...summarizeWindows(data)};
});

export type WindowsReport = Awaited<ReturnType<typeof getWindowsReport>>;
