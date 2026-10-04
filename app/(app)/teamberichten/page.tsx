import { randomUUID } from "node:crypto";
import Link from "next/link";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { MessageSquare, Plus, ArrowUpRight, CheckCheck } from "lucide-react";
import { z } from "zod";
import { requireModuleRead } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { contacts, staffMessages, users } from "@/lib/db/schema";
import { datumTaal, tekst } from "@/lib/i18n/server";
import { agendaDay, AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { WorkflowModal } from "@/components/workflow-modal";
import { TeamMessageForm, TeamMessageReadReceipt } from "./forms";

export async function generateMetadata(){ return { title: (await tekst())("Teamberichten") }; }
export default async function TeamMessagesPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const user = await requireModuleRead("teamberichten"), t = await tekst(), locale = await datumTaal(), sp = await searchParams;
  const uuid = (v: unknown) => z.string().uuid().safeParse(v).success ? v as string : null;
  const selectedId = uuid(sp.bericht), contactId = uuid(sp.klant), recipientId = uuid(sp.medewerker), sent = sp.map === "sent";
  const sender = alias(users,"message_sender"), recipient = alias(users,"message_recipient");
  const columns = { id:staffMessages.id, subject:staffMessages.subject, body:staffMessages.body, createdAt:staffMessages.createdAt, readAt:staffMessages.readAt, senderId:staffMessages.senderId, recipientId:staffMessages.recipientId, senderName:sender.name, recipientName:recipient.name, contactId:staffMessages.contactId, contactName:contacts.name, taskId:staffMessages.taskId };
  const query = () => db.select(columns).from(staffMessages).leftJoin(sender,eq(sender.id,staffMessages.senderId)).leftJoin(recipient,eq(recipient.id,staffMessages.recipientId)).leftJoin(contacts,eq(contacts.id,staffMessages.contactId));
  const [rows, selectedRows, team, linkedContact] = await Promise.all([
    query().where(eq(sent?staffMessages.senderId:staffMessages.recipientId,user.id)).orderBy(desc(staffMessages.createdAt)).limit(100),
    selectedId ? query().where(and(eq(staffMessages.id,selectedId),or(eq(staffMessages.senderId,user.id),eq(staffMessages.recipientId,user.id)))) : [],
    db.select({id:users.id,name:users.name,email:users.email}).from(users).where(sqlWritable()).orderBy(asc(users.name)),
    contactId ? db.select({id:contacts.id,name:contacts.name}).from(contacts).where(eq(contacts.id,contactId)) : [],
  ]);
  const selected = selectedRows[0] ?? (!selectedId && !sp.nieuw && !contactId ? rows[0] : null);
  const format = (at:Date) => at.toLocaleString(locale,{timeZone:AGENDA_TIME_ZONE,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  return <><PageHeader title={t("Teamberichten")} subtitle={t("Spreek duidelijk af wie wat doet. Koppel een klant en een deadline aan de taak.")} actions={user.heeftCap("schrijven")&&<Link href="/teamberichten?nieuw=1" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"><Plus size={16}/>{t("Nieuw bericht / taak")}</Link>}/>
    <div className="mb-5 flex flex-wrap items-center gap-2"><Link href="/teamberichten" className={`rounded-lg px-4 py-2 text-sm ${!sent?"bg-accent/10 font-semibold text-accent":"text-muted hover:bg-surface"}`}>{t("Ontvangen")}</Link><Link href="/teamberichten?map=sent" className={`rounded-lg px-4 py-2 text-sm ${sent?"bg-accent/10 font-semibold text-accent":"text-muted hover:bg-surface"}`}>{t("Verzonden")}</Link><p className="ml-auto text-xs text-muted">{t("Het bericht is privé. Een gekoppelde taak is zichtbaar in de teamagenda.")}</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[350px_1fr]"><Card><CardHeader><CardTitle>{t(sent?"Verzonden berichten":"Jouw berichten")}</CardTitle><Badge>{rows.length}</Badge></CardHeader><div className="max-h-[65vh] overflow-y-auto divide-y divide-border">{rows.length ? rows.map(m=><Link key={m.id} href={`/teamberichten?map=${sent?"sent":"inbox"}&bericht=${m.id}`} className={`block space-y-2 px-4 py-4 hover:bg-accent/5 ${selected?.id===m.id?"bg-accent/10":""}`}><div className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${!m.readAt?"bg-accent":"bg-border"}`}/><span className="truncate text-sm font-semibold">{sent?m.recipientName:m.senderName}</span><span className="ml-auto whitespace-nowrap text-[10px] text-muted">{format(m.createdAt)}</span></div><p className="truncate text-sm font-medium">{m.subject}</p>{m.contactName&&<p className="truncate text-xs text-muted">{m.contactName}</p>}<p className="line-clamp-2 text-xs leading-relaxed text-muted">{m.body}</p></Link>):<div className="px-5 py-10 text-center"><MessageSquare className="mx-auto mb-3 text-muted" size={26}/><p className="text-sm text-muted">{t("Nog geen teamberichten.")}</p></div>}</div></Card>
    {selected ? <Card><CardHeader><div><p className="mb-2 text-xs text-muted">{selected.senderName} → {selected.recipientName} · {format(selected.createdAt)}</p><CardTitle>{selected.subject}</CardTitle></div>{selected.readAt&&<Badge tone="success"><CheckCheck size={12}/>{t("Gelezen")}</Badge>}</CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-7">{selected.body}</p><div className="mt-6 flex flex-wrap items-center gap-3">{selected.contactId&&<Link href={`/opvolging/${selected.contactId}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-accent">{selected.contactName ?? t("Klantdossier")}<ArrowUpRight size={14}/></Link>}{selected.taskId&&<Link href="/agenda?owner=mine" className="rounded-lg border border-border px-3 py-2 text-sm">{t("Taak in de agenda")}</Link>}{user.heeftCap("schrijven")&&<Link href={`/teamberichten?nieuw=1&medewerker=${selected.senderId===user.id?selected.recipientId:selected.senderId}${selected.contactId?`&klant=${selected.contactId}`:""}`} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">{t("Antwoorden")}</Link>}</div></CardContent>{!selected.readAt&&selected.recipientId===user.id&&<TeamMessageReadReceipt id={selected.id}/>}</Card> : <Card><CardContent className="py-12 text-center"><MessageSquare size={28} className="mx-auto mb-3 text-muted"/><p className="text-sm text-muted">{t("Selecteer een bericht of maak een nieuw bericht / taak.")}</p></CardContent></Card>}
    </div>
    {user.heeftCap("schrijven")&&sp.nieuw==='1'&&<WorkflowModal title={t("Nieuw bericht / taak")} closeHref={sent?"/teamberichten?map=sent":"/teamberichten"}><TeamMessageForm submissionId={randomUUID()} team={team} today={agendaDay(new Date())} recipientId={recipientId ?? ""} contact={linkedContact[0] ?? null}/></WorkflowModal>}
    </>;
}
function sqlWritable(){ return or(eq(users.role,"admin"),eq(users.role,"agent"),eq(users.role,"marketing")); }
