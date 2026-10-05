/** Real SQL and no mail delivery; temporary records always roll back. */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, expect, it, vi } from "vitest";
import type { ParsedEmail } from "@/lib/gmail";

const m = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const real = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...real, db: new Proxy(real.db, { get(target, key) {
    const active = (m.current ?? target) as typeof real.db;
    const value = Reflect.get(active, key);
    return typeof value === "function" ? value.bind(active) : value;
  } }) };
});
import { activities, contacts, emailInbox, inboxSuggestions, partnerMessages, partnerProfiles, users } from "@/lib/db/schema";
import { recordExternalStaffReply } from "@/lib/external-staff-reply";
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from "@/lib/followup-checklist";

const enabled = process.env.EXTERNAL_REPLY_DB_TEST === "1";
afterAll(async () => { if (enabled) await (await vi.importActual<typeof import("@/lib/db")>("@/lib/db")).pgClient.end({ timeout: 1 }); });
it.skipIf(!enabled)("records verified copies once and completes only the sender's communication task", async () => {
  const real = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  const rollback = new Error("ROLLBACK_EXTERNAL_REPLY"), before = process.env.GMAIL_USER;
  const office = "office@staff-fixture.invalid", sender = "sales@staff-fixture.invalid";
  const staff = randomUUID(), colleague = randomUUID(), client = randomUUID(), other = randomUUID();
  const at = new Date(Date.now() - 3600000), earlier = new Date(at.getTime() - 60000);
  const original = `<${randomUUID()}@fixture.invalid>`, reply = `<${randomUUID()}@fixture.invalid>`;
  const mail: ParsedEmail = { senderAuthenticated: true, messageId: reply, imapUid: 1, threadId: null,
    referencesHeader: original, fromEmail: sender, fromName: "Sales fixture", toEmail: "client@reply-fixture.invalid",
    ccEmail: office, subject: "RE: Samples", bodyText: "Please confirm the delivery address", bodyHtml: null,
    receivedAt: at, attachments: [] };
  process.env.GMAIL_USER = office;
  try {
    await real.db.transaction(async tx => {
      m.current = tx;
      await tx.insert(users).values([{ id: staff, email: sender, role: "sales" }, { id: colleague, email: "colleague@staff-fixture.invalid", role: "admin" }]);
      await tx.insert(contacts).values([{ id: client, name: "Reply fixture", email: mail.toEmail }, { id: other, name: "Other fixture", email: "other@reply-fixture.invalid" }]);
      await tx.insert(partnerProfiles).values({ contactId: client, ownerId: staff, stage: "discussion", interest: "interested", nextAction: "Ask for address", nextActionOn: "2100-01-01" });
      await tx.insert(partnerMessages).values({ contactId: client, status: "sent", mailboxUser: office, toEmail: mail.toEmail!, subject: "Samples", body: "Sample question", messageId: original, sentAt: earlier });
      const tasks = await tx.insert(activities).values([
        { contactId: client, type: "task", subject: "Afspraak plannen met klant", body: "Ask for address", assigneeId: staff, dueAt: new Date("2100-01-01T08:00:00Z"), createdAt: earlier },
        { contactId: client, type: "task", subject: "Afspraak plannen met klant", assigneeId: colleague, createdAt: earlier },
        { contactId: client, type: "task", subject: "Samples versturen", assigneeId: staff, createdAt: earlier },
      ]).returning();
      const [copy] = await tx.insert(emailInbox).values({ messageId: reply, fromEmail: sender, toEmail: mail.toEmail, mailboxUser: office, receivedAt: at, subject: mail.subject }).returning();
      const [suggestion] = await tx.insert(inboxSuggestions).values({ emailId: copy.id, needsReply: true, status: "open", summary: "Reply fixture", reason: "Test fixture" }).returning();
      for (const invalid of [
        { ...mail, senderAuthenticated: false }, { ...mail, referencesHeader: null }, { ...mail, toEmail: "other@reply-fixture.invalid" },
        { ...mail, fromEmail: "unknown@staff-fixture.invalid" }, { ...mail, receivedAt: new Date(Date.now() + 600000) },
      ]) expect(await recordExternalStaffReply(invalid, office)).toBe(false);
      expect(await recordExternalStaffReply(mail, "other@staff-fixture.invalid")).toBe(false);
      expect(await recordExternalStaffReply(mail, office)).toBe(true);
      expect(await recordExternalStaffReply(mail, office)).toBe(true);
      const saved = await tx.select().from(partnerMessages).where(eq(partnerMessages.messageId, reply));
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ authorId: staff, source: "external-copy", personal: true, status: "sent", mailboxUser: sender });
      expect(saved[0].sentAt?.toISOString()).toBe(at.toISOString());
      const taskRows = await tx.select().from(activities).where(inArray(activities.id, tasks.map(t => t.id)));
      expect(taskRows.find(t => t.id === tasks[0].id)?.completedAt?.toISOString()).toBe(at.toISOString());
      expect(taskRows.filter(t => t.id !== tasks[0].id).every(t => t.completedAt === null)).toBe(true);
      expect(await tx.select().from(activities).where(and(eq(activities.contactId, client), eq(activities.subject, FOLLOWUP_DONE)))).toHaveLength(1);
      const [profile] = await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId, client));
      expect(profile).toMatchObject({ stage: "discussion", interest: "interested", nextAction: null, nextActionOn: null });
      expect((await tx.select().from(emailInbox).where(eq(emailInbox.id, copy.id)))[0].status).toBe("archived");
      expect((await tx.select().from(inboxSuggestions).where(eq(inboxSuggestions.id, suggestion.id)))[0]).toMatchObject({ status: "reviewed", needsReply: false });
      // A late import cannot erase a newer manual reopening or complete new work.
      await tx.insert(activities).values({ contactId: client, type: "note", subject: FOLLOWUP_REOPENED, createdAt: new Date(at.getTime() + 1000) });
      const [laterTask] = await tx.insert(activities).values({ contactId: client, type: "task", subject: "Contact opnemen", assigneeId: staff, createdAt: earlier }).returning();
      expect(await recordExternalStaffReply({ ...mail, messageId: `<${randomUUID()}@fixture.invalid>` }, office)).toBe(true);
      expect((await tx.select().from(activities).where(eq(activities.id, laterTask.id)))[0].completedAt).toBeNull();
      expect(await tx.select().from(activities).where(and(eq(activities.contactId, client), eq(activities.subject, FOLLOWUP_DONE)))).toHaveLength(1);
      throw rollback;
    });
    throw new Error("Fixture transaction unexpectedly committed");
  } catch (error) { if (error !== rollback) throw error; }
  finally { m.current = null; if (before === undefined) delete process.env.GMAIL_USER; else process.env.GMAIL_USER = before; }
  expect(await real.db.select().from(contacts).where(inArray(contacts.id, [client, other]))).toHaveLength(0);
  expect(await real.db.select().from(users).where(inArray(users.id, [staff, colleague]))).toHaveLength(0);
}, 30000);
