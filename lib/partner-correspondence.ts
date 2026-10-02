import 'server-only';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, partnerMessages, partnerProfiles } from '@/lib/db/schema';
import { marketingMailbox } from '@/lib/mail-visibility';

/** Bewaar een echt verzonden antwoord; geen concept en geen nieuwe verzending. */
export async function recordPartnerReply(args: {
  toEmail: string; mailboxUser: string; subject: string; body: string; html: string;
  messageId?: string; referencesHeader?: string; authorId: string;
  attachments: { name: string; size: number }[];
}) {
  const matches = await db.select({ id: contacts.id }).from(contacts)
    .where(sql`lower(trim(${contacts.email})) = ${args.toEmail.trim().toLowerCase()}`).limit(2);
  if (matches.length !== 1) return; // Een gedeeld adres hoort niet bij een willekeurig dossier.
  const at = new Date(), contactId = matches[0].id;
  await db.insert(partnerMessages).values({ ...args, contactId, status: 'sent', personal: true, source: 'inbox', sentAt: at })
    .onConflictDoNothing();
  await markPartnerContacted(contactId, at, args.mailboxUser);
}

/** Beroep, interesse en bestaande afspraken blijven intact. Privémail geeft geen gedeelde fasewijziging. */
export async function markPartnerContacted(contactId: string, at: Date, mailboxUser: string) {
  if (mailboxUser.trim().toLowerCase() === marketingMailbox()) return;
  // Raw SQL parameters bypass the column's Date encoder. Bind an ISO string
  // explicitly: postgres-js otherwise rejects the Date before running SQL.
  await db.update(contacts).set({ lastContactedAt: sql`greatest(${contacts.lastContactedAt}, ${at.toISOString()}::timestamptz)` }).where(eq(contacts.id, contactId));
  await db.insert(partnerProfiles).values({ contactId, stage: 'contacted' }).onConflictDoNothing();
  await db.update(partnerProfiles).set({ stage: 'contacted', version: sql`${partnerProfiles.version} + 1`, updatedAt: new Date() })
    .where(and(eq(partnerProfiles.contactId, contactId), eq(partnerProfiles.stage, 'new')));
}

/** Eerder opgeslagen persoonlijke antwoorden tellen ook mee voor de contactfase. */
export async function restorePartnerContactStates(mailboxUser: string) {
  if (mailboxUser.trim().toLowerCase() === marketingMailbox()) return;
  const rows = await db.select({ id: partnerMessages.contactId, at: sql<Date>`max(${partnerMessages.sentAt})` }).from(partnerMessages)
    .leftJoin(partnerProfiles, eq(partnerProfiles.contactId, partnerMessages.contactId))
    .where(and(eq(partnerMessages.mailboxUser, mailboxUser), eq(partnerMessages.status, 'sent'), eq(partnerMessages.personal, true), or(isNull(partnerProfiles.contactId), eq(partnerProfiles.stage, 'new'))))
    .groupBy(partnerMessages.contactId).limit(100);
  for (const row of rows) if (row.at) await markPartnerContacted(row.id, new Date(row.at), mailboxUser);
}
