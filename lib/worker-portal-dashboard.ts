import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets as sheets } from "@/lib/db/schema";
import { addDays, mondayOf, type WorkerInvoice } from "@/lib/worker-week";

export type SupplierDetails = Pick<WorkerInvoice, "legalName" | "taxId" | "address" | "email" | "iban">;
export type PortalView = "overview" | "week" | "invoices" | "invoice";
export type PortalQuery = Record<string, string | string[] | undefined>;
export const portalValue = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
export function portalView(query: PortalQuery): PortalView {
  const view=portalValue(query.view);
  return view==="week" || view==="invoices" || view==="invoice" ? view : view==="overview" ? "overview" : "week";
}
function validWeek(value:string|undefined): value is string {
  if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
}

/** Caller supplies the worker and project from the verified bearer link, never query parameters. */
export async function loadWorkerDashboard(workerId:string,projectId:string,today:string,query:PortalQuery) {
  const scope=and(eq(sheets.workerId,workerId),eq(sheets.projectId,projectId));
  const view=portalView(query),current=today,earliest=addDays(mondayOf(today),-56);
  // A daily visit resumes the saved draft for this project, even across Mondays.
  const [editable]=await db.select({weekStart:sheets.weekStart}).from(sheets).where(and(scope,inArray(sheets.status,["draft","returned"]),gte(sheets.weekStart,earliest),lte(sheets.weekStart,today))).orderBy(desc(sheets.updatedAt)).limit(1);
  const candidate=portalValue(query.week),requested=validWeek(candidate)?candidate:editable?.weekStart??current;
  const invoiceId=portalValue(query.invoice);
  const invoiceValid=invoiceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId);
  const [[counts],selectedRows,invoiceRows,profileRows,recentStates]=await Promise.all([
    db.select({total:sql<number>`count(*)::int`,drafts:sql<number>`count(*) filter (where ${sheets.status}='draft')::int`,pending:sql<number>`count(*) filter (where ${sheets.status}='submitted')::int`,returned:sql<number>`count(*) filter (where ${sheets.status}='returned')::int`,invoices:sql<number>`count(*) filter (where ${sheets.invoice} is not null)::int`}).from(sheets).where(scope),
    db.select().from(sheets).where(and(scope,eq(sheets.weekStart,requested))).limit(1),
    view==="invoice" && invoiceValid ? db.select().from(sheets).where(and(scope,eq(sheets.id,invoiceId),isNotNull(sheets.invoice))).limit(1) : Promise.resolve([]),
    // Reuse only this worker's supplier identity, never another project's hours,
    // invoice number or tax choices. Last submitted profile wins, not last reviewed.
    db.select({legalName:sql<string>`${sheets.invoice}->>'legalName'`,taxId:sql<string>`${sheets.invoice}->>'taxId'`,address:sql<string>`${sheets.invoice}->>'address'`,email:sql<string>`${sheets.invoice}->>'email'`,iban:sql<string>`${sheets.invoice}->>'iban'`}).from(sheets).where(and(eq(sheets.workerId,workerId),isNotNull(sheets.invoice))).orderBy(desc(sql`coalesce((select max(event->>'at') from jsonb_array_elements(${sheets.history}) event where event->>'action'='invoice_submitted'),${sheets.createdAt}::text)`),desc(sheets.createdAt)).limit(1),
    db.select({weekStart:sheets.weekStart,status:sheets.status}).from(sheets).where(and(scope,sql`${sheets.weekStart} >= ${earliest}`)).orderBy(desc(sheets.weekStart)),
  ]);
  const [lastTeam]=await db.select({days:sheets.days,roster:sheets.roster}).from(sheets).where(scope).orderBy(desc(sheets.weekStart)).limit(1);
  const count=view==="invoices"?counts.invoices:counts.total;
  const pageSize=20,pages=Math.max(1,Math.ceil(count/pageSize));
  const rawPage=Number(portalValue(query.page));
  const page=Number.isSafeInteger(rawPage)?Math.min(pages,Math.max(1,rawPage)):1;
  const rows=await db.select({id:sheets.id,weekStart:sheets.weekStart,status:sheets.status,days:sheets.days,invoiceStatus:sheets.invoiceStatus,number:sql<string|null>`${sheets.invoice}->>'number'`,date:sql<string|null>`${sheets.invoice}->>'date'`,amount:sql<string|null>`${sheets.invoice}->>'total'`}).from(sheets).where(and(scope,view==="invoices"?isNotNull(sheets.invoice):undefined)).orderBy(desc(sheets.weekStart),desc(sheets.id)).limit(view==="overview"?5:pageSize).offset(view==="overview"?0:(page-1)*pageSize);
  // Older saved weeks remain readable; arbitrary old empty weeks cannot be created.
  const selected=requested>=earliest && requested<=today || selectedRows.length?requested:current;
  const sheet=selectedRows[0];
  const selectedSheet=selected===requested?sheet:(await db.select().from(sheets).where(and(scope,eq(sheets.weekStart,current))).limit(1))[0];
  return {lastTeam,view,current,earliest,recentStates,selected,sheet:selectedSheet,invoiceSheet:invoiceRows[0],profile:profileRows[0] as SupplierDetails|undefined,counts,rows,page,pages};
}
