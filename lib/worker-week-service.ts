import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets as sheets, workers, timeEntries, purchaseOrders, users, staffNotifications } from "@/lib/db/schema";
import { totalWeekHours, invoiceAmounts, invoiceKey, type WeekDay, type WorkerInvoice, type SupplierInvoiceInput, type WeekLang, type WeekEvent } from "@/lib/worker-week";
import { COMPANY } from "@/lib/company";
import { NICK_FREDERIQUE } from "@/lib/mail-bcc";
import { magModule, heeftCap } from "@/lib/auth/modules";
import { workerRate } from "@/lib/worker-rate";

type Worker=typeof workers.$inferSelect;
export class WeekConflict extends Error {}
const conflict=(message="conflict"):never=>{throw new WeekConflict(message);};
const history=(old:WeekEvent[],event:Omit<WeekEvent,"at">):WeekEvent[]=>[...old,{...event,at:new Date().toISOString()}];

export async function saveWeek(args:{worker:Worker;projectId:string;monday:string;version:number;days:WeekDay[];roster?:string[];submit:boolean}) {
  return db.transaction(async tx=>{
    // Serialise all writes for this worker, including stale browser tabs.
    await tx.select({id:workers.id}).from(workers).where(eq(workers.id,args.worker.id)).for("update");
    const [old]=await tx.select().from(sheets).where(and(eq(sheets.workerId,args.worker.id),eq(sheets.projectId,args.projectId),eq(sheets.weekStart,args.monday))).for("update");
    if(old && (old.version!==args.version || !["draft","returned"].includes(old.status)))conflict();
    if(!old && args.version!==0)conflict();
    const paymentMethod=args.worker.portalInvoiceEnabled?"invoice":args.worker.defaultPaymentMethod;
    const rate=workerRate(args.worker,paymentMethod)??0;
    const version=(old?.version??0)+1;
    const values={days:args.days,...(args.roster?{roster:args.roster}:{}),status:args.submit?"submitted":"draft",version,hourlyRate:String(rate),paymentMethod,
      submittedAt:args.submit?new Date():null,reviewNote:old?.reviewNote??null,
      history:history(old?.history??[],{action:args.submit?"submitted":"draft_saved",actor:args.worker.name,version,...(args.submit?{days:args.days}:{})}),updatedAt:new Date()};
    const [saved] = old
      ? await tx.update(sheets).set(values).where(eq(sheets.id,old.id)).returning({id:sheets.id})
      : await tx.insert(sheets).values({...values,workerId:args.worker.id,projectId:args.projectId,weekStart:args.monday}).returning({id:sheets.id});
    const notificationIds:string[]=[];
    // Persist the submission and its notification together. Drafts never notify.
    // Local/preview verification with external effects disabled must not leave
    // live mail jobs for the production cron to pick up from the shared DB.
    if(args.submit && process.env.CRM_EXTERNAL_EFFECTS!=="disabled") {
      const recipients=await tx.select({id:users.id,role:users.role}).from(users).where(sql`lower(${users.email}) = ${NICK_FREDERIQUE[0]}`);
      for(const recipient of recipients) {
        if(!magModule(recipient.role,"projects") || !heeftCap(recipient.role,"schrijven"))continue;
        const notices=await tx.insert(staffNotifications).values({eventKey:`worker-week:${saved.id}:${version}:${recipient.id}`,kind:"worker_week_submitted",entityId:saved.id,userId:recipient.id}).onConflictDoNothing().returning({id:staffNotifications.id});
        notificationIds.push(...notices.map(n=>n.id));
      }
    }
    return {notificationIds,version,id:saved.id};
  });
}

