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

type TeamTaskRow = { id: string; createdAt: Date; authorId: string | null; subject: string | null; contactId: string | null; completedAt: Date | null; assigneeId: string | null };

/**
 * Een teambericht met taak maakt één kopie per collega (zelfde auteur, onderwerp,
 * klant en created_at — zie lib/agenda-task-completion.ts). De Apple-agenda is
 * één gedeelde teamagenda: daar hoort zo'n taak één keer in te staan, met alle
 * namen erbij, niet vijf keer.
 *
 * Per groep blijft één kopie zichtbaar: de open kopie met het laagste id (stabiel
 * zolang de groep niet verandert); de rest gaat uit de Apple-agenda.
 */
export function teamTaskGroups(rows: TeamTaskRow[], teamTaskIds: Set<string>) {
  const groups = new Map<string, TeamTaskRow[]>();
  for (const r of rows) {
    if (!teamTaskIds.has(r.id)) continue;
    const key = [r.createdAt.getTime(), r.authorId ?? "", r.subject ?? "", r.contactId ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const hidden = new Set<string>();
  const assignees = new Map<string, string[]>();
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    const open = copies.filter((c) => !c.completedAt);
    const rep = (open.length ? open : copies).map((c) => c.id).sort()[0];
    for (const c of copies) if (c.id !== rep) hidden.add(c.id);
    assignees.set(rep, [...new Set(copies.flatMap((c) => (c.assigneeId ? [c.assigneeId] : [])))]);
  }
  return { hidden, assignees };
}
