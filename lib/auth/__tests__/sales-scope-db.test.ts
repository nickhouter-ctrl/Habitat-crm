/** Real authorization queries against temporary fixtures; always rolled back. */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db, pgClient } from "@/lib/db";
import { activities, appointments, companies, contacts, deals, documents, emailInbox, partnerMessages, projects, users } from "@/lib/db/schema";
import { salesContactActivityFilter, salesTaskAccess, salesAppointmentAccess, salesMailFilter } from "../sales-scope";

const enabled = process.env.SALES_SCOPE_DB_TEST === "1";
afterAll(async () => { if (enabled) await pgClient.end({ timeout: 1 }); });
it.skipIf(!enabled)("keeps every customer visible while denying financial history, document-linked tasks, other agendas and shared mail", async () => {
  const rollback = new Error("authorization fixtures rollback");
  try {
    await db.transaction(async tx => {
      const me = randomUUID(), other = randomUUID(), company = randomUUID();
      const sale = randomUUID(), client = randomUUID(), colleague = randomUUID(), documentClient = randomUUID(), dealClient = randomUUID();
      await tx.insert(users).values([{ id: me, email: `${me}@example.invalid`, role: "sales" }, { id: other, email: `${other}@example.invalid`, role: "admin" }]);
      await tx.insert(companies).values({ id: company, name: "Authorization fixture" });
      await tx.insert(contacts).values([
        { id: sale, name: "Sales fixture" }, { id: client, name: "Project client", companyId: company },
        { id: colleague, name: "Same company", companyId: company }, { id: documentClient, name: "Document client" }, { id: dealClient, name: "Deal client" },
      ]);
      const [project] = await tx.insert(projects).values({ name: "Private project fixture", contactId: client }).returning();
      const [document] = await tx.insert(documents).values({ kind: "invoice", contactId: documentClient, projectId: project.id }).returning();
      await tx.insert(deals).values({ title: "Private deal fixture", contactId: dealClient });
      const ids = [sale, client, colleague, documentClient, dealClient];
      expect(await tx.select({ id: contacts.id }).from(contacts).where(inArray(contacts.id, ids))).toHaveLength(5);
      const own = randomUUID(), theirs = randomUUID(), privateTask = randomUUID();
      await tx.insert(activities).values([
        { id: own, type: "task", subject:"Verkoopnotitie", contactId: sale, authorId: me },
        { id: theirs, type: "task", contactId: sale, authorId: other },
        { id: privateTask, type: "task", subject:"Project factuur", documentId:document.id, contactId: client, assigneeId: me },
      ]);
      expect((await tx.select({ id: activities.id }).from(activities).where(and(inArray(activities.id, [own, theirs, privateTask]), salesTaskAccess("sales", me)))).map(r => r.id)).toEqual([own]);
      expect((await tx.select({id:activities.id}).from(activities).where(and(inArray(activities.id,[own,theirs,privateTask]),salesContactActivityFilter("sales")))).map(r=>r.id)).toEqual([own]);
      await tx.insert(appointments).values([
        { id: own, title: "Own sale", startsAt: new Date(), contactId: sale, createdBy: me },
        { id: theirs, title: "Other agenda", startsAt: new Date(), contactId: sale, createdBy: other },
        { id: privateTask, title: "Project appointment", startsAt: new Date(), contactId: client, assigneeId: me },
      ]);
      expect((await tx.select({ id: appointments.id }).from(appointments).where(and(inArray(appointments.id, [own, theirs, privateTask]), salesAppointmentAccess("sales", me)))).map(r => r.id).sort()).toEqual([own,privateTask].sort());
      await tx.insert(emailInbox).values([
        { id: own, messageId: own, fromEmail: "client@example.invalid", toEmail: `${me}@example.invalid`, subject: "Own sale", mailboxUser: `${me}@example.invalid` },
        { id: theirs, messageId: theirs, fromEmail: "office@example.invalid", toEmail: "hi@example.invalid", subject: "Project update", mailboxUser: "hi@example.invalid" },
      ]);
      expect((await tx.select({ id: emailInbox.id }).from(emailInbox).where(and(inArray(emailInbox.id, [own, theirs]), salesMailFilter("sales", `${me}@example.invalid`)))).map(r => r.id)).toEqual([own]);
      // Shared mail is visible only as an exact reply to this seller's own
      // personal sales message, from the same customer and addressed to them.
      const before = process.env.GMAIL_USER;
      process.env.GMAIL_USER = 'hi@example.invalid';
      try {
        await tx.update(contacts).set({email:'client@example.invalid'}).where(eq(contacts.id,sale));
        const ownMessage=`<${randomUUID()}@example.invalid>`, otherMessage=`<${randomUUID()}@example.invalid>`, draftMessage=`<${randomUUID()}@example.invalid>`, invoiceMessage=`<${randomUUID()}@example.invalid>`;
        await tx.insert(partnerMessages).values([
          {contactId:sale,authorId:me,status:'sent',source:'external-copy',personal:true,mailboxUser:`${me}@example.invalid`,toEmail:'client@example.invalid',subject:'Samples',body:'Sales reply',messageId:ownMessage},
          {contactId:sale,authorId:other,status:'sent',mailboxUser:'hi@example.invalid',toEmail:'client@example.invalid',subject:'Other conversation',body:'Other reply',messageId:otherMessage},
          {contactId:sale,authorId:me,status:'draft',mailboxUser:`${me}@example.invalid`,toEmail:'client@example.invalid',subject:'Draft',body:'Draft',messageId:draftMessage},
          {contactId:sale,authorId:me,status:'sent',source:'inbox',personal:false,mailboxUser:'hi@example.invalid',toEmail:'client@example.invalid',subject:'Invoice',body:'Financial message',messageId:invoiceMessage},
        ]);
        const legitimate=randomUUID(), colleagueThread=randomUUID(), otherSender=randomUUID(), notAddressed=randomUUID(), substring=randomUUID(), draft=randomUUID(), financial=randomUUID(), privateMailbox=randomUUID();
        const shared={fromEmail:'client@example.invalid',toEmail:`${me}@example.invalid`,subject:'Re: Samples',mailboxUser:'hi@example.invalid',referencesHeader:ownMessage};
        await tx.insert(emailInbox).values([
          { ...shared,id:legitimate,messageId:legitimate, referencesHeader:`<older@example.invalid> ${ownMessage}` },
          { ...shared,id:colleagueThread,messageId:colleagueThread,referencesHeader:otherMessage },
          { ...shared,id:otherSender,messageId:otherSender,fromEmail:'unrelated@example.invalid' },
          { ...shared,id:notAddressed,messageId:notAddressed,toEmail:'hi@example.invalid' },
          { ...shared,id:substring,messageId:substring,referencesHeader:`prefix${ownMessage}suffix` },
          { ...shared,id:draft,messageId:draft,referencesHeader:draftMessage },
          { ...shared,id:financial,messageId:financial,referencesHeader:invoiceMessage },
          { ...shared,id:privateMailbox,messageId:privateMailbox,mailboxUser:'other-private@example.invalid' },
        ]);
        const ids=[legitimate,colleagueThread,otherSender,notAddressed,substring,draft,financial,privateMailbox];
        expect((await tx.select({id:emailInbox.id}).from(emailInbox).where(and(inArray(emailInbox.id,ids),salesMailFilter('sales',`${me}@example.invalid`)))).map(r=>r.id)).toEqual([legitimate]);
        expect(await tx.select({id:emailInbox.id}).from(emailInbox).where(and(inArray(emailInbox.id,ids),salesMailFilter('sales',null)))).toHaveLength(0);
      } finally {if(before===undefined)delete process.env.GMAIL_USER;else process.env.GMAIL_USER=before;}
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}, 30_000);