export async function reviewWeek(args:{id:string;projectId:string;version:number;userId:string;approve:boolean;reason:string}) {
  return db.transaction(async tx=>{
    // Serialize approvals for overlapping periods of the same worker.
    const [target]=await tx.select({workerId:sheets.workerId}).from(sheets).where(and(eq(sheets.id,args.id),eq(sheets.projectId,args.projectId)));
    if(!target)conflict();
    await tx.select({id:workers.id}).from(workers).where(eq(workers.id,target.workerId)).for("update");
    const [sheet]=await tx.select().from(sheets).where(and(eq(sheets.id,args.id),eq(sheets.projectId,args.projectId))).for("update");
    if(!sheet || sheet.version!==args.version || sheet.status!=="submitted")conflict("Deze weekstaat is al gewijzigd of beoordeeld. Vernieuw de pagina.");
    if(args.approve) {
      // Existing daily/manual hours must be reconciled explicitly, never double-booked.
      const overlap=await tx.select({id:timeEntries.id}).from(timeEntries).where(and(eq(timeEntries.workerId,sheet.workerId),eq(timeEntries.projectId,sheet.projectId),inArray(timeEntries.date,sheet.days.filter(d=>d.state==="work").map(d=>d.date)))).limit(1);
      if(overlap.length)conflict("Er staan al uren voor deze arbeider op een van deze werkdagen op dit project. Controleer en verwerk die eerst om dubbel boeken te voorkomen.");
      const rows=sheet.days.flatMap(d=>d.state==="work"?d.crews.map(c=>({weekSheetId:sheet.id,projectId:sheet.projectId,workerId:sheet.workerId,workerName:c.names,date:d.date,hours:(c.people*c.hours).toFixed(2),hourlyCostEur:sheet.hourlyRate,paymentMethod:sheet.paymentMethod,selfLoggedAt:sheet.submittedAt,approvedAt:new Date(),note:`${c.people} × ${c.hours} u${c.zone?` · ${c.zone}`:""}\n${c.description}`})):[]);
      if(!rows.length)conflict("Weekstaat bevat geen uren.");
      await tx.insert(timeEntries).values(rows);
    }
    // Week terug = factuur ook terug: de uren veranderen, dus het bedrag ook.
    const invoiceBack=!args.approve && sheet.invoiceStatus==="submitted"?{invoiceStatus:"returned" as const,invoiceReviewNote:args.reason||null}:{};
    await tx.update(sheets).set({...invoiceBack,status:args.approve?"approved":"returned",version:sheet.version+1,reviewedAt:new Date(),reviewedBy:args.userId,reviewNote:args.reason||null,history:history(sheet.history,{action:args.approve?"approved":"returned",actor:args.userId,version:sheet.version,reason:args.reason}),updatedAt:new Date()}).where(eq(sheets.id,sheet.id));
  });
}

export async function submitWeekInvoice(args:{id:string;worker:Worker;projectId:string;projectName:string;version:number;input:SupplierInvoiceInput;language:WeekLang}) {
  return db.transaction(async tx=>{
    const [currentWorker]=await tx.select().from(workers).where(eq(workers.id,args.worker.id)).for("update");
    if(!currentWorker?.portalInvoiceEnabled)conflict("invoiceDisabled");
    const [sheet]=await tx.select().from(sheets).where(and(eq(sheets.id,args.id),eq(sheets.workerId,args.worker.id),eq(sheets.projectId,args.projectId))).for("update");
    // Factuur gaat mee met het indienen van de week (of later, na goedkeuring).
    if(!sheet || sheet.version!==args.version || !["submitted","approved"].includes(sheet.status) || (sheet.invoiceStatus && sheet.invoiceStatus!=="returned") || sheet.purchaseOrderId)conflict();
    const key=invoiceKey(args.input.taxId,args.input.number);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const duplicate=await tx.select({id:sheets.id}).from(sheets).where(eq(sheets.invoiceKey,key));
    if(duplicate.some(d=>d.id!==sheet.id))conflict("duplicateInvoice");
    const existing=await tx.select({id:purchaseOrders.id}).from(purchaseOrders).where(and(eq(purchaseOrders.reference,args.input.number),sql`lower(trim(${purchaseOrders.supplier})) = ${args.input.legalName.toLowerCase()}`)).limit(1);
    if(existing.length)conflict("duplicateInvoice");
    const hours=totalWeekHours(sheet.days),rate=Number(sheet.hourlyRate);
    if(rate<=0)conflict("rateMissing");
    const lastWork=sheet.days.filter(d=>d.state==="work").at(-1)!.date;
    if(args.input.date<lastWork)conflict("invoiceDate");
    const invoice:WorkerInvoice={...args.input,customer:{name:COMPANY.legalName,taxId:COMPANY.vatNumber,address:COMPANY.address},hours,rate,...invoiceAmounts(hours,rate,args.input.vatRate,args.input.withholdingRate),language:args.language,projectName:args.projectName,weekStart:sheet.weekStart};
    await tx.update(sheets).set({invoice,invoiceKey:key,invoiceStatus:"submitted",invoiceReviewNote:null,version:sheet.version+1,history:history(sheet.history,{action:"invoice_submitted",actor:args.worker.name,version:sheet.version,invoice}),updatedAt:new Date()}).where(eq(sheets.id,sheet.id));
  });
}

