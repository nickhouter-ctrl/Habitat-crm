"use server";
import { z } from "zod";
import { weekRoster } from "@/lib/worker-week-grid";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { deliverStaffNotifications } from "@/lib/staff-notifications";
import { portalLinkForToken } from "@/lib/worker-portal";
import { rateLimit } from "@/lib/rate-limit";
import { madridToday, weekLang, validateWeek, supplierInvoiceSchema, type WeekDay } from "@/lib/worker-week";
import { weekError, weekT } from "@/lib/worker-week-i18n";
import { saveWeek, submitWeekInvoice, WeekConflict } from "@/lib/worker-week-service";

export type WeekActionState={error?:string;ok?:string;savedAt?:number;version?:number;days?:WeekDay[]}|null;
export async function saveWeekAction(token:string,_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const ctx=await portalLinkForToken(token);const lang=weekLang(form.get("lang")??ctx?.worker.portalLang);
  if(!ctx || !await rateLimit(`worker-week:${ctx.link.id}`,60,3600,{strikt:true}))return {error:weekT(lang,"unavailable")};
  const monday=String(form.get("monday")??"");const version=Number(form.get("version"));const submit=form.get("intent")==="submit";
  if(!Number.isSafeInteger(version)||version<0)return {error:weekT(lang,"conflict")};
  let raw:unknown;try{const value=String(form.get("days")??"");if(value.length>150000)throw Error();raw=JSON.parse(value);}catch{return {error:weekT(lang,"fields")};}
  const result=validateWeek(raw,monday,madridToday(),submit);if(result.error || !result.days)return {error:weekError(lang,result.error??"fields")};
  if(submit && form.get("confirmed")!=="on")return {error:weekT(lang,"confirm")};
  let roster:string[];
  try {const raw=form.get("roster");const parsed=z.array(z.string().trim().min(1).max(100).regex(/^[^\n;,]+$/)).max(30).safeParse(raw?JSON.parse(String(raw)):weekRoster(result.days));if(!parsed.success || new Set(parsed.data.map(n=>n.toLowerCase())).size!==parsed.data.length)return {error:weekT(lang,"errNames")};roster=parsed.data;}catch{return {error:weekT(lang,"fields")};}
  let notificationIds:string[]=[],savedVersion=version;
  try {({notificationIds,version:savedVersion}=await saveWeek({worker:ctx.worker,projectId:ctx.project.id,monday,version,days:result.days,roster,submit}));}
  catch(e){return {error:weekError(lang,e instanceof WeekConflict?e.message:"failure")};}
  if(notificationIds.length)after(async()=>{try{await deliverStaffNotifications(notificationIds);}catch{console.warn("[worker-week] queued-notification-pending");}});
  revalidatePath(`/uren/${token}`);revalidatePath(`/projects/${ctx.project.id}`);revalidatePath("/projects/weekstaten");revalidatePath("/","layout");
  return {ok:weekT(lang,submit?"submitted":"saved"),savedAt:Date.now(),version:savedVersion,days:result.days};
}
export async function submitWeekInvoiceAction(token:string,_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const ctx=await portalLinkForToken(token);const lang=weekLang(form.get("lang")??ctx?.worker.portalLang);
  if(!ctx || !await rateLimit(`worker-invoice:${ctx.link.id}`,20,3600,{strikt:true}))return {error:weekT(lang,"unavailable")};
  const id=String(form.get("id")??""),version=Number(form.get("version"));
  if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(version)||version<1)return {error:weekT(lang,"conflict")};
  const raw=Object.fromEntries(form);
  const parsed=supplierInvoiceSchema.safeParse({...raw,vatRate:raw.vatRate===""?NaN:Number(raw.vatRate),withholdingRate:raw.withholdingRate===""?NaN:Number(raw.withholdingRate),confirmed:raw.confirmed==="on"});
  if(!parsed.success)return {error:weekT(lang,"fields")};
  if(parsed.data.date>madridToday())return {error:weekError(lang,"invoiceDate")};
  try{await submitWeekInvoice({id,worker:ctx.worker,projectId:ctx.project.id,projectName:ctx.project.name,version,input:parsed.data,language:lang});}
  catch(e){return {error:weekError(lang,e instanceof WeekConflict?e.message:"failure")};}
  revalidatePath(`/uren/${token}`);revalidatePath(`/projects/${ctx.project.id}`);revalidatePath("/inkooporders");revalidatePath("/inkooporders/te-verwerken");
  return {ok:weekT(lang,"invoiceSent"),savedAt:Date.now()};
}
