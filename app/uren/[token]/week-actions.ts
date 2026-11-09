"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workers } from "@/lib/db/schema";
import { weekRoster } from "@/lib/worker-week-grid";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { deliverStaffNotifications } from "@/lib/staff-notifications";
import { portalLinkForToken } from "@/lib/worker-portal";
import { rateLimit } from "@/lib/rate-limit";
import { madridToday, weekLang, validateWeek, supplierInvoiceSchema, type WeekDay } from "@/lib/worker-week";
import { weekError, weekT } from "@/lib/worker-week-i18n";
import { saveWeek, submitWeekInvoice, WeekConflict } from "@/lib/worker-week-service";

/** Wat de bouwer invulde meteen bij hem bewaren — ook als de rest nog niet
 *  klopt of indienen mislukt. Volgende keer staat het er gewoon weer. */
async function rememberInvoiceProfile(workerId:string,form:FormData) {
  const v=(k:string,max:number)=>String(form.get(k)??"").trim().slice(0,max);
  const profile={legalName:v("legalName",180),taxId:v("taxId",40),address:v("address",350),email:v("email",180),iban:v("iban",40),
    vatRate:v("vatRate",3),withholdingRate:v("withholdingRate",3),taxNote:v("taxNote",500),triedNumber:v("number",64)};
  if(!Object.values(profile).some(Boolean))return;
  try{await db.update(workers).set({invoiceProfile:profile,updatedAt:new Date()}).where(eq(workers.id,workerId));}
  catch{console.warn("[worker-week] invoice-profile-not-saved");}
}
/** Factuurvelden uit het formulier; null = ongeldig. */
function invoiceInput(form:FormData) {
  const raw=Object.fromEntries(form);
  const parsed=supplierInvoiceSchema.safeParse({...raw,vatRate:raw.vatRate===""?NaN:Number(raw.vatRate),withholdingRate:raw.withholdingRate===""?NaN:Number(raw.withholdingRate),confirmed:raw.invoiceConfirmed==="on"||raw.confirmed==="on"});
  return parsed.success?parsed.data:null;
}
export type WeekActionState={error?:string;ok?:string;savedAt?:number;version?:number;days?:WeekDay[]}|null;
export async function saveWeekAction(token:string,_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const ctx=await portalLinkForToken(token);const lang=weekLang(form.get("lang")??ctx?.worker.portalLang);
  if(!ctx || !await rateLimit(`worker-week:${ctx.link.id}`,60,3600,{strikt:true}))return {error:weekT(lang,"unavailable")};
  const monday=String(form.get("monday")??"");const version=Number(form.get("version"));const submit=form.get("intent")==="submit";
  if(!Number.isSafeInteger(version)||version<0)return {error:weekT(lang,"conflict")};
  let raw:unknown;try{const value=String(form.get("days")??"");if(value.length>150000)throw Error();raw=JSON.parse(value);}catch{return {error:weekT(lang,"fields")};}
  const result=validateWeek(raw,monday,madridToday(),submit);if(result.error || !result.days)return {error:weekError(lang,result.error??"fields")};
  if(submit && form.get("confirmed")!=="on")return {error:weekT(lang,"confirm")};
  // Factuur meteen mee ter controle: eerst controleren, dan pas de week indienen.
  const withInvoice=submit && form.get("withInvoice")==="1" && ctx.worker.portalInvoiceEnabled;
  if(withInvoice)await rememberInvoiceProfile(ctx.worker.id,form);
  const invoice=withInvoice?invoiceInput(form):null;
  if(withInvoice && (!invoice || form.get("invoiceConfirmed")!=="on"))return {error:weekT(lang,"fields")};
  if(invoice && invoice.date>madridToday())return {error:weekError(lang,"invoiceDate")};
  let roster:string[];
  try {const raw=form.get("roster");const parsed=z.array(z.string().trim().min(1).max(100).regex(/^[^\n;,]+$/)).max(30).safeParse(raw?JSON.parse(String(raw)):weekRoster(result.days));if(!parsed.success || new Set(parsed.data.map(n=>n.toLowerCase())).size!==parsed.data.length)return {error:weekT(lang,"errNames")};roster=parsed.data;}catch{return {error:weekT(lang,"fields")};}
  let notificationIds:string[]=[],savedVersion=version,sheetId="";
  try {({notificationIds,version:savedVersion,id:sheetId}=await saveWeek({worker:ctx.worker,projectId:ctx.project.id,monday,version,days:result.days,roster,submit}));}
  catch(e){return {error:weekError(lang,e instanceof WeekConflict?e.message:"failure")};}
  let invoiceError:string|undefined;
  if(invoice) {
    try{await submitWeekInvoice({id:sheetId,worker:ctx.worker,projectId:ctx.project.id,projectName:ctx.project.name,version:savedVersion,input:invoice,language:lang});savedVersion++;}
    catch(e){invoiceError=`${weekT(lang,"submitted")} ${weekT(lang,"invoiceRetry")} ${weekError(lang,e instanceof WeekConflict?e.message:"failure")}`;}
  }
  if(notificationIds.length)after(async()=>{try{await deliverStaffNotifications(notificationIds);}catch{console.warn("[worker-week] queued-notification-pending");}});
  revalidatePath(`/uren/${token}`);revalidatePath(`/projects/${ctx.project.id}`);revalidatePath("/projects/weekstaten");revalidatePath("/","layout");
  if(invoice)revalidatePath("/inkooporders/te-verwerken");
  if(invoiceError)return {error:invoiceError,version:savedVersion,days:result.days};
  return {ok:invoice?weekT(lang,"submittedWithInvoice"):weekT(lang,submit?"submitted":"saved"),savedAt:Date.now(),version:savedVersion,days:result.days};
}
export async function submitWeekInvoiceAction(token:string,_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const ctx=await portalLinkForToken(token);const lang=weekLang(form.get("lang")??ctx?.worker.portalLang);
  if(!ctx || !await rateLimit(`worker-invoice:${ctx.link.id}`,20,3600,{strikt:true}))return {error:weekT(lang,"unavailable")};
  const id=String(form.get("id")??""),version=Number(form.get("version"));
  if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(version)||version<1)return {error:weekT(lang,"conflict")};
  await rememberInvoiceProfile(ctx.worker.id,form);
  const input=invoiceInput(form);
  if(!input)return {error:weekT(lang,"fields")};
  if(input.date>madridToday())return {error:weekError(lang,"invoiceDate")};
  try{await submitWeekInvoice({id,worker:ctx.worker,projectId:ctx.project.id,projectName:ctx.project.name,version,input,language:lang});}
  catch(e){return {error:weekError(lang,e instanceof WeekConflict?e.message:"failure")};}
  revalidatePath(`/uren/${token}`);revalidatePath(`/projects/${ctx.project.id}`);revalidatePath("/inkooporders");revalidatePath("/inkooporders/te-verwerken");
  return {ok:weekT(lang,"invoiceSent"),savedAt:Date.now()};
}
