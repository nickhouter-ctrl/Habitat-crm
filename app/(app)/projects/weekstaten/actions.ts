"use server";
import { requireModule } from "@/lib/auth/guards";
import { magModule } from "@/lib/auth/modules";
import { after } from "next/server";
import { syncWorkerInvoice } from "@/lib/worker-holded-sync";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerWeekSheets } from "@/lib/db/schema";
import { reviewWeek, reviewWeekInvoice, WeekConflict } from "@/lib/worker-week-service";
import { reviewLumpInvoice } from "@/lib/worker-lump-invoice";
import type { WeekActionState } from "@/app/uren/[token]/week-actions";
const input=z.object({id:z.uuid(),projectId:z.uuid(),version:z.coerce.number().int().min(1),decision:z.enum(["approve","return"]),reason:z.string().trim().max(2000),confirmed:z.string().optional()});
export async function reviewWorkerWeek(invoice:boolean,_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const user=await requireModule(invoice?"inkoop":"projects");
  const parsed=input.safeParse(Object.fromEntries(form));if(!parsed.success)return {error:"Controleer de invoer."};
  const d=parsed.data;
  if(d.decision==="return" && d.reason.length<5)return {error:"Vul een reden in zodat de medewerker weet wat hij moet aanpassen."};
  if(d.decision==="approve" && d.confirmed!=="on")return {error:"Bevestig dat je de gegevens en het tarief hebt gecontroleerd."};
  try {await (invoice?reviewWeekInvoice:reviewWeek)({...d,approve:d.decision==="approve",userId:user.id});}
  catch(e){return {error:e instanceof WeekConflict?e.message:"Verwerken is niet gelukt. Probeer het opnieuw."};}
  // Factuur die met de uren is meegestuurd: in één keer mee goedkeuren.
  let factuurMee=false,factuurFout="";
  if(!invoice&&d.decision==="approve"){
    const [s]=await db.select({version:workerWeekSheets.version,invoiceStatus:workerWeekSheets.invoiceStatus}).from(workerWeekSheets).where(eq(workerWeekSheets.id,d.id));
    // Alleen wie ook Inkoop mag, keurt de factuur mee goed; anders blijft hij daar staan.
    if(s?.invoiceStatus==="submitted"&&magModule(user.role,"inkoop")){
      try{await reviewWeekInvoice({id:d.id,projectId:d.projectId,version:s.version,userId:user.id,approve:true,reason:d.reason});factuurMee=true;}
      catch(e){factuurFout=e instanceof WeekConflict?e.message:"Verwerken is niet gelukt.";}
    }
  }
  if((invoice||factuurMee)&&d.decision==="approve")after(async()=>{try{await syncWorkerInvoice(d.id);}catch{console.warn("[worker-invoice] sync pending");}});
  revalidatePath(`/projects/${d.projectId}`);revalidatePath("/inkooporders");revalidatePath("/inkooporders/te-verwerken");revalidatePath("/uren/[token]","page");revalidatePath("/ploeg");revalidatePath("/projects/weekstaten");revalidatePath("/","layout");
  if(factuurFout)return {error:`Uren goedgekeurd. De factuur nog niet: ${factuurFout} Keur hem goed in Inkoop → te verwerken.`};
  if(factuurMee)return {ok:"Uren en factuur goedgekeurd en geboekt. De factuur wordt automatisch naar Holded gestuurd."};
  return {ok:d.decision==="approve"?(invoice?"Goedgekeurd en geboekt. De factuur wordt automatisch naar Holded gestuurd.":"Goedgekeurd en verwerkt."):"Teruggestuurd naar de medewerker."};
}

/** Losse factuur zonder uren goedkeuren (→ inkoopfactuur op het project) of terugsturen. */
export async function reviewLumpInvoiceAction(_prev:WeekActionState,form:FormData):Promise<WeekActionState> {
  const user=await requireModule("inkoop");
  const parsed=input.safeParse(Object.fromEntries(form));if(!parsed.success)return {error:"Controleer de invoer."};
  const d=parsed.data;
  if(d.decision==="return" && d.reason.length<5)return {error:"Vul een reden in zodat de medewerker weet wat hij moet aanpassen."};
  if(d.decision==="approve" && d.confirmed!=="on")return {error:"Bevestig dat je de factuur hebt gecontroleerd."};
  try{await reviewLumpInvoice({...d,approve:d.decision==="approve",userId:user.id});}
  catch(e){return {error:e instanceof WeekConflict?e.message:"Verwerken is niet gelukt. Probeer het opnieuw."};}
  revalidatePath(`/projects/${d.projectId}`);revalidatePath("/inkooporders");revalidatePath("/uren/[token]","page");
  return {ok:d.decision==="approve"?"Goedgekeurd en als inkoopfactuur op het project geboekt.":"Teruggestuurd naar de medewerker."};
}
