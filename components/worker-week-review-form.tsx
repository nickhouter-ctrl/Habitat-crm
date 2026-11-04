"use client";
import { useActionState } from "react";
import { reviewWorkerWeek } from "@/app/(app)/projects/weekstaten/actions";
export function WorkerWeekReviewForm({id,projectId,version,invoice}:{id:string;projectId:string;version:number;invoice:boolean}) {
 const [state,action,pending]=useActionState(reviewWorkerWeek.bind(null,invoice),null);
 return <form action={action} className="mt-4 space-y-3 border-t pt-4">
  <input type="hidden" name="id" value={id}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="version" value={version}/>
  <label className="block text-sm">Opmerking / reden voor terugsturen<textarea name="reason" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border bg-background p-3" placeholder="Schrijf de reden in de taal van de medewerker."/></label>
  <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" className="mt-1 size-4"/>{invoice?"Ik heb afzender, nummering, belasting, betaalgegevens en aansluiting op de goedgekeurde uren gecontroleerd.":"Ik heb de aanwezigheid, werkzaamheden en het tarief gecontroleerd. Deze uren mogen in de projectkosten worden verwerkt."}</label>
  <div className="flex flex-wrap gap-2"><button disabled={pending} name="decision" value="approve" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending?"Bezig…":invoice?"Factuur goedkeuren en boeken":"Weekstaat goedkeuren"}</button><button disabled={pending} name="decision" value="return" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Terugsturen voor correctie</button></div>
  {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
 </form>;
}