export async function reviewWeekInvoice(args:{id:string;projectId:string;version:number;userId:string;approve:boolean;reason:string}) {
  return db.transaction(async tx=>{
    const [sheet]=await tx.select().from(sheets).where(and(eq(sheets.id,args.id),eq(sheets.projectId,args.projectId))).for("update");
    if(!sheet || sheet.version!==args.version || sheet.status!=="approved" || sheet.invoiceStatus!=="submitted" || !sheet.invoice || sheet.purchaseOrderId)conflict("Deze factuur is al gewijzigd of beoordeeld. Vernieuw de pagina.");
    const inv=sheet.invoice!;let poId:string|null=null;
    if(args.approve) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sheet.invoiceKey!}, 0))`);
      const existing=await tx.select({id:purchaseOrders.id}).from(purchaseOrders).where(and(eq(purchaseOrders.reference,inv.number),sql`lower(trim(${purchaseOrders.supplier})) = ${inv.legalName.toLowerCase()}`)).limit(1);
      if(existing.length)conflict("Deze leverancier en dit factuurnummer staan al in Inkoop. Controleer de bestaande factuur.");
      const hours=await tx.select().from(timeEntries).where(eq(timeEntries.weekSheetId,sheet.id)).for("update");
      if(!hours.length || hours.some(h=>h.purchaseOrderId || !h.approvedAt) || Math.abs(hours.reduce((s,h)=>s+Number(h.hours)*Number(h.hourlyCostEur),0)-inv.subtotal)>.011)conflict("Uren en factuur sluiten niet meer aan. Controleer de weekstaat.");
      const [po]=await tx.insert(purchaseOrders).values({kind:"invoice",status:"received",supplier:inv.legalName,reference:inv.number,projectId:sheet.projectId,countAsLabor:true,currency:"EUR",orderDate:inv.date,subtotal:inv.subtotal.toFixed(2),tax:inv.vat.toFixed(2),total:inv.total.toFixed(2),notes:`Via urenportaal · periode ${sheet.weekStart} t/m ${sheet.days.at(-1)?.date??sheet.weekStart}\nLeverancier: ${inv.legalName}\nNIF/BTW: ${inv.taxId}\n${inv.address}\n${inv.email}\nIBAN: ${inv.iban || "—"}\nIVA ${inv.vatRate}%: € ${inv.vat.toFixed(2)}\nIRPF ${inv.withholdingRate}%: € ${inv.withholding.toFixed(2)}\n${inv.taxNote}\nUren reeds geboekt via weekstaat ${sheet.id}. Niet nogmaals als uren boeken.`}).returning({id:purchaseOrders.id});
      poId=po.id;
      await tx.update(timeEntries).set({purchaseOrderId:poId,paymentMethod:"invoice",updatedAt:new Date()}).where(eq(timeEntries.weekSheetId,sheet.id));
    }
    await tx.update(sheets).set({invoiceStatus:args.approve?"approved":"returned",purchaseOrderId:poId,holdedSyncStatus:args.approve?"pending":null,holdedSyncError:null,invoiceReviewNote:args.reason||null,version:sheet.version+1,history:history(sheet.history,{action:args.approve?"invoice_approved":"invoice_returned",actor:args.userId,version:sheet.version,reason:args.reason}),updatedAt:new Date()}).where(eq(sheets.id,sheet.id));
  });
}
