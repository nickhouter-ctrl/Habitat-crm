"use client";
import { useT, useLocale } from '@/components/taal-provider';
import { useActionState, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { editDraft, saveProfile, syncSent, saveDraft, sendDraft, generateDraft, addMeeting, type DraftSamenvatting, type Result } from './actions';
import { INTEREST, STAGES } from '@/lib/partners';
import type { partnerProfiles } from '@/lib/db/schema';
import { FOLLOWUP_MAILS, followupDesigns, followupDesignUrl, followupProposal, type FollowupMailKind, type FollowupMailContext } from '@/lib/followup-mail';
import { PdfBijlagen, type BibliotheekPdf } from './pdf-bijlagen';
const input='w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground';
export function Field({label,children}:{label:string;children:React.ReactNode}){
 const t=useT();return <label className="grid gap-1 text-sm font-medium">{t(label)}{children}</label>;}
export function ActionForm({action,children,label}:{action:(s:Result,f:FormData)=>Promise<Result>;children?:React.ReactNode;label:string}){
 const t=useT();
 const [state,form,pending]=useActionState(action,{});return <form action={form} className="space-y-4"><fieldset disabled={pending} className="space-y-4">{children}<button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending?t("Bezig…"):label}</button></fieldset>{state.error&&<p role="alert" className="text-sm text-danger">{t(state.error)}</p>}{state.success&&<p role="status" className="text-sm text-success">{t(state.success)}</p>}</form>;
}
export function SyncButton(){
 const t=useT();return <ActionForm action={syncSent} label={t("Verzonden mails ophalen")}/>;}
