/**
 * Betaalherinneringen: mail klanten met vervallen, (deels) onbetaalde facturen.
 * Eén mail PER KLANT met een totaaloverzicht van al hun openstaande facturen
 * (en openstaande creditnota's) — niet één mail per factuur. Hoogstens eens per
 * 7 dagen per klant (documents.payment_reminder_at). Niveau loopt automatisch op.
 */
import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, contacts, documents } from "@/lib/db/schema";
import { accountReminderEmail, sendEmail, type ReminderLevel } from "@/lib/email";
import { recordSentEmail } from "@/lib/sent-email";
import { formatDate, formatEUR } from "@/lib/utils";

export async function runPaymentReminders(): Promise<{
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  disabled?: boolean;
}> {
  // Veiligheids-schakelaar: pas versturen zodra dit expliciet aanstaat.
  if (process.env.PAYMENT_REMINDERS_ENABLED !== "true") {
    return { ok: true, candidates: 0, sent: 0, skipped: 0, disabled: true };
  }

  // 1. Alle vervallen, (deels) onbetaalde facturen + klantgegevens.
  const invoiceRows = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      dueDate: documents.dueDate,
      totalEur: documents.totalEur,
      paidEur: documents.paidEur,
      paymentReminderAt: documents.paymentReminderAt,
      reminderLevel: documents.reminderLevel,
      contactId: documents.contactId,
      name: contacts.name,
      email: contacts.email,
      lang: contacts.preferredLanguage,
    })
    .from(documents)
    .leftJoin(contacts, eq(contacts.id, documents.contactId))
    .where(
      and(
        eq(documents.kind, "invoice"),
        notInArray(documents.status, ["paid", "void", "draft", "rejected"]),
        sql`${documents.dueDate} < current_date`,
        sql`coalesce(${documents.totalEur}, 0) - coalesce(${documents.paidEur}, 0) > 0.01`,
      ),
    );

  // Groepeer per klant.
  type Row = (typeof invoiceRows)[number];
  const byContact = new Map<string, Row[]>();
  for (const r of invoiceRows) {
    if (!r.contactId) continue;
    const list = byContact.get(r.contactId) ?? [];
    list.push(r);
    byContact.set(r.contactId, list);
  }

  // 2. Openstaande creditnota's per klant (verlagen het totaal).
  const contactIds = [...byContact.keys()];
  const creditRows = contactIds.length
    ? await db
        .select({
          docNumber: documents.docNumber,
          totalEur: documents.totalEur,
          paidEur: documents.paidEur,
          contactId: documents.contactId,
        })
        .from(documents)
        .where(
          and(
            eq(documents.kind, "creditnote"),
            // Concept-/afgewezen creditnota's zijn nooit naar de klant gestuurd —
            // die mogen het te betalen bedrag in de herinnering niet verlagen.
            notInArray(documents.status, ["void", "draft", "rejected"]),
            inArray(documents.contactId, contactIds),
            sql`coalesce(${documents.totalEur}, 0) - coalesce(${documents.paidEur}, 0) > 0.01`,
          ),
        )
    : [];
  const creditsByContact = new Map<string, typeof creditRows>();
  for (const c of creditRows) {
    if (!c.contactId) continue;
    const list = creditsByContact.get(c.contactId) ?? [];
    list.push(c);
    creditsByContact.set(c.contactId, list);
  }

  const open = (d: { totalEur: string | null; paidEur: string | null }) =>
    Number(d.totalEur ?? 0) - Number(d.paidEur ?? 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let sent = 0;
  let skipped = 0;
  for (const [contactId, invoices] of byContact) {
    const email = invoices[0].email;
    if (!email) {
      skipped++;
      continue;
    }
    // Throttle per klant: alleen mailen als minstens één factuur >7 dagen geleden
    // (of nooit) herinnerd is.
    const dueForReminder = invoices.some(
      (i) => !i.paymentReminderAt || new Date(i.paymentReminderAt).getTime() < weekAgo,
    );
    if (!dueForReminder) {
      skipped++;
      continue;
    }

    const credits = creditsByContact.get(contactId) ?? [];
    const total = invoices.reduce((s, d) => s + open(d), 0) - credits.reduce((s, d) => s + open(d), 0);
    const lvl: ReminderLevel = Math.min(
      3,
      Math.max(0, ...invoices.map((i) => i.reminderLevel ?? 0)) + 1,
    ) as ReminderLevel;

    try {
      const mail = accountReminderEmail({
        lang: invoices[0].lang,
        contactName: invoices[0].name,
        level: lvl,
        invoices: invoices.map((d) => ({
          docNumber: d.docNumber ?? "—",
          dueDate: d.dueDate ? formatDate(d.dueDate) : "—",
          amount: formatEUR(open(d)),
        })),
        credits: credits.map((d) => ({
          docNumber: d.docNumber ?? "—",
          amount: `− ${formatEUR(open(d))}`,
        })),
        total: formatEUR(total),
      });
      const res = await sendEmail({ to: email, ...mail });
      if (res.sent) {
        sent++;
        await recordSentEmail({
          kind: "reminder",
          toEmail: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          contactId,
        });
        await db
          .update(documents)
          .set({ paymentReminderAt: new Date(), reminderLevel: lvl, updatedAt: new Date() })
          .where(
            inArray(
              documents.id,
              invoices.map((i) => i.id),
            ),
          );
        await db.insert(activities).values({
          type: "email",
          subject: `Betaalherinnering verstuurd (niveau ${lvl})`,
          body: `${invoices.length} openstaande factu${invoices.length === 1 ? "ur" : "ren"}${
            credits.length ? ` − ${credits.length} creditnota('s)` : ""
          } · totaal ${formatEUR(total)}. Naar ${email}.`,
          contactId,
        });
      } else skipped++;
    } catch {
      skipped++;
    }
  }

  return { ok: true, candidates: byContact.size, sent, skipped };
}
