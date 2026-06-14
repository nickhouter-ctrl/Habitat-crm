/**
 * Betaalherinneringen: mail de klant bij een vervallen, (deels) onbetaalde
 * factuur. Hoogstens eens per 7 dagen per factuur (documents.payment_reminder_at).
 */
import "server-only";
import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, contacts, documents } from "@/lib/db/schema";
import { paymentReminderEmail, sendEmail } from "@/lib/email";
import { formatDate, formatEUR } from "@/lib/utils";

export async function runPaymentReminders(): Promise<{
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
}> {
  const rows = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      dueDate: documents.dueDate,
      totalEur: documents.totalEur,
      paidEur: documents.paidEur,
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
        sql`(${documents.paymentReminderAt} is null or ${documents.paymentReminderAt} < now() - interval '7 days')`,
      ),
    );

  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.email || !r.docNumber) {
      skipped++;
      continue;
    }
    const open = Number(r.totalEur ?? 0) - Number(r.paidEur ?? 0);
    try {
      const mail = paymentReminderEmail({
        lang: r.lang,
        contactName: r.name,
        docNumber: r.docNumber,
        amount: formatEUR(open),
        dueDate: r.dueDate ? formatDate(r.dueDate) : "—",
      });
      const res = await sendEmail({ to: r.email, ...mail });
      if (res.sent) {
        sent++;
        await db.insert(activities).values({
          type: "email",
          subject: `Betaalherinnering verstuurd — ${r.docNumber}`,
          body: `Openstaand ${formatEUR(open)} · vervallen op ${r.dueDate ? formatDate(r.dueDate) : "—"}.`,
          documentId: r.id,
          contactId: r.contactId,
        });
      } else skipped++;
    } catch {
      skipped++;
    }
    await db
      .update(documents)
      .set({ paymentReminderAt: new Date(), updatedAt: new Date() })
      .where(eq(documents.id, r.id));
  }
  return { ok: true, candidates: rows.length, sent, skipped };
}
