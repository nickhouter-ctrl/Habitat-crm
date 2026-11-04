"use server";
import { requireModule } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reviewWeek, reviewWeekInvoice, WeekConflict } from "@/lib/worker-week-service";
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
  revalidatePath(`/projects/${d.projectId}`);revalidatePath("/inkooporders");revalidatePath("/inkooporders/te-verwerken");revalidatePath("/uren/[token]","page");revalidatePath("/ploeg");revalidatePath("/");
  return {ok:d.decision==="approve"?"Goedgekeurd en verwerkt.":"Teruggestuurd naar de medewerker."};
}
