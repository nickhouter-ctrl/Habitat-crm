import Link from "next/link";
import { CalendarDays, ArrowRight, CheckSquare } from "lucide-react";
import { datumTaal, tekst } from "@/lib/i18n/server";
import type { StaffAgendaItem } from "@/lib/staff-notification-email";
import { AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { completeAppointment, completeTask } from "@/app/(app)/agenda/actions";
import { Card, CardContent, CardHeader, CardTitle, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function TodayAgenda({ items, readOnly, hasDailyTasks = false }: { items: StaffAgendaItem[]; readOnly: boolean; hasDailyTasks?: boolean }) {
  const t=await tekst(),locale=await datumTaal();
  return <Card><CardHeader><CardTitle>{t("Jouw dagplanning")}</CardTitle><Link href="/agenda" className="inline-flex items-center gap-1 text-xs text-accent">{t("Open agenda")}<ArrowRight size={14}/></Link></CardHeader><CardContent>
    {items.length===0 ? <div className="py-7 text-center"><CalendarDays className="mx-auto mb-3 size-7 text-accent/70"/><p className="font-medium">{t(hasDailyTasks ? "Geen afspraken of losse taken gepland" : "Niets gepland voor vandaag")}</p><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{t(hasDailyTasks ? "Je dagelijkse werkzaamheden staan bij Dagelijkse taken. Plan hier je afspraken en extra taken." : "Bekijk je open taken of plan je volgende afspraak. Klantvragen vind je bij Opvolging.")}</p>{!readOnly&&<LinkButton href="/agenda?add=1" variant="secondary" className="mt-4">{t("Afspraak / taak toevoegen")}</LinkButton>}</div> : <div className="divide-y">{items.map(item=><div key={item.id} className="flex items-start gap-4 py-4 first:pt-1 last:pb-1">
      <span className={`w-14 shrink-0 pt-1 text-sm font-semibold tabular-nums ${item.overdue?'text-warning':'text-muted'}`}>{item.overdue?item.at.toLocaleDateString(locale,{timeZone:AGENDA_TIME_ZONE,day:'numeric',month:'short'}):item.at.toLocaleTimeString(locale,{timeZone:AGENDA_TIME_ZONE,hour:'2-digit',minute:'2-digit'})}</span>
      <span className="mt-1 text-accent">{item.kind==='appointment'?<CalendarDays size={17}/>:<CheckSquare size={17}/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{['Opvolging','Beursopvolging'].includes(item.title)?item.body||item.title:item.title}</p><p className="mt-1 text-xs text-muted">{t(item.overdue?'Achterstallig':item.kind==='appointment'?'Afspraak':'Taak')}{item.location?` · ${item.location}`:''}</p>{item.contactId&&<Link href={`/opvolging/${item.contactId}`} className="mt-1 inline-block text-xs text-accent">{item.contactName??t("Klantdossier")}</Link>}</div>
      {!readOnly&&<form action={(item.kind==='appointment'?completeAppointment:completeTask).bind(null,item.id)}><SubmitButton size="sm" variant="secondary" pendingLabel="…" title={t("Afronden")}>✓ {t("Afronden")}</SubmitButton></form>}
    </div>)}</div>}
  </CardContent></Card>;
}
