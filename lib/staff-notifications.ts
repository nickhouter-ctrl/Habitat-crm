import "server-only";
import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, appointments, contacts, partnerProfiles, staffMessages, staffNotifications, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { agendaDateTime, agendaDay, shiftDay } from "@/lib/agenda-dates";
import { madridDelen } from "@/lib/tz-madrid";
import { magModule } from "@/lib/auth/modules";
import { staffNotificationEmail, type StaffAgendaItem, type StaffMailContent } from "@/lib/staff-notification-email";

import { isSystemMailRecipient } from "@/lib/mail-bcc";

const openFollowup = sql`not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from partner_profiles p where p.contact_id = ${activities.contactId} and p.stage = 'stopped')) and not (coalesce(${activities.subject},'') in ('Opvolging','Beursopvolging') and exists (select 1 from contacts c where c.id=${activities.contactId} and coalesce(c.tags,'{}'::text[]) @> array['opvolging:uitgesloten']))`;

export async function staffAgendaItems(userId: string, day: string): Promise<StaffAgendaItem[]> {
  const start = agendaDateTime(day)!, end = agendaDateTime(shiftDay(day, 1))!;
  const [tasks, meetings] = await Promise.all([
    db.select({ id: activities.id, title: activities.subject, body: activities.body, at: activities.dueAt, contactId: activities.contactId, contactName: contacts.name }).from(activities)
      .leftJoin(contacts, eq(activities.contactId, contacts.id)).where(and(eq(activities.type, "task"), isNull(activities.completedAt), sql`coalesce(${activities.assigneeId}, ${activities.authorId}) = ${userId}::uuid`, lt(activities.dueAt, end), openFollowup)).orderBy(asc(activities.dueAt)),
    db.select({ id: appointments.id, title: appointments.title, body: appointments.notes, at: appointments.startsAt, contactId: appointments.contactId, contactName: contacts.name, location: appointments.location }).from(appointments)
      .leftJoin(contacts, eq(appointments.contactId, contacts.id)).where(and(eq(appointments.status, "scheduled"), isNull(appointments.completedAt), sql`coalesce(${appointments.assigneeId}, ${appointments.createdBy}) = ${userId}::uuid`, sql`${appointments.startsAt} >= ${start.toISOString()}::timestamptz`, lt(appointments.startsAt, end))).orderBy(asc(appointments.startsAt)),
  ]);
  return [...tasks.filter(t => t.at).map(t => ({ ...t, title: t.title ?? "", at: t.at!, kind: "task" as const, overdue: agendaDay(t.at!) < day })), ...meetings.map(t => ({ ...t, kind: "appointment" as const }))].sort((a,b) => a.at.getTime()-b.at.getTime());
}

/** Unieke dag + medewerker, ook bij overlappende cron-aanroepen. Geen lege mail. */
export async function queueDailyAgenda(now = new Date()) {
  if (madridDelen(now).uur !== 8) return 0;
  const day = agendaDay(now), team = await db.select({ id: users.id, role: users.role, email: users.email }).from(users);
  let queued = 0;
  for (const user of team) {
    if (!magModule(user.role, "agenda") || !isSystemMailRecipient(user.email)) continue;
    const items = await staffAgendaItems(user.id, day);
    if (!items.length) continue;
    const rows = await db.insert(staffNotifications).values({ eventKey: `agenda:${day}:${user.id}`, kind: "daily_agenda", userId: user.id, day }).onConflictDoNothing().returning({ id: staffNotifications.id });
    queued += rows.length;
  }
  return queued;
}

async function currentContent(n: typeof staffNotifications.$inferSelect): Promise<StaffMailContent | null> {
  const [actor] = n.actorId ? await db.select({ name: users.name }).from(users).where(eq(users.id, n.actorId)) : [];
  if (n.kind === "daily_agenda") {
    if (!n.day || n.day !== agendaDay(new Date())) return null;
    const items = await staffAgendaItems(n.userId, n.day);
    return items.length ? { kind: n.kind, day: n.day, items } : null;
  }
  if (!n.entityId) return null;
  if (n.kind === "followup_assignment") {
    const [p] = await db.select({ ownerId: partnerProfiles.ownerId, stage: partnerProfiles.stage, title: partnerProfiles.nextAction, day: partnerProfiles.nextActionOn, contactName: contacts.name,tags:contacts.tags }).from(partnerProfiles).innerJoin(contacts, eq(contacts.id, partnerProfiles.contactId)).where(eq(partnerProfiles.contactId, n.entityId));
    return p && p.ownerId === n.userId && p.stage !== "stopped" && !p.tags?.includes("opvolging:uitgesloten") ? { kind: n.kind, actorName: actor?.name, title: p.title ?? undefined, at: p.day ? agendaDateTime(p.day, "17:00") : null, contactId: n.entityId, contactName: p.contactName } : null;
  }
  if (n.kind === "team_message") {
    const [m] = await db.select({ id: staffMessages.id, recipientId: staffMessages.recipientId, subject: staffMessages.subject, body: staffMessages.body, contactId: staffMessages.contactId, contactName: contacts.name, at:activities.dueAt }).from(staffMessages).leftJoin(activities,eq(activities.id,staffMessages.taskId)).leftJoin(contacts, eq(contacts.id, staffMessages.contactId)).where(eq(staffMessages.id, n.entityId));
    return m && m.recipientId === n.userId ? { kind: n.kind, messageId: m.id, actorName: actor?.name, title: m.subject, body: m.body, at:m.at, contactId: m.contactId, contactName: m.contactName } : null;
  }
  if (n.kind === "task_assignment") {
    const [t] = await db.select({ assigneeId: activities.assigneeId, authorId: activities.authorId, completedAt: activities.completedAt, title: activities.subject, body: activities.body, at: activities.dueAt, contactId: activities.contactId, contactName: contacts.name }).from(activities).leftJoin(contacts, eq(contacts.id, activities.contactId)).where(and(eq(activities.id, n.entityId), eq(activities.type, "task"), openFollowup));
    return t && (t.assigneeId ?? t.authorId) === n.userId && !t.completedAt ? { kind: n.kind, actorName: actor?.name, title: t.title ?? undefined, body: t.body, at: t.at, contactId: t.contactId, contactName: t.contactName } : null;
  }
  const [a] = await db.select({ assigneeId: appointments.assigneeId, status: appointments.status, completedAt: appointments.completedAt, title: appointments.title, body: appointments.notes, at: appointments.startsAt, contactId: appointments.contactId, contactName: contacts.name }).from(appointments).leftJoin(contacts, eq(contacts.id, appointments.contactId)).where(eq(appointments.id, n.entityId));
  return a && a.assigneeId === n.userId && a.status === "scheduled" && !a.completedAt ? { kind: n.kind, actorName: actor?.name, title: a.title, body: a.body, at: a.at, contactId: a.contactId, contactName: a.contactName } : null;
}

