import { ActionDialog } from "@/components/action-dialog";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CheckSquare } from "lucide-react";
import { z } from "zod";
import { db } from "@/lib/db";
import { taakTitel } from "@/lib/taak-titel";
import { activities, appointments, contacts, users } from "@/lib/db/schema";
import { salesTaskFilter } from "@/lib/auth/sales-scope";
import { requireModuleRead } from "@/lib/auth/guards";
import { datumTaal, tekst as uiTranslation } from "@/lib/i18n/server";
import { AGENDA_TIME_ZONE, agendaDay, agendaDateTime, agendaRange, adjacentPeriod, validDay } from "@/lib/agenda-dates";
import { Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { WorkflowModal } from "@/components/workflow-modal";
import { AgendaDetailTabs } from "./detail-tabs";
import { AgendaAddForms } from "./forms";
import { completeAppointment, completeTask, deleteAppointment, deleteTask, reopenAppointment, reopenTask } from "./actions";
export async function generateMetadata(){return {title:(await uiTranslation())("Agenda")};}
type ApptRow={id:string;title:string;startsAt:Date;location:string|null;notes:string|null;contactId:string|null;contactName:string|null;contactPhone:string|null;assigneeName:string|null;completedAt:Date|null};
type TaskRow={id:string;subject:string|null;body:string|null;dueAt:Date|null;contactId:string|null;contactName:string|null;priority:"hoog"|"middel"|"laag";assigneeName:string|null;completedAt:Date|null};
type Item={kind:"appt";at:Date;data:ApptRow}|{kind:"task";at:Date;data:TaskRow};
export default async function AgendaPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const user=await requireModuleRead("agenda"),uiT=await uiTranslation(),locale=await datumTaal(),sp=await searchParams;
 const today=agendaDay(new Date()),day=validDay(sp.date)?sp.date:today,view=sp.view==='month'?'month':'week';
 const owner=user.rol==='sales'?'mine':sp.owner==='all'?'all':z.string().uuid().safeParse(sp.owner).success?sp.owner as string:'mine';
 const ownerId=owner==='mine'?user.id:owner==='all'?null:owner;
 const kind=sp.kind==='task'?'task':sp.kind==='appt'?'appt':'all',showDone=sp.done==='1',write=user.heeftCap('schrijven');
 const range=agendaRange(day,view),todayStart=agendaDateTime(today)!;
 const href=(changes:Record<string,string>)=>`/agenda?${new URLSearchParams({date:day,view,owner,kind,done:showDone?'1':'0',...changes})}`;
 const assignee=alias(users,'agenda_owner'),creator=alias(users,'agenda_creator');
 const [apptRows,taskRows,team]=await Promise.all([
  kind==='task'?[]:db.select({id:appointments.id,title:appointments.title,startsAt:appointments.startsAt,location:appointments.location,notes:appointments.notes,contactId:appointments.contactId,contactName:contacts.name,contactPhone:contacts.phone,assigneeName:sql<string|null>`coalesce(${assignee.name},${creator.name})`,completedAt:appointments.completedAt}).from(appointments).leftJoin(contacts,eq(contacts.id,appointments.contactId)).leftJoin(assignee,eq(assignee.id,appointments.assigneeId)).leftJoin(creator,eq(creator.id,appointments.createdBy)).where(and(gte(appointments.startsAt,range.start),lt(appointments.startsAt,range.end),showDone?undefined:and(isNull(appointments.completedAt),eq(appointments.status,'scheduled')),ownerId?sql`coalesce(${appointments.assigneeId},${appointments.createdBy})=${ownerId}::uuid`:undefined)).orderBy(asc(appointments.startsAt)),
  kind==='appt'?[]:db.select({id:activities.id,subject:activities.subject,body:activities.body,dueAt:activities.dueAt,contactId:activities.contactId,contactName:contacts.name,priority:activities.priority,assigneeName:sql<string|null>`coalesce(${assignee.name},${creator.name})`,completedAt:activities.completedAt}).from(activities).leftJoin(contacts,eq(contacts.id,activities.contactId)).leftJoin(assignee,eq(assignee.id,activities.assigneeId)).leftJoin(creator,eq(creator.id,activities.authorId)).where(and(salesTaskFilter(user.rol),eq(activities.type,'task'),showDone?undefined:isNull(activities.completedAt),ownerId?sql`coalesce(${activities.assigneeId},${activities.authorId})=${ownerId}::uuid`:undefined,or(and(gte(activities.dueAt,range.start),lt(activities.dueAt,range.end)),and(isNull(activities.completedAt),or(isNull(activities.dueAt),lt(activities.dueAt,todayStart)))),sql`not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from partner_profiles p where p.contact_id=${activities.contactId} and p.stage='stopped')) and not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from contacts c where c.id=${activities.contactId} and coalesce(c.tags,'{}'::text[]) @> array['opvolging:uitgesloten']))`)).orderBy(asc(activities.dueAt)),
  db.select({id:users.id,name:users.name,email:users.email,role:users.role}).from(users).where(user.rol==='sales'?eq(users.id,user.id):undefined).orderBy(asc(users.name)),
 ]);
 const overdue=taskRows.filter(t=>!t.completedAt&&t.dueAt&&t.dueAt<todayStart),undated=taskRows.filter(t=>!t.completedAt&&!t.dueAt),byDay=new Map<string,Item[]>();
 const push=(key:string,item:Item)=>{if(range.days.includes(key))byDay.set(key,[...(byDay.get(key)??[]),item]);};
 for(const a of apptRows)push(agendaDay(a.startsAt),{kind:'appt',at:a.startsAt,data:a});
 for(const t of taskRows)if(t.dueAt)push(agendaDay(t.dueAt),{kind:'task',at:t.dueAt,data:t});
 for(const list of byDay.values())list.sort((a,b)=>a.at.getTime()-b.at.getTime());
 const selected=byDay.get(day)??[],time=(at:Date)=>at.toLocaleTimeString(locale,{timeZone:AGENDA_TIME_ZONE,hour:'2-digit',minute:'2-digit'});
 const dateLabel=(d:string,options:Intl.DateTimeFormatOptions)=>new Date(`${d}T12:00:00Z`).toLocaleDateString(locale,options);
 return <><PageHeader title={uiT("Agenda")} subtitle={uiT("Jouw afspraken, taken en klantopvolging op één plek.")} actions={write?<Link href={href({add:'1'})+'#toevoegen'} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"><Plus size={16}/>{uiT("Afspraak / taak toevoegen")}</Link>:undefined}/>
 <div className="mb-4"><ActionDialog title={uiT("Zo werkt de opvolging")}><ol className="mt-3 grid gap-3 text-sm text-muted md:grid-cols-3"><li><strong className="block text-foreground">{uiT("1. Wijs toe")}</strong>{uiT("Kies een verantwoordelijke en beschrijf precies wat er moet gebeuren.")}</li><li><strong className="block text-foreground">{uiT("2. Plan de actie")}</strong>{uiT("Leg een datum vast. De medewerker krijgt een e-mail en ziet de taak in de agenda.")}</li><li><strong className="block text-foreground">{uiT("3. Rond af")}</strong>{uiT("Vink de taak af na uitvoering. Klantopvolging wordt ook in het dossier afgehandeld.")}</li></ol><p className="mt-3 text-xs text-muted">{uiT("Iedere ochtend om 08:00 ontvangt iedereen met open acties zijn eigen overzicht. Achterstallige taken blijven zichtbaar. Tijdzone: Madrid.")}</p></ActionDialog></div>
 <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><Link href={href({date:adjacentPeriod(day,view,-1)})} aria-label={uiT("Vorige periode")} className="rounded-lg border p-2 hover:bg-accent/10"><ChevronLeft size={16}/></Link><Link href={href({date:today})} className="rounded-lg border px-3 py-2 text-sm font-medium">{uiT("Vandaag")}</Link><Link href={href({date:adjacentPeriod(day,view,1)})} aria-label={uiT("Volgende periode")} className="rounded-lg border p-2 hover:bg-accent/10"><ChevronRight size={16}/></Link><h2 className="ml-2 text-sm font-semibold capitalize sm:text-base">{view==='month'?dateLabel(day,{month:'long',year:'numeric'}):`${dateLabel(range.days[0],{day:'numeric',month:'short'})} – ${dateLabel(range.days[6],{day:'numeric',month:'short',year:'numeric'})}`}</h2></div><div className="flex rounded-lg border p-1">{(['week','month'] as const).map(v=><Link key={v} href={href({view:v})} aria-current={v===view?'page':undefined} className={`rounded-md px-4 py-1.5 text-sm ${v===view?'bg-accent text-accent-foreground':'text-muted hover:bg-background'}`}>{uiT(v==='week'?"Week":"Maand")}</Link>)}</div></div>
 <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/40 px-5 py-3"><span className="text-sm text-muted">{owner==='mine'?uiT("Mijn agenda"):owner==='all'?uiT("Hele team"):team.find(u=>u.id===owner)?.name} · {uiT(kind==='task'?"Alleen taken":kind==='appt'?"Alleen afspraken":"Afspraken en taken")}{showDone?' · '+uiT("Ook afgerond"):''}</span><ActionDialog title={uiT("Agenda aanpassen")} trigger={uiT("Datum & filters")}><form className="flex flex-wrap items-end gap-3 border-b border-border bg-background/40 px-4 py-3"><input type="hidden" name="view" value={view}/><label className="grid gap-1 text-xs text-muted">{uiT("Ga naar datum")}<input name="date" type="date" defaultValue={day} className="rounded-lg border bg-surface px-3 py-2 text-sm text-foreground"/></label><label className="grid min-w-40 gap-1 text-xs text-muted">{uiT("Medewerker")}<Select name="owner" defaultValue={owner}><option value="mine">{uiT("Mijn agenda")}</option>{user.rol!=='sales'&&<option value="all">{uiT("Hele team")}</option>}{team.map(u=><option key={u.id} value={u.id}>{u.name??u.email}</option>)}</Select></label><label className="grid gap-1 text-xs text-muted">{uiT("Toon")}<Select name="kind" defaultValue={kind}><option value="all">{uiT("Afspraken en taken")}</option><option value="appt">{uiT("Alleen afspraken")}</option><option value="task">{uiT("Alleen taken")}</option></Select></label><label className="flex items-center gap-2 py-2 text-xs"><input name="done" type="checkbox" value="1" defaultChecked={showDone}/>{uiT("Ook afgerond")}</label><button className="rounded-lg border bg-surface px-4 py-2 text-sm font-medium hover:bg-accent/10">{uiT("Toepassen")}</button><span className="ml-auto flex items-center gap-3 pb-2 text-xs text-muted"><span className="flex items-center gap-1"><CalendarDays size={13} className="text-info"/>{uiT("Afspraak")}</span><span className="flex items-center gap-1"><CheckSquare size={13} className="text-accent"/>{uiT("Taak")}</span></span></form></ActionDialog></div>
 <div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid grid-cols-7 border-b bg-background/40">{range.days.slice(0,7).map(d=><div key={d} className="py-2 text-center text-xs font-medium capitalize text-muted">{dateLabel(d,{weekday:'short'})}</div>)}</div><div className="grid grid-cols-7">{range.days.map(d=>{const list=byDay.get(d)??[];return <Link key={d} href={href({date:d})+'#dagdetails'} aria-label={dateLabel(d,{weekday:'long',day:'numeric',month:'long'})} aria-current={d===day?'date':undefined} className={`min-h-28 border-b border-r border-border p-2 transition-colors hover:bg-accent/5 ${view==='week'?'min-h-56':''} ${d===day?'bg-accent/10 ring-1 ring-inset ring-accent':''} ${view==='month'&&d.slice(0,7)!==day.slice(0,7)?'bg-background/60 text-muted':''}`}><span className={`mb-2 inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${d===today?'bg-accent text-accent-foreground':''}`}>{Number(d.slice(-2))}</span>{list.slice(0,view==='week'?6:3).map(item=><div key={item.data.id} className={`mb-1 rounded-md border-l-2 px-2 py-1.5 text-[11px] ${item.data.completedAt?'border-success bg-success/10 opacity-70':item.kind==='appt'?'border-info bg-info/10':'border-accent bg-accent/10'}`}><span className="block font-semibold tabular-nums">{time(item.at)}</span><span className="line-clamp-2 leading-4">{item.kind==='appt'?item.data.title:item.data.body||item.data.subject}</span>{owner==='all'&&item.data.assigneeName&&<span className="mt-1 block truncate text-[10px] text-muted">{item.data.assigneeName}</span>}</div>)}{list.length>(view==='week'?6:3)&&<span className="text-[10px] font-semibold text-accent">{uiT("Nog {n} meer",{n:list.length-(view==='week'?6:3)})}</span>}</Link>;})}</div></div></div></Card>
 <AgendaDetailTabs counts={{day:selected.length,overdue:overdue.length,undated:undated.length}} day={<><h2 className="mb-3 text-sm font-semibold capitalize">{dateLabel(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h2><div className="grid gap-3 lg:grid-cols-2">{selected.length?selected.map(item=>item.kind==='appt'?<ApptCard key={item.data.id} appt={item.data} write={write}/>:<TaskCard key={item.data.id} task={item.data} write={write}/>):<EmptyState title={uiT("Niets gepland op deze dag")} description={uiT("Kies een andere datum of voeg een afspraak of taak toe.")}/>}</div></>} overdue={<div className="grid gap-3 lg:grid-cols-2">{overdue.length?overdue.map(t=><TaskCard key={t.id} task={t} overdue write={write}/>):<EmptyState title={uiT("Geen achterstallige taken")} description={uiT("Je bent bij met de taken met een deadline.")}/>}</div>} undated={<><p className="mb-3 text-xs text-muted">{uiT("Zonder datum verschijnt een taak niet in de kalender of het ochtendoverzicht.")}</p><div className="grid gap-3 lg:grid-cols-2">{undated.map(t=><TaskCard key={t.id} task={t} write={write}/>)}</div></>}/>
 {write&&sp.add==='1'&&<WorkflowModal title={uiT("Afspraak / taak toevoegen")} closeHref={href({})}><AgendaAddForms submissionIds={{task:randomUUID(),appointment:randomUUID()}} team={team.filter(u=>u.role!=='viewer')} day={day} userId={user.id}/></WorkflowModal>}
 </>;
}

async function ApptCard({ appt: a, write }: { appt: ApptRow; write: boolean }) {
  const uiDateLocale = await datumTaal();
  const TIME_FMT = new Intl.DateTimeFormat(uiDateLocale, { timeZone: AGENDA_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const uiT = await uiTranslation();
  return (
    <Card className="flex items-start gap-4 p-4">
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <div className="w-12 text-center text-lg font-semibold tabular-nums">
          {TIME_FMT.format(a.startsAt)}
        </div>
        {write && <form action={(a.completedAt ? reopenAppointment : completeAppointment).bind(null, a.id)}>
          <SubmitButton
            size="sm"
            variant="ghost"
            pendingLabel="…"
            className="size-6 rounded-full border p-0 text-xs hover:bg-success/10 hover:text-success"
            title={uiT(a.completedAt ? "Heropenen" : "Afronden")}
          >
            {a.completedAt ? "↺" : "✓"}
          </SubmitButton>
        </form>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{a.title}</p>
          <Badge tone={a.completedAt ? "success" : "info"}>{uiT(a.completedAt ? "Afgerond" : "Afspraak")}</Badge>
        </div>
        {a.location && <p className="text-xs text-muted">{a.location}</p>}
        {a.notes && <p className="mt-1 whitespace-pre-line text-sm">{a.notes}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {a.assigneeName && <span className="font-medium text-foreground/80">👤 {a.assigneeName}</span>}
          {a.contactId && (
            <Link href={`/contacts/${a.contactId}`} className="text-accent hover:underline">
              {a.contactName ?? uiT("contact")}
            </Link>
          )}
          {a.contactPhone && (
            <a href={`tel:${a.contactPhone}`} className="text-muted hover:underline">
              {a.contactPhone}
            </a>
          )}
          {write && <form action={deleteAppointment.bind(null, a.id)} className="ml-auto">
            <ConfirmSubmit message={uiT("Afspraak verwijderen?")} className="text-muted hover:text-danger" pendingLabel="…">
              {uiT("Verwijderen")} </ConfirmSubmit>
          </form>}
        </div>
      </div>
    </Card>
  );
}

async function TaskCard({ task: t, overdue = false, write }: { task: TaskRow; overdue?: boolean; write: boolean }) {
  const uiDateLocale = await datumTaal();
  const DAY_FMT = new Intl.DateTimeFormat(uiDateLocale, { timeZone: AGENDA_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
  const TIME_FMT = new Intl.DateTimeFormat(uiDateLocale, { timeZone: AGENDA_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const uiT = await uiTranslation();
  return (
    <Card className={`flex items-start gap-3 p-4 ${overdue ? "border-danger/40" : ""}`}>
      {write && <form action={(t.completedAt ? reopenTask : completeTask).bind(null, t.id)} className="pt-0.5">
        <SubmitButton
          size="sm"
          variant="ghost"
          pendingLabel="…"
          className="size-6 rounded-full border p-0 text-xs hover:bg-success/10 hover:text-success"
          title={uiT(t.completedAt ? "Heropenen" : "Afronden")}
        >
          {t.completedAt ? "↺" : "✓"}
        </SubmitButton>
      </form>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{taakTitel(t.subject, uiT)}</p>
          <span className="flex shrink-0 items-center gap-1.5">
            {t.priority === "hoog" && <Badge tone="danger">{uiT("Hoog")}</Badge>}
            {t.priority === "laag" && <Badge tone="neutral">{uiT("Laag")}</Badge>}
            <Badge tone={t.completedAt ? "success" : overdue ? "danger" : "warning"}>{uiT(t.completedAt ? "Afgerond" : "Taak")}</Badge>
          </span>
        </div>
        {t.body && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{t.body}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {t.assigneeName && <span className="font-medium text-foreground/80">👤 {t.assigneeName}</span>}
          {t.dueAt && (
            <span className={overdue ? "font-medium text-danger" : "text-muted"}>
              {DAY_FMT.format(t.dueAt)} · {TIME_FMT.format(t.dueAt)}
            </span>
          )}
          {t.contactId && (
            <Link href={`/opvolging/${t.contactId}`} className="text-accent hover:underline">
              {t.contactName ?? uiT("contact")}
            </Link>
          )}
          {write && !['Opvolging','Beursopvolging'].includes(t.subject??'') && <form action={deleteTask.bind(null, t.id)} className="ml-auto">
            <ConfirmSubmit message={uiT("Taak verwijderen?")} className="text-muted hover:text-danger" pendingLabel="…">
              {uiT("Verwijderen")} </ConfirmSubmit>
          </form>}
        </div>
      </div>
    </Card>
  );
}
