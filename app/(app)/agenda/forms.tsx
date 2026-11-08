"use client";
import { useActionState, useState } from "react";
import { useT } from "@/components/taal-provider";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveAgendaItem, type AgendaSaveResult } from "./actions";

export function AgendaAddForms({team,day,userId,submissionIds}:{team:{id:string;name:string|null;email:string}[];day:string;userId:string;submissionIds:{task:string;appointment:string}}) {
  const t=useT(),[active,setActive]=useState<'task'|'appointment'>('task');
  return <div><div role="tablist" aria-label={t("Toevoegen")} className="mb-5 flex rounded-lg border p-1">{(['task','appointment'] as const).map(kind=><button key={kind} type="button" role="tab" id={`add-tab-${kind}`} aria-controls={`add-panel-${kind}`} aria-selected={active===kind} onClick={()=>setActive(kind)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${active===kind?'bg-accent text-accent-foreground':'text-muted'}`}>{t(kind==='task'?"Nieuwe taak":"Nieuwe afspraak")}</button>)}</div>{(['appointment','task'] as const).map(kind=><div key={kind} hidden={active!==kind} role="tabpanel" id={`add-panel-${kind}`} aria-labelledby={`add-tab-${kind}`}><AddForm kind={kind} team={team} day={day} userId={userId} submissionId={submissionIds[kind]}/></div>)}</div>;
}
/** Vinkjes voor wie er verder bij de afspraak is. Zonder collega's om te kiezen niets. */
export function AttendeePicker({team,defaultIds=[],excludeId}:{team:{id:string;name:string|null;email:string}[];defaultIds?:string[];excludeId?:string|null}) {
  const t=useT(),choices=team.filter(u=>u.id!==excludeId);
  if(!choices.length)return null;
  return <fieldset className="space-y-1"><legend className="text-sm font-medium">{t("Ook aanwezig")}</legend>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">{choices.map(u=><label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="attendeeIds" value={u.id} defaultChecked={defaultIds.includes(u.id)}/>{u.name??u.email}</label>)}</div>
    <p className="text-xs text-muted">{t("Iedereen die je aanvinkt ziet de afspraak in zijn agenda en krijgt een e-mail.")}</p>
  </fieldset>;
}
function AddForm({kind,team,day,userId,submissionId}:{kind:'task'|'appointment';team:{id:string;name:string|null;email:string}[];day:string;userId:string;submissionId:string}) {
  const t=useT(),[state,action,pending]=useActionState(saveAgendaItem,{} as AgendaSaveResult),[owner,setOwner]=useState(userId);
  return <form action={action} className="space-y-3"><fieldset className="space-y-3" disabled={pending||!!state.success}>
    <input type="hidden" name="submissionId" value={submissionId}/><input type="hidden" name="kind" value={kind}/>
    <Field label={t(kind==='task'?"Wat moet er gebeuren?":"Titel")} htmlFor={`${kind}-title`}><Input id={`${kind}-title`} name={kind==='task'?'subject':'title'} required maxLength={250} placeholder={t(kind==='task'?"Bijvoorbeeld: klant bellen om afspraak te plannen":"Bijvoorbeeld: showroombezoek met de klant")}/></Field>
    <div className="grid grid-cols-2 gap-3"><Field label={t("Datum")} htmlFor={`${kind}-date`}><Input id={`${kind}-date`} name="date" type="date" required defaultValue={day}/></Field><Field label={t("Tijd")} htmlFor={`${kind}-time`}><Input id={`${kind}-time`} name="time" type="time" required defaultValue={kind==='task'?'17:00':'09:00'}/></Field></div>
    <Field label={t("Verantwoordelijke")} htmlFor={`${kind}-owner`}><Select id={`${kind}-owner`} name="assigneeId" required value={owner} onChange={e=>setOwner(e.target.value)}>{team.map(u=><option key={u.id} value={u.id}>{u.name??u.email}</option>)}</Select></Field>
    {kind==='appointment'&&<AttendeePicker team={team} excludeId={owner}/>}
    {kind==='task'?<Field label={t("Prioriteit")} htmlFor="task-priority"><Select id="task-priority" name="priority" defaultValue="middel"><option value="hoog">{t("Hoog")}</option><option value="middel">{t("Middel")}</option><option value="laag">{t("Laag")}</option></Select></Field>:<Field label={t("Locatie")} htmlFor="appointment-location"><Input id="appointment-location" name="location" maxLength={500}/></Field>}
    <Field label={t("Toelichting")} htmlFor={`${kind}-notes`}><Textarea id={`${kind}-notes`} name={kind==='task'?'body':'notes'} rows={3} maxLength={5000}/></Field>
    <p className="text-xs text-muted">{t("De verantwoordelijke krijgt een e-mail. Gebruik ‘Vraag een collega’ in het klantdossier om deze actie aan een klant te koppelen.")}</p>
    <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending?t("Toevoegen…"):t(kind==='task'?"Taak toevoegen":"Afspraak toevoegen")}</button>
  </fieldset>{state.error&&<p role="alert" className="text-sm text-danger">{t(state.error)}</p>}{state.success&&<p role="status" className="text-sm text-success">{t(state.success)}</p>}</form>;
}