export async function deliverStaffNotifications(ids?: string[]) {
  if (process.env.CRM_EXTERNAL_EFFECTS === "disabled") return { sent: 0, skipped: 0, unknown: 0, pending: 0 };
  const now = new Date();
  // Een afgebroken request kan na SMTP-aanvaarding zijn gestopt: niet hersturen.
  await db.update(staffNotifications).set({ status: "unknown", lastError: "interrupted-delivery", updatedAt: now }).where(and(eq(staffNotifications.status, "sending"), lt(staffNotifications.claimedAt, new Date(now.getTime()-15*60_000))));
  const rows = await db.select().from(staffNotifications).where(and(eq(staffNotifications.status, "pending"), lte(staffNotifications.availableAt, now), ids ? inArray(staffNotifications.id, ids) : undefined)).orderBy(asc(staffNotifications.createdAt)).limit(20);
  const result = { sent: 0, skipped: 0, unknown: 0, pending: 0 };
  for (const row of rows) {
    if(Date.now()-now.getTime()>220_000)break;
    const [claimed] = await db.update(staffNotifications).set({ status: "sending", claimedAt: new Date(), updatedAt: new Date() }).where(and(eq(staffNotifications.id, row.id), eq(staffNotifications.status, "pending"))).returning();
    if (!claimed) continue;
    let smtpStarted = false;
    try {
      const [recipient] = await db.select({ name: users.name, email: users.email, locale: users.locale, role: users.role }).from(users).where(eq(users.id, row.userId));
      const content = await currentContent(row);
      const requiredModule = row.kind === "team_message" ? "teamberichten" : row.kind === "followup_assignment" ? "aanvragen" : "agenda";
      if (!recipient || !isSystemMailRecipient(recipient.email) || !magModule(recipient.role, requiredModule) || !content) { await db.update(staffNotifications).set({ status: "skipped", updatedAt: new Date() }).where(eq(staffNotifications.id, row.id)); result.skipped++; continue; }
      const mail = staffNotificationEmail(content, recipient);
      smtpStarted = true;
      const delivery = await sendEmail({ to: recipient.email, ...mail, noCompanyBcc: true, interneMelding: true });
      if (!delivery.sent) {
        const safeRetry = delivery.reason === "not-configured";
        await db.update(staffNotifications).set({ status: safeRetry ? "pending" : "unknown", availableAt: new Date(Date.now()+60*60_000), lastError: safeRetry ? "mail-not-configured" : "mail-delivery-unconfirmed", updatedAt: new Date() }).where(eq(staffNotifications.id, row.id));
        if (safeRetry) result.pending++; else result.unknown++;
        console.warn("[staff-notification] delivery-not-confirmed", { id: row.id, retry: safeRetry });
        continue;
      }
      await db.update(staffNotifications).set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(staffNotifications.id, row.id)); result.sent++;
    } catch {
      await db.update(staffNotifications).set({ status: smtpStarted ? "unknown" : "pending", availableAt: new Date(Date.now()+10*60_000), lastError: smtpStarted ? "mail-delivery-unconfirmed" : "preparation-failed", updatedAt: new Date() }).where(eq(staffNotifications.id, row.id));
      if (smtpStarted) result.unknown++; else result.pending++;
      console.warn("[staff-notification] delivery-failed", { id: row.id, smtpStarted });
    }
  }
  return result;
}

/** Geen misleidende fout na een al opgeslagen dossier of bericht. */
export async function sendQueuedStaffNotification(id: string): Promise<boolean> {
  try { const result = await deliverStaffNotifications([id]); if(result.sent>0)return true;const [notice]=await db.select({status:staffNotifications.status}).from(staffNotifications).where(eq(staffNotifications.id,id));return notice?.status==="sent"; }
  catch { console.warn("[staff-notification] queued-delivery-pending", { id }); return false; }
}
