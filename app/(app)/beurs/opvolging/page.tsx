import Link from 'next/link';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, companies, partnerProfiles, partnerMessages, quoteRequests, emailInbox, users } from '@/lib/db/schema';
import { requireModuleRead } from '@/lib/auth/guards';
import { mailZichtbaarVoor } from '@/lib/mail-visibility';
import { partnerMailVisible } from '@/lib/partner-context';
import { conversationState, INTEREST, STAGES } from '@/lib/partners';
import { PageHeader, Card, CardContent, StatTile, LinkButton } from '@/components/ui';
import { SyncButton } from './forms';
export const metadata={title:'Beursopvolging'};
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;filter?:string}>}){
 const access=await requireModuleRead('aanvragen');const s=await searchParams;
 const rows=await db.select({contact:contacts,company:companies.name,profile:partnerProfiles,owner:users.name}).from(contacts)
 .leftJoin(companies,eq(companies.id,contacts.companyId)).leftJoin(partnerProfiles,eq(partnerProfiles.contactId,contacts.id)).leftJoin(users,eq(users.id,partnerProfiles.ownerId))
 .where(or(isNotNull(partnerProfiles.contactId),inArray(contacts.id,db.select({id:quoteRequests.contactId}).from(quoteRequests).where(sql`${quoteRequests.source} like 'beurs:%'`)))).orderBy(contacts.name);
 const canMail=access.magModule('inbox');
 const [sent,incoming]=canMail?await Promise.all([
 db.select({contactId:partnerMessages.contactId,at:sql<Date>`max(${partnerMessages.sentAt})`}).from(partnerMessages).where(and(eq(partnerMessages.status,'sent'),eq(partnerMessages.personal,true),partnerMailVisible(access.email))).groupBy(partnerMessages.contactId),
 db.select({email:emailInbox.fromEmail,at:sql<Date>`max(${emailInbox.receivedAt})`}).from(emailInbox).where(mailZichtbaarVoor(access.email)).groupBy(emailInbox.fromEmail),
 ]):[[],[]];
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Madrid'});
 const data=rows.map(r=>{const out=sent.find(m=>m.contactId===r.contact.id)?.at;const inc=incoming.filter(m=>m.email?.toLowerCase()===r.contact.email?.toLowerCase()).map(m=>m.at).filter(Boolean).sort((a,b)=>+new Date(b)-+new Date(a))[0];return {...r,state:conversationState(inc?new Date(inc):null,out?new Date(out):null),out,due:!!r.profile?.nextActionOn&&r.profile.nextActionOn<=today,interested:r.profile?['interested','candidate'].includes(r.profile.interest):!!r.contact.tags?.includes('rol:wederverkoper')};});
 const visible=data.filter(r=>(!s.q||`${r.contact.name} ${r.company} ${r.contact.email}`.toLowerCase().includes(s.q.toLowerCase()))&&(!s.filter||s.filter==='due'&&r.due||s.filter==='reply'&&r.state==='Antwoord nodig'||s.filter==='interested'&&r.interested||s.filter==='new'&&!r.out||s.filter==='active'&&r.profile?.active));
 return <div className="space-y-6"><PageHeader title="Beursopvolging" subtitle="Van het eerste gesprek naar een verkooppunt. Eén dossier voor mails, afspraken en de volgende stap." actions={<LinkButton href="/beurs/contacten">Beurscontacten & kaart</LinkButton>}/><div className="grid gap-3 sm:grid-cols-4"><StatTile label="Beurscontacten" value={data.length}/><StatTile label="Verkooppuntinteresse" value={data.filter(r=>r.interested).length}/><StatTile label="Antwoord nodig" value={data.filter(r=>r.state==='Antwoord nodig').length}/><StatTile label="Opvolgen t/m vandaag" value={data.filter(r=>r.due).length}/></div>
 <Card><CardContent><div className="flex flex-wrap items-start justify-between gap-4"><form className="flex flex-wrap gap-2"><input aria-label="Zoek bedrijf of contact" name="q" defaultValue={s.q} placeholder="Zoek bedrijf of contact…" className="rounded-lg border px-3 py-2"/><select aria-label="Filter" name="filter" defaultValue={s.filter??''} className="rounded-lg border px-3 py-2">{Object.entries({'':'Iedereen',interested:'Verkooppuntinteresse',reply:'Antwoord nodig',due:'Nu opvolgen',new:'Nog geen persoonlijke mail',active:'Officiële verkooppunten'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="rounded-lg border px-4 py-2">Filteren</button></form>{canMail&&access.heeftCap('schrijven')&&<SyncButton/>}</div><p className="mt-3 text-sm text-neutral-500">Automatische informatie- en filmmails tellen niet als persoonlijke opvolging. Antwoorden uit Verzonden worden gekoppeld aan het exacte contactadres.</p></CardContent></Card>
 <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-neutral-50"><tr>{['Contact / bedrijf','Interesse & fase','Gesprek','Volgende stap','Eigenaar'].map(t=><th className="px-5 py-3" key={t}>{t}</th>)}</tr></thead><tbody>{visible.map(r=><tr className="border-b last:border-0 hover:bg-neutral-50" key={r.contact.id}><td className="px-5 py-4"><Link className="font-semibold underline-offset-4 hover:underline" href={`/beurs/opvolging/${r.contact.id}`}>{r.contact.name}</Link><p className="text-neutral-500">{r.company??r.contact.email}</p></td><td className="px-5 py-4">{INTEREST[(r.profile?.interest??(r.interested?'interested':'unknown')) as keyof typeof INTEREST]}<p className="text-neutral-500">{STAGES[(r.profile?.stage??'new') as keyof typeof STAGES]}</p></td><td className="px-5 py-4">{canMail?r.state:'—'}{r.out&&<p className="text-neutral-500">Gemaild {new Date(r.out).toLocaleDateString('nl-NL')}</p>}</td><td className={`px-5 py-4 ${r.due?'font-medium text-amber-800':''}`}>{r.profile?.nextAction??'Nog bepalen'}<p>{r.profile?.nextActionOn}</p></td><td className="px-5 py-4">{r.owner??'Niet toegewezen'}</td></tr>)}</tbody></table>{!visible.length&&<p className="p-8 text-neutral-500">Geen contacten bij dit filter.</p>}</div></Card></div>;
}
