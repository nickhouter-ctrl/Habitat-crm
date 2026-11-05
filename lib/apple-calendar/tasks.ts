import { sql } from "drizzle-orm";
import { activities } from "@/lib/db/schema";
import { eventSchema, type CalendarEvent } from "./events";

/** Same exclusions as the CRM agenda: stopped or explicitly excluded follow-ups. */
export const visibleAgendaTask = sql<boolean>`not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from partner_profiles p where p.contact_id=${activities.contactId} and p.stage='stopped')) and not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from contacts c where c.id=${activities.contactId} and coalesce(c.tags,'{}'::text[]) @> array['opvolging:uitgesloten']))`;

/** Tasks are a calendar view of CRM workflow; never complete them via a deletion. */
export function fromTask(task: { subject: string | null; body: string | null; dueAt: Date | null }): CalendarEvent | null {
  if (!task.dueAt) return null;
  return eventSchema.parse({ title: (task.subject || "Taak").replace(/[\r\n\0]/g, " ").slice(0, 250),
    startsAt: task.dueAt, endsAt: new Date(+task.dueAt + 15 * 60000), allDay: false,
    location: "", notes: task.body || "", cancelled: false });
}
