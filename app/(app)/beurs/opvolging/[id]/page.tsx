import { tekst as uiTranslation } from '@/lib/i18n/server';
import { tekst, datumTaal } from '@/lib/i18n/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkflowModal } from '@/components/workflow-modal';
import { WorkflowTabs } from '@/components/workflow-tabs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { contacts, companies, partnerProfiles, partnerMessages, quoteRequests, emailInbox, sentEmails, users, appointments, activities } from '@/lib/db/schema';
import { salesMailFilter, salesAppointmentAccess } from '@/lib/auth/sales-scope';
import { requireModuleRead } from '@/lib/auth/guards';
import { listCatalogFiles } from '@/lib/storage';
import { geenInkoopmail, mailZichtbaarVoor } from '@/lib/mail-visibility';
import { partnerMailVisible } from '@/lib/partner-context';
import { followupSource, followupSources } from '@/lib/followup-source';
import { CUSTOM_STONE_SOURCE, confirmedFairDate, FOLLOWUP_MAILS, followupMailKind, hasResellerInterest } from '@/lib/followup-mail';
import { PageHeader, Card, CardContent, CardHeader, CardTitle, LinkButton } from '@/components/ui';
import { EditDraftForm, ProfileForm, Compose, SendForm, MeetingForm, ProposalAttachments } from '../forms';
import { FollowupCheck } from '../check';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED, followupCompleted } from '@/lib/followup-checklist';
import { latestFollowupCompletions } from '@/lib/followup-checklist-data';
import { FOLLOWUP_EXCLUDED } from '@/lib/followup-selection';
import { FollowupExclude } from '../exclude';
import { FollowupLive } from '../live';
export async function generateMetadata() {
  const uiT = await uiTranslation();
  return {title:uiT("Klantdossier")};
}
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const t=await tekst(); const dateLocale=await datumTaal();
 const access=await requireModuleRead('klantopvolging');const {id}=await params;if(!z.string().uuid().safeParse(id).success)notFound();
 const [row]=await db.select({c:contacts,p:partnerProfiles,company:companies.name}).from(contacts).leftJoin(partnerProfiles,eq(partnerProfiles.contactId,contacts.id)).leftJoin(companies,eq(companies.id,contacts.companyId)).where(and(eq(contacts.id,id)));if(!row)notFound();
 const sp=await searchParams;
 const {c,p}=row,write=access.heeftCap('schrijven'),canMail=access.magModule('inbox')||access.rol==='sales';
 const [team,requests,meetings,history,completionEvents]=await Promise.all([db.select({id:users.id,name:users.name}).from(users).where(inArray(users.role,['admin','agent','marketing','sales'])),db.select().from(quoteRequests).where(eq(quoteRequests.contactId,id)).orderBy(desc(quoteRequests.createdAt)),db.select().from(appointments).where(and(eq(appointments.contactId,id),salesAppointmentAccess(access.rol,access.id))).orderBy(desc(appointments.startsAt)),db.select().from(activities).where(and(eq(activities.contactId,id),inArray(activities.subject,['Verkooppuntdossier bijgewerkt',FOLLOWUP_DONE,FOLLOWUP_REOPENED]))).orderBy(desc(activities.createdAt)).limit(20),latestFollowupCompletions([id])]);
 const outgoing=canMail?await db.select().from(partnerMessages).where(and(eq(partnerMessages.contactId,id),partnerMailVisible(access.email,access.rol,access.id))).orderBy(desc(partnerMessages.createdAt)):[];
 const incoming=canMail&&c.email?await db.select().from(emailInbox).where(and(sql`lower(trim(${emailInbox.fromEmail}))=${c.email.trim().toLowerCase()}`,mailZichtbaarVoor(access.email),geenInkoopmail(),salesMailFilter(access.rol,access.email))).orderBy(desc(emailInbox.receivedAt)).limit(100):[];
 const completion=completionEvents[0],completed=followupCompleted(completion,incoming[0]?.receivedAt??null,p?.nextActionOn,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'}));
 // Oud CRM-archief alleen via expliciete contactkoppeling; geen privépostvak raden.
 const archived: (typeof sentEmails.$inferSelect)[] = [];
 const origins=followupSources(c.source,requests.map(r=>r.source));
 // Eén tijdlijn in plaats van twee lijstjes onder elkaar: uitgaand en inkomend
 // door elkaar, nieuwste eerst. Eerder stond alle verzonden mail boven alle
 // ontvangen mail, waardoor een antwoord van vandaag onder een mail van vorige
 // week terechtkwam — precies de regel die je wilt zien.
 type Mailregel =
   | { soort: 'uit'; op: Date; uit: (typeof outgoing)[number] }
   | { soort: 'in'; op: Date; binnen: (typeof incoming)[number] };
 /** Eén verstuurde mail of concept in de tijdlijn. */
 const uitgaandeMail = (m: (typeof outgoing)[number]) => {
 const shownAttachments=m.status==='draft'&&followupMailKind(m.source)==='custom'&&m.source!==CUSTOM_STONE_SOURCE?[]:m.attachments;
 return (
  <details key={m.id} open={m.status==='draft'} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{m.status==='draft'?t("Concept"):m.status==='sent'?(m.personal?t("Persoonlijk verstuurd"):t("Verzonden mail")):t("Verzending controleren")} · {m.subject}<span className="block text-xs font-normal text-muted">{(m.sentAt??m.createdAt).toLocaleString(dateLocale)} · {m.toEmail} · {m.mailboxUser}</span></summary><pre className="my-4 whitespace-pre-wrap font-sans text-sm">{m.body}</pre>{followupMailKind(m.source)!=='custom'&&<div className="mb-4 space-y-2"><p className="text-xs text-muted">{t(FOLLOWUP_MAILS[followupMailKind(m.source)])}</p><ProposalAttachments kind={followupMailKind(m.source)}/></div>}{shownAttachments.length>0&&<p className="mb-4 text-xs text-muted">{t("Bijlagen:")} {shownAttachments.map(a=>a.name).join(', ')}</p>}{m.status==='draft'&&write&&<><EditDraftForm key={m.updatedAt.toISOString()} id={m.id} subject={m.subject} body={m.body} updatedAt={m.updatedAt.toISOString()}/><SendForm id={m.id} updatedAt={m.updatedAt.toISOString()}/></>}</details>
 );};
 /** Eén binnengekomen mail in de tijdlijn. */
 const ontvangenMail = (m: (typeof incoming)[number]) => (
  <details key={m.id} className="rounded-xl border border-info/30 bg-info/5 p-4"><summary className="cursor-pointer font-medium">{t("Ontvangen ·")} {m.subject}<span className="block text-xs font-normal">{m.receivedAt?.toLocaleString(dateLocale)}</span></summary><pre className="my-4 whitespace-pre-wrap font-sans text-sm">{m.bodyText??t("Open de mail om de HTML-inhoud te bekijken.")}</pre>{access.magModule('inbox')&&<Link className="text-sm underline" href={`/inbox/${m.id}`}>{t("Openen en beantwoorden in dezelfde mailwisseling")}</Link>}</details>
 );
 const tijdlijn: Mailregel[] = [
   ...outgoing.map((m): Mailregel => ({ soort: 'uit', op: m.sentAt ?? m.createdAt, uit: m })),
   ...incoming.map((m): Mailregel => ({ soort: 'in', op: m.receivedAt ?? m.createdAt, binnen: m })),
 ].sort((a, b) => b.op.getTime() - a.op.getTime());
 const resellerInterested=hasResellerInterest(c,p);
 const bibliotheek=write&&canMail&&sp.actie==='mail'?(await listCatalogFiles()).map(f=>({path:f.path,name:f.name,size:f.size})):[];
 const mailContext={name:c.name,company:row.company??requests.find(r=>r.company)?.company,isFair:origins.some(o=>o.key==='beurs'),meetingDate:confirmedFairDate(c.tags),interests:(c.tags??[]).filter(t=>t.startsWith('wil:')).map(t=>t.slice(4))};
 const self=`/opvolging/${id}`;
 const modalHref=(modal:string)=>`${self}?actie=${modal}`;
 const main=<Card><CardHeader><CardTitle>{t("Volgende stap")}</CardTitle>{write&&<LinkButton href={modalHref('profile')} variant="secondary">{t("Bijwerken")}</LinkButton>}</CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted">{t("Verantwoordelijke")}</dt><dd className="mt-1 font-semibold">{team.find(u=>u.id===p?.ownerId)?.name??t("Nog toewijzen")}</dd></div><div><dt className="text-xs text-muted">{t("Volgende actie")}</dt><dd className="mt-1 font-semibold">{p?.nextAction??t("Nog bepalen")}</dd></div><div><dt className="text-xs text-muted">{t("Opvolgen op")}</dt><dd className="mt-1 font-semibold">{p?.nextActionOn?new Date(`${p.nextActionOn}T12:00:00Z`).toLocaleDateString(dateLocale):t("Nog bepalen")}</dd></div></dl><div className="mt-5 rounded-lg border bg-background/40 p-3">{write?<FollowupCheck key={`${completion?.id??'new'}:${completed}`} contactId={id} name={c.name} completed={completed} eventId={completion?.id??''}/>:<p className="text-sm">{completed?t("Opvolging afgehandeld"):t("Nog opvolgen")}</p>}<p className="mt-1 text-xs text-muted">{t("Na een bevestigde persoonlijke mail wordt de huidige opvolging automatisch afgevinkt.")}</p></div>{p?.notes&&<div className="mt-5"><h3 className="mb-2 text-xs font-medium text-muted">{t("Gespreksnotities en afspraken")}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{p.notes}</p></div>}</CardContent></Card>;
 const requestsPanel=<Card><CardHeader><CardTitle>{t("Herkomst & aanvragen")}</CardTitle></CardHeader><CardContent><div className="space-y-4">{requests.map(r=><div key={r.id}><p className="text-xs text-muted">{r.createdAt.toLocaleDateString(dateLocale)} · {r.company} · {t(followupSource(r.source).label)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.message}</p></div>)}{!requests.length&&<p className="text-sm text-muted">{t("Nog geen gekoppelde aanvragen. Gespreksnotities kun je hierboven vastleggen.")}</p>}</div></CardContent></Card>;
 const meetingsPanel=<Card><CardHeader><CardTitle>{t("Afspraken")}</CardTitle>{write&&access.magModule('agenda')&&<LinkButton href={modalHref('appointment')} variant="secondary">{t("Afspraak plannen")}</LinkButton>}</CardHeader><CardContent><div className="space-y-3">{meetings.map(m=><div key={m.id} className="rounded-lg border p-3 text-sm"><Link href={`/agenda?date=${m.startsAt.toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'})}&owner=all`} className="font-medium text-accent hover:underline">{m.title}</Link><p className="mt-1 text-xs text-muted">{m.startsAt.toLocaleString(dateLocale,{timeZone:'Europe/Madrid'})} · {m.location??t("Locatie nog te bepalen")} · {t(m.status==='scheduled'?'Gepland':m.status==='completed'?'Afgerond':'Geannuleerd')}</p>{m.notes&&<p className="mt-2 whitespace-pre-wrap text-sm">{m.notes}</p>}</div>)}{!meetings.length&&<p className="text-sm text-muted">{t("Nog geen afspraak gepland.")}</p>}</div></CardContent></Card>;
 const historyPanel=<Card><CardHeader><CardTitle>{t("Wijzigingshistorie")}</CardTitle></CardHeader><CardContent>{history.map(h=><p key={h.id} className="mb-3 text-sm">{h.createdAt.toLocaleString(dateLocale)} · {team.find(u=>u.id===h.authorId)?.name??t("Medewerker")} · {t(h.subject??'')}</p>)}</CardContent></Card>;
 const mailPanel=<Card><CardHeader><CardTitle>{t("Mailhistorie & concepten")}</CardTitle></CardHeader><CardContent><div className="space-y-4">{tijdlijn.map(r=>r.soort==='uit'?uitgaandeMail(r.uit):ontvangenMail(r.binnen))}{!tijdlijn.length&&!archived.length&&<p className="text-sm text-muted">{t("Nog geen gekoppelde mail. Haal op de opvolglijst eerst Verzonden op.")}</p>}</div></CardContent></Card>;
 return <div className="space-y-5"><FollowupLive/><PageHeader title={c.name} subtitle={`${row.company??t(c.type)} · ${c.email??t('Geen e-mailadres')} · ${c.city??t('Plaats onbekend')}`} actions={<LinkButton href="/opvolging" variant="secondary">{t("Alle opvolging")}</LinkButton>}/>
 <div className="flex flex-wrap gap-2">{canMail&&write&&<LinkButton href={modalHref('mail')}>{t("Mail schrijven")}</LinkButton>}{write&&<>{access.magModule('teamberichten')&&<LinkButton href={`/teamberichten?nieuw=1&klant=${id}${p?.ownerId?`&medewerker=${p.ownerId}`:''}`} variant="secondary">{t("Vraag een collega / maak een taak")}</LinkButton>}{access.magModule('agenda')&&<LinkButton href={modalHref('appointment')} variant="secondary">{t("Afspraak plannen")}</LinkButton>}</>}{access.magModule('contacts')&&<LinkButton href={`/contacts/${id}`} variant="secondary">{t("Contactgegevens")}</LinkButton>}</div>
 {c.tags?.includes(FOLLOWUP_EXCLUDED)&&<div className="rounded-xl border border-warning/30 bg-warning/5 p-4"><p className="text-sm">{t("Dit contact staat buiten de opvolgwerklijst. Gegevens en historie blijven bewaard.")}</p>{write&&<FollowupExclude id={id} restore/>}</div>}
 <WorkflowTabs key={sp.tab==='mail'?'mail':'overview'} id="dossier" label={t("Klantdossier")} initial={sp.tab==='mail'?'mail':'overview'} tabs={[{key:'overview',label:t("Overzicht"),content:<div className="grid items-start gap-5 lg:grid-cols-[1.1fr_1fr]">{main}{requestsPanel}</div>},{key:'mail',label:t("Mailhistorie & concepten"),content:mailPanel},{key:'appointments',label:t("Afspraken"),content:meetingsPanel},{key:'history',label:t("Historie"),content:historyPanel}]}/>
 {resellerInterested&&access.magModule('verkooppunten')&&<details className="rounded-xl border bg-surface px-4 py-3"><summary className="cursor-pointer text-sm font-medium">{t("Verkooppuntafspraken")}</summary><div className="mt-3 flex flex-wrap gap-2"><LinkButton href={`/wederverkopers/${id}/samenwerking`} variant="secondary">{t("Contract, exclusiviteit & afname")}</LinkButton><LinkButton href={`/wederverkopers/${id}/presentatie`} variant="secondary">{t("Presentatiepakket & verrekening")}</LinkButton></div></details>}
 {write&&sp.actie==='profile'&&<WorkflowModal title={t("Relatie en volgende stap")} closeHref={self}><ProfileForm id={id} profile={p} users={team} interested={resellerInterested}/></WorkflowModal>}
 {write&&canMail&&sp.actie==='mail'&&<WorkflowModal title={t("Persoonlijke mail voorbereiden")} closeHref={`${self}?tab=mail`}><Compose id={id} bibliotheek={bibliotheek} context={mailContext} resellerInterested={resellerInterested}/></WorkflowModal>}
 {write&&access.magModule('agenda')&&sp.actie==='appointment'&&<WorkflowModal title={t("Afspraak plannen")} closeHref={self}><MeetingForm id={id}/></WorkflowModal>}
 </div>;
}
