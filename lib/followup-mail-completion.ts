import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { FOLLOWUP_DONE } from "@/lib/followup-checklist";
import { agendaDay } from "@/lib/agenda-dates";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Only called after confirmed SMTP delivery, inside the sent-mail transaction.
 * A later scheduled action stays open and brings the dossier back on its due day. */
export async function completeFollowupAfterMail(tx:Tx,contactId:string,authorId:string,now:Date){
  await tx.insert(activities).values({contactId,type:'note',subject:FOLLOWUP_DONE,body:'Huidige opvolging automatisch afgehandeld na bevestigde verzending van een persoonlijke mail.',authorId,createdAt:now,updatedAt:now});
  await tx.update(activities).set({completedAt:now,updatedAt:now}).where(and(eq(activities.contactId,contactId),eq(activities.type,'task'),inArray(activities.subject,['Opvolging','Beursopvolging']),isNull(activities.completedAt),or(isNull(activities.dueAt),sql`(${activities.dueAt} at time zone 'Europe/Madrid')::date <= ${agendaDay(now)}::date`)));
}
