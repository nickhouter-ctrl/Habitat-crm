import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, contacts } from "@/lib/db/schema";
import { salesTaskAccess } from "@/lib/auth/sales-scope";
import { requireModuleRead } from "@/lib/auth/guards";
import { datumTaal, tekst as uiTranslation } from "@/lib/i18n/server";
import { AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { taakTitel } from "@/lib/taak-titel";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { completeTask } from "../../actions";

export async function generateMetadata(){return {title:(await uiTranslation())("Taak afvinken")};}

/**
 * Bestemming van de knop "Afvinken" in de dagmail. Bewust een bevestigingsstap
 * met een POST: mailscanners openen links vooraf, en een GET mag nooit een taak
 * afronden.
 */
export default async function Page({params}:{params:Promise<{id:string}>}){
  const user=await requireModuleRead("agenda"),uiT=await uiTranslation(),locale=await datumTaal();
  const id=z.string().uuid().safeParse((await params).id);
  if(!id.success)notFound();
  const [task]=await db.select({id:activities.id,subject:activities.subject,body:activities.body,dueAt:activities.dueAt,completedAt:activities.completedAt,contactId:activities.contactId,contactName:contacts.name})
    .from(activities).leftJoin(contacts,eq(contacts.id,activities.contactId))
    .where(and(eq(activities.id,id.data),eq(activities.type,"task"),salesTaskAccess(user.rol,user.id)));
  if(!task)notFound();
  const when=task.dueAt?task.dueAt.toLocaleString(locale,{timeZone:AGENDA_TIME_ZONE,weekday:"short",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}):null;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={uiT("Taak afvinken")}/>
      <Card className="grid gap-3 p-5">
        <h2 className="text-lg font-semibold">{taakTitel(task.subject,uiT)}</h2>
        {(task.contactName||when)&&<p className="text-sm text-muted">{[task.contactName,when].filter(Boolean).join(" · ")}</p>}
        {task.body&&<p className="whitespace-pre-wrap text-sm">{task.body}</p>}
        {task.completedAt
          ?<p className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success">{uiT("Afgevinkt. Deze taak komt niet meer in je dagmail.")}</p>
          :user.heeftCap("schrijven")&&<form action={completeTask.bind(null,task.id)}>
            <SubmitButton pendingLabel="…">✓ {uiT("Afvinken")}</SubmitButton>
            <p className="mt-2 text-xs text-muted">{uiT("Was dit een taak voor het hele team? Dan is hij voor iedereen afgerond.")}</p>
          </form>}
        <div className="flex flex-wrap gap-4 text-sm">
          {task.contactId&&<Link className="underline" href={`/opvolging/${task.contactId}`}>{uiT("Open het klantdossier")}</Link>}
          <Link className="underline" href="/agenda">{uiT("Open je agenda")}</Link>
        </div>
      </Card>
    </div>
  );
}