export function ProfileForm({id,profile,users,interested}:{id:string;profile:typeof partnerProfiles.$inferSelect|null;users:{id:string;name:string|null}[];interested:boolean}){
 const t=useT();
 return <ActionForm action={saveProfile} label={t("Dossier opslaan")}><p className="text-sm leading-relaxed text-muted">{t("Kies wie de klant opvolgt, wat de volgende stap is en wanneer die moet gebeuren. Na opslaan staat de actie in de agenda van de verantwoordelijke.")}</p><input type="hidden" name="contactId" value={id}/><input type="hidden" name="version" value={profile?.version??0}/><div className="grid gap-4 sm:grid-cols-2">
 <Field label={t("Verkooppuntinteresse")}><select className={input} name="interest" defaultValue={profile?.interest??(interested?'interested':'unknown')}>{Object.entries(INTEREST).map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>
 <Field label={t("Opvolgfase")}><select className={input} name="stage" defaultValue={profile?.stage==='active'?'discussion':profile?.stage??'new'}>{Object.entries(STAGES).filter(([v])=>v!=='active').map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>
 <Field label={t("Verantwoordelijke")}><select className={input} name="ownerId" defaultValue={profile?.ownerId??''}><option value="">{t("Nog toewijzen")}</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
 <Field label={t("Mailtaal")}><select className={input} name="language" defaultValue={profile?.language??'en-es'}>{Object.entries({'en-es':'Engels én Spaans',en:'Engels',es:'Spaans',nl:'Nederlands',de:'Duits',fr:'Frans',it:'Italiaans'}).map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>
 <Field label={t("Volgende actie")}><input className={input} name="nextAction" maxLength={300} defaultValue={profile?.nextAction??''} placeholder={t("Bijvoorbeeld showroomvoorstel bespreken")}/></Field><Field label={t("Opvolgen op")}><input className={input} name="nextActionOn" type="date" defaultValue={profile?.nextActionOn??''}/></Field></div>
 <p className="text-xs leading-relaxed text-muted">{t("Een nieuwe verantwoordelijke krijgt een e-mail. Met een opvolgdatum komt de actie ook in het ochtendoverzicht.")}</p><Link href={`/teamberichten?nieuw=1&klant=${id}${profile?.ownerId?`&medewerker=${profile.ownerId}`:""}`} className="inline-flex rounded-lg border border-border px-3 py-2 text-sm text-accent hover:bg-accent/5">{t("Vraag een collega / maak een taak")}</Link>
 {profile?.active&&<p className="text-sm">{t("Dit is een officieel verkooppunt. Alleen ‘Gestopt’ trekt de activering en publicatie in.")}</p>}
 <Field label={t("Gespreksnotities en afspraken")}><textarea className={input} name="notes" rows={5} maxLength={10000} defaultValue={profile?.notes??''}/></Field></ActionForm>;
}
export function ProposalAttachments({kind,includeTechnical=kind!=='custom'}:{kind:FollowupMailKind;includeTechnical?:boolean}){
 const t=useT();
 const designs=followupDesigns(kind);
 if(!includeTechnical&&!designs.length)return null;
 return <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
 <p className="text-sm font-medium">{t("Bijlagen bij deze mail")}</p>
 {designs.length>0&&<div className={`grid gap-3 ${designs.length>1?'sm:grid-cols-2':'max-w-60'}`}>{designs.map(d=><a key={d.filename} href={followupDesignUrl(d.filename)} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-border text-sm underline-offset-4 hover:underline"><Image src={followupDesignUrl(d.filename)} alt={t(d.label)} width={d.width} height={d.height} sizes="240px" className="h-40 w-full bg-white object-contain"/><span className="block p-2">{t(d.label)}</span></a>)}</div>}
 {includeTechnical&&<p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><a className="underline" href="/docs/flexible-stone-technical-data-sheet.pdf" target="_blank" rel="noopener noreferrer">{t("Technische data sheet · Engels")}</a><a className="underline" href="/docs/flexible-stone-technical-data-sheet-es.pdf" target="_blank" rel="noopener noreferrer">{t("Technische data sheet · Spaans")}</a></p>}
 </div>;
}

/**
 * Controleren en versturen, in één venster.
 *
 * Bewaren verstuurde niets: je moest het concept verderop in de mailhistorie
 * opzoeken en daar een vinkje zetten. Dat werd overgeslagen. Nu staat het
 * bewaarde concept meteen in beeld zoals de klant het krijgt — naar wie, van
 * wie, welke bijlagen, de hele tekst — met één knop eronder.
 *
 * Het venster is de controle, dus het vinkje "ik heb het nagekeken" zit er niet
 * meer in; het concept blijft bewaard als je sluit, dus niets gaat verloren.
 */
function ControlePopup({draft,onClose}:{draft:DraftSamenvatting;onClose:()=>void}){
 const t=useT();
 const [state,form,pending]=useActionState(sendDraft,{});
 const verstuurd=!!state.success;
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();return()=>element?.close();},[]);
 return <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!pending)onClose();}} aria-label={t("Mail controleren en versturen")} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40">
  <div className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl">
   <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
    <div><p className="font-semibold">{t("Klopt dit? Dan gaat hij zo weg.")}</p><p className="text-xs text-muted">{t("Dit is precies wat de klant ontvangt.")}</p></div>
    <button type="button" onClick={onClose} disabled={pending} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-background" aria-label={t("Sluiten")}>✕</button>
   </div>
   <div className="space-y-3 px-5 py-4 text-sm">
    <p><span className="text-muted">{t("Naar")}: </span><span className="font-medium">{draft.to}</span></p>
    <p><span className="text-muted">{t("Van")}: </span>{draft.afzender} · {draft.mailbox}</p>
    <p><span className="text-muted">{t("Onderwerp")}: </span><span className="font-medium">{draft.subject}</span></p>
    <p><span className="text-muted">{t("Bijlagen")}: </span>{draft.attachments.length?draft.attachments.join(', '):t("geen")}</p>
    <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background/50 p-3 font-sans">{draft.body}</pre>
   </div>
   <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
    {verstuurd
      ? <><p role="status" className="text-sm text-success">{t(state.success!)}</p><button type="button" onClick={onClose} className="ml-auto rounded-lg border border-border px-4 py-2 text-sm">{t("Sluiten")}</button></>
      : <form action={form} className="flex w-full flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={draft.id}/><input type="hidden" name="updatedAt" value={draft.updatedAt}/><input type="hidden" name="confirm" value="on"/>
          <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending?t("Versturen…"):`${t("Versturen naar")} ${draft.to}`}</button>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-border px-4 py-2 text-sm">{t("Later versturen")}</button>
          {state.error&&<p role="alert" className="w-full text-sm text-danger">{t(state.error)}</p>}
        </form>}
   </div>
  </div>
 </dialog>;
}

