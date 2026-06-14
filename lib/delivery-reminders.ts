/**
 * Leverherinneringen: mail de klant de dag vóór een geplande levering/ophaling/
 * montage. Idempotent via deliveries.reminder_sent_at (at-most-once).
 */
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, deliveries, documents } from "@/lib/db/schema";
import { deliveryReminderEmail, sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/utils";

export async function runDeliveryReminders(): Promise<{
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
}> {
  const rows = await db
    .select({
      id: deliveries.id,
      method: deliveries.method,
      plannedDate: deliveries.plannedDate,
      docNumber: documents.docNumber,
      name: contacts.name,
      email: contacts.email,
      lang: contacts.preferredLanguage,
    })
    .from(deliveries)
    .leftJoin(documents, eq(documents.id, deliveries.documentId))
    .leftJoin(contacts, eq(contacts.id, deliveries.contactId))
    .where(
      and(
        inArray(deliveries.status, ["gepland", "onderweg"]),
        isNull(deliveries.reminderSentAt),
        // Levering staat gepland voor morgen.
        sql`${deliveries.plannedDate} = (current_date + 1)`,
      ),
    );

  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.email || !r.plannedDate) {
      skipped++;
      continue;
    }
    try {
      const mail = deliveryReminderEmail({
        lang: r.lang,
        contactName: r.name,
        when: formatDate(r.plannedDate),
        method: r.method,
        reference: r.docNumber,
      });
      const res = await sendEmail({ to: r.email, ...mail });
      if (res.sent) sent++;
      else skipped++;
    } catch {
      skipped++;
    }
    // At-most-once: markeer ongeacht het resultaat zodat we niet blijven mailen.
    await db
      .update(deliveries)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(deliveries.id, r.id));
  }
  return { ok: true, candidates: rows.length, sent, skipped };
}
