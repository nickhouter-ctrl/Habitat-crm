import "server-only";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, contacts, emailInbox, inboxSuggestions, partnerMessages, partnerProfiles, users } from "@/lib/db/schema";
import { heeftCap } from "@/lib/auth/modules";
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from "@/lib/followup-checklist";
import { agendaDay } from "@/lib/agenda-dates";
import type { ParsedEmail } from "@/lib/gmail";

/** A verified staff reply copied to our mailbox is outgoing customer mail, not a new customer request. */
export async function recordExternalStaffReply(mail: ParsedEmail, mailboxUser?: string): Promise<boolean> {
  const mailbox = mailboxUser?.trim().toLowerCase();
  const office = process.env.GMAIL_USER?.trim().toLowerCase();
  if (!office || mailbox !== office || !mail.senderAuthenticated || !mail.messageId || !/^(re|antw|aw|sv)\s*:/i.test(mail.subject?.trim() ?? "")) return false;
  const sender = mail.fromEmail?.trim().toLowerCase();
  if (!sender || sender.includes(",")) return false;
  const refs = mail.referencesHeader?.match(/<[^<>\s]{1,500}>/g) ?? [];
  if (!refs.length) return false;
  const [staff] = await db.select({ id: users.id, role: users.role }).from(users).where(sql`lower(trim(${users.email})) = ${sender}`).limit(1);
  if (!staff || !heeftCap(staff.role, "schrijven")) return false;
  const domain = office.split("@")[1];
  const recipients = [...new Set(`${mail.toEmail ?? ""},${mail.ccEmail ?? ""}`.split(",").map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+$/.test(e) && e.split("@")[1] !== domain))];
  if (!recipients.length) return false;
  const matches = await db.select({ id: contacts.id, email: contacts.email }).from(contacts).where(and(inArray(sql`lower(trim(${contacts.email}))`, recipients), sql`${contacts.type} <> 'supplier'`)).limit(2);
  if (matches.length !== 1) return false;
  const contact = matches[0];
  const [knownThread] = await db.select({ id: partnerMessages.id }).from(partnerMessages).where(and(eq(partnerMessages.contactId, contact.id), inArray(partnerMessages.messageId, refs), eq(partnerMessages.status, "sent"))).limit(1);
  const [incomingThread] = knownThread ? [] : await db.select({ id: emailInbox.id }).from(emailInbox).where(and(inArray(emailInbox.messageId, refs), sql`lower(trim(${emailInbox.fromEmail})) = ${contact.email!.trim().toLowerCase()}`, eq(emailInbox.mailboxUser, mailbox))).limit(1);
  if (!knownThread && !incomingThread) return false;
  const at = mail.receivedAt;
  if (!at || !Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 300000) return false;

  await db.transaction(async tx => {
    const [locked] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contact.id)).for("update");
    if (!locked) return;
    const [added] = await tx.insert(partnerMessages).values({
      contactId: contact.id, authorId: staff.id, mailboxUser: sender, toEmail: contact.email!, source: "external-copy", status: "sent", personal: true,
      subject: mail.subject!, body: mail.bodyText ?? "", html: mail.bodyHtml, messageId: mail.messageId, referencesHeader: mail.referencesHeader,
      sentAt: at, attachments: mail.attachments.map(a => ({ name: a.filename, size: a.size })),
    }).onConflictDoNothing().returning({ id: partnerMessages.id });
    if (added) {
      await tx.update(contacts).set({ lastContactedAt: sql`greatest(${contacts.lastContactedAt}, ${at.toISOString()}::timestamptz)` }).where(eq(contacts.id, contact.id));
      await tx.insert(partnerProfiles).values({ contactId: contact.id, stage: "contacted" }).onConflictDoNothing();
      await tx.update(partnerProfiles).set({ stage: "contacted", version: sql`${partnerProfiles.version}+1`, updatedAt: new Date() }).where(and(eq(partnerProfiles.contactId, contact.id), eq(partnerProfiles.stage, "new")));
      const [latest] = await tx.select({ createdAt: activities.createdAt }).from(activities).where(and(eq(activities.contactId, contact.id), eq(activities.type, "note"), inArray(activities.subject, [FOLLOWUP_DONE, FOLLOWUP_REOPENED]))).orderBy(desc(activities.createdAt)).limit(1);
      if (!latest || latest.createdAt < at) {
        await tx.insert(activities).values({ contactId: contact.id, type: "note", subject: FOLLOWUP_DONE, body: "Persoonlijk klantantwoord vanuit eigen mailprogramma geregistreerd; huidige opvolging afgehandeld.", authorId: staff.id, createdAt: at, updatedAt: at });
        // Only this sender's single pending communication action can be completed early.
        // Other colleagues, delivery work, appointments and financial tasks remain intact.
        const tasks = await tx.select().from(activities).where(and(eq(activities.contactId, contact.id), eq(activities.type, "task"), isNull(activities.completedAt), lte(activities.createdAt, at),
          sql`coalesce(${activities.assigneeId}, ${activities.authorId}) = ${staff.id}::uuid`, isNull(activities.dealId), isNull(activities.documentId), isNull(activities.propertyId),
          sql`coalesce(${activities.subject}, '') ~* '^(Opvolging|Beursopvolging|Afspraak plannen|Contact opnemen|Klant opvolgen|Mail sturen|Antwoord sturen)( |$)'`)).limit(2).for("update");
        if (tasks.length === 1) {
          const task = tasks[0];
          await tx.update(activities).set({ completedAt: at, updatedAt: new Date() }).where(eq(activities.id, task.id));
          await tx.update(partnerProfiles).set({ nextAction: null, nextActionOn: null, version: sql`${partnerProfiles.version}+1`, updatedAt: new Date() }).where(and(eq(partnerProfiles.contactId, contact.id), eq(partnerProfiles.ownerId, staff.id), eq(partnerProfiles.nextAction, task.body ?? ""), task.dueAt ? eq(partnerProfiles.nextActionOn, agendaDay(task.dueAt)) : isNull(partnerProfiles.nextActionOn)));
        }
      }
    }
    // Preserve the original copy while removing it and the answered thread from the reply queue.
    await tx.update(emailInbox).set({ status: "archived", readAt: new Date() }).where(and(eq(emailInbox.mailboxUser, mailbox), eq(emailInbox.messageId, mail.messageId)));
    await tx.update(inboxSuggestions).set({ status: "reviewed", needsReply: false, draft: null, draftSubject: null, reviewedAt: at, updatedAt: new Date() }).where(and(eq(inboxSuggestions.status, "open"), inArray(inboxSuggestions.emailId, tx.select({ id: emailInbox.id }).from(emailInbox).where(and(eq(emailInbox.mailboxUser, mailbox), inArray(emailInbox.messageId, [mail.messageId, ...refs]))))));
  });
  return true;
}