export function Compose({id,context,resellerInterested,bibliotheek=[]}:{id:string;context:FollowupMailContext;resellerInterested:boolean;bibliotheek?:BibliotheekPdf[]}){
 const t=useT();
 const [pdfs,setPdfs]=useState<string[]>([]);
 const dateLocale={nl:"nl-NL",en:"en-GB",es:"es-ES"}[useLocale()];
 const [kind,setKind]=useState<FollowupMailKind>('custom'),[stoneInfo,setStoneInfo]=useState(false);
 const [subject,setSubject]=useState(''),[body,setBody]=useState(''),[instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function choose(value:FollowupMailKind){setKind(value);setError('');const proposal=value==='custom'?{subject:'',body:''}:followupProposal(value,context);setSubject(proposal.subject);setBody(proposal.body);}
 // Bewaren levert het concept terug; dat opent de controlepopup.
 const [bewaarStaat,bewaarForm,bewaarBezig]=useActionState(saveDraft,{} as Result);
 // Het venster volgt uit het bewaarde concept; onthouden wordt alleen welk
 // concept je hebt weggeklikt. Zo hoeft er geen effect state te zetten.
 const [weggeklikt,setWeggeklikt]=useState('');
 const popup=bewaarStaat.draft&&weggeklikt!==bewaarStaat.draft.id?bewaarStaat.draft:null;
 return <div className="space-y-4">
 <Field label={t("Mailvoorstel")}><select aria-label={t("Mailvoorstel")} className={input} value={kind} disabled={busy} onChange={e=>choose(e.target.value as FollowupMailKind)}>{Object.entries(FOLLOWUP_MAILS).map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>
 <p className="text-xs text-muted">{t(kind==='custom'?"Schrijf zelf een mail of laat de AI een passend concept en onderwerp maken.":"De keuze laadt de tekst en de bijlagen. Pas de mail hieronder aan voor deze klant.")}</p>
 {kind==='reseller'&&!resellerInterested&&<p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">{t("Wil deze klant verkooppunt worden? Leg die interesse eerst vast bij ‘Relatie en volgende stap’ en sla het dossier op. Het beroep hoeft niet te veranderen.")}</p>}
 {kind!=='custom'&&<p className="text-sm text-muted">{t("Spaans én Engels · ondertekend door Hans")}{context.isFair&&context.meetingDate?` · ${t('Gesprek op {datum}',{datum:new Date(`${context.meetingDate}T12:00:00Z`).toLocaleDateString(dateLocale,{timeZone:'UTC'})})}`:''}</p>}
 <div className="space-y-3"><Field label={t("Wat wil je persoonlijk benadrukken?")}><input aria-label={t("Wat wil je persoonlijk benadrukken?")} className={input} value={instruction} onChange={e=>setInstruction(e.target.value)} maxLength={2000} placeholder={t("Bijvoorbeeld hun showroom, project of jullie laatste gesprek")}/></Field><button type="button" disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm" onClick={async()=>{setBusy(true);setError('');try{const r=await generateDraft(id,instruction,kind,body,stoneInfo,pdfs);if(r){setSubject(r.subject);setBody(r.body);}else setError('AI niet beschikbaar; pas de persoonlijke tekst hieronder zelf aan.');}catch{setError(kind==='reseller'&&!resellerInterested?'Leg eerst de verkooppuntinteresse vast en sla het dossier op.':'Het persoonlijke voorstel kon niet worden gemaakt. De bestaande tekst blijft staan.');}finally{setBusy(false);}}}>{busy?t("Persoonlijk voorstel schrijven…"):kind==='custom'?t("Maak concept met dossiercontext"):t("Maak persoonlijk met dossier")}</button><p className="text-xs text-muted">{kind==='custom'?t("Gebruikt gespreksnotities en eerdere mails uit dit dossier."):t("Werkt het voorstel hieronder uit met de gespreksnotities en eerdere mails uit dit dossier.")} {t("Controleer de nieuwe tekst voordat je die bewaart.")}</p>{error&&<p role="alert" className="text-sm text-danger">{t(error)}</p>}</div>
 <div>{kind==='custom'&&<label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={stoneInfo} onChange={e=>setStoneInfo(e.target.checked)} className="mt-1"/><span>{t("Flexible Stone-mail: technische data sheets meesturen")}<span className="mt-1 block text-xs text-muted">{t("Alleen aanvinken als deze mail over Flexible Stone gaat.")}</span></span></label>}<ProposalAttachments kind={kind} includeTechnical={kind!=='custom'||stoneInfo}/></div>
 <PdfBijlagen bibliotheek={bibliotheek} gekozen={pdfs} onChange={setPdfs}/>
 <form action={bewaarForm} className="space-y-4"><fieldset disabled={bewaarBezig} className="space-y-4">
 <input type="hidden" name="contactId" value={id}/><input type="hidden" name="templateKind" value={kind}/><input type="hidden" name="flexibleStoneInfo" value={stoneInfo?"on":"off"}/>{pdfs.map(p=><input key={p} type="hidden" name="bijlage" value={p}/>)}
 <Field label={t("Onderwerp")}><input aria-label={t("Onderwerp")} className={input} name="subject" value={subject} onChange={e=>setSubject(e.target.value)} required maxLength={250} placeholder={t("Schrijf een onderwerp of laat de AI het maken")}/></Field>
 <Field label={t("Mailtekst")}><textarea aria-label={t("Mailtekst")} className={input} name="body" rows={16} value={body} onChange={e=>setBody(e.target.value)} required maxLength={20000}/></Field>
 <p className="text-sm text-muted">{t("Je controleert de mail eerst in een venster. Na bevestigde verzending wordt de huidige opvolging automatisch afgevinkt. Een concept bewaren verstuurt niets.")}</p>
 <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{bewaarBezig?t("Bezig…"):t("Controleren en versturen")}</button>
 </fieldset>{bewaarStaat.error&&<p role="alert" className="text-sm text-danger">{t(bewaarStaat.error)}</p>}</form>
 {popup&&<ControlePopup draft={popup} onClose={()=>setWeggeklikt(popup.id)}/>}</div>;
}
export function SendForm({id,updatedAt}:{id:string;updatedAt:string}){
 const t=useT();return <ActionForm action={sendDraft} label={t("Dit concept versturen")}><input type="hidden" name="updatedAt" value={updatedAt}/><input type="hidden" name="id" value={id}/><label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" required/>{t("Ik heb ontvanger, mailtekst en afspraken gecontroleerd.")}</label></ActionForm>;}
export function MeetingForm({id}:{id:string}){
 const t=useT();const [date,setDate]=useState('');return <ActionForm action={addMeeting} label={t("Bevestigde afspraak in agenda zetten")}><input type="hidden" name="contactId" value={id}/><input type="hidden" name="startsAt" value={date&&!isNaN(Date.parse(date))?new Date(date).toISOString():''}/><Field label={t("Afspraak")}><input className={input} name="title" required placeholder={t("Bijvoorbeeld: afspraak bij de klant")}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={t("Datum en tijd (tijdzone van je apparaat)")}><input className={input} type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label={t("Duur in minuten")}><input className={input} name="minutes" type="number" min={5} max={480} defaultValue={30}/></Field></div><Field label={t("Locatie of videolink")}><input className={input} name="location"/></Field><Field label={t("Notities / bevestiging per mail")}><textarea className={input} name="notes" rows={3}/></Field><label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" required/>{t("Datum en tijd zijn met de klant bevestigd.")}</label></ActionForm>;}

export function EditDraftForm({id,subject,body,updatedAt}:{id:string;subject:string;body:string;updatedAt:string}){
 const t=useT();return <details className="mb-4"><summary className="cursor-pointer text-sm underline">{t("Concept bewerken")}</summary><ActionForm action={editDraft} label={t("Wijzigingen bewaren")}><input type="hidden" name="id" value={id}/><input type="hidden" name="updatedAt" value={updatedAt}/><Field label={t("Onderwerp concept")}><input className={input} name="subject" defaultValue={subject} required maxLength={250}/></Field><Field label={t("Inhoud concept")}><textarea className={input} name="body" rows={10} defaultValue={body} required maxLength={20000}/></Field></ActionForm></details>;}
