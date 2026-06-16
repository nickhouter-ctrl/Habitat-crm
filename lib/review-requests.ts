/**
 * Review-verzoeken: vraag klanten ~3 weken na levering om een Google-review.
 * - Alleen afgeleverde pakbonnen (deliveredAt), 21–90 dagen geleden (zo spammen
 *   we bij de eerste run geen oude klanten).
 * - Hoogstens één verzoek per klant ooit (nooit opnieuw als de klant al een
 *   review-verzoek kreeg).
 * - Staat standaard uit; zet REVIEW_REQUESTS_ENABLED=true om te activeren.
 */
import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, contacts, documents } from "@/lib/db/schema";
import { reviewRequestEmail, sendEmail } from "@/lib/email";
import { recordSentEmail } from "@/lib/sent-email";

export const REVIEW_URL = process.env.REVIEW_URL || "https://g.page/r/CZeAh9IuS2oQEBM/review";

export async function runReviewRequests(): Promise<{
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  disabled?: boolean;
}> {
  if (process.env.REVIEW_REQUESTS_ENABLED !== "true") {
    return { ok: true, candidates: 0, sent: 0, skipped: 0, disabled: true };
  }

  // Klanten die we ooit al een review-verzoek stuurden — nooit opnieuw mailen.
  const alreadyAsked = new Set(
    (
      await db
        .select({ cid: documents.contactId })
        .from(documents)
        .where(and(isNotNull(documents.contactId), isNotNull(documents.reviewRequestedAt)))
    )
      .map((r) => r.cid)
      .filter(Boolean) as string[],
  );

  const rows = await db
    .select({
      id: documents.id,
      contactId: documents.contactId,
      deliveredAt: documents.deliveredAt,
      name: contacts.name,
      email: contacts.email,
      lang: contacts.preferredLanguage,
    })
    .from(documents)
    .innerJoin(contacts, eq(contacts.id, documents.contactId))
    .where(
      and(
        eq(documents.kind, "deliverynote"),
        isNotNull(documents.deliveredAt),
        isNull(documents.reviewRequestedAt),
        isNotNull(contacts.email),
        sql`${documents.deliveredAt} <= now() - interval '21 days'`,
        sql`${documents.deliveredAt} >= now() - interval '90 days'`,
      ),
    );

  let sent = 0;
  let skipped = 0;
  const doneThisRun = new Set<string>();

  for (const r of rows) {
    if (!r.contactId || !r.email) {
      skipped++;
      continue;
    }
    if (alreadyAsked.has(r.contactId) || doneThisRun.has(r.contactId)) {
      skipped++;
      continue;
    }
    try {
      const mail = reviewRequestEmail({ lang: r.lang, contactName: r.name, reviewUrl: REVIEW_URL });
      const res = await sendEmail({ to: r.email, ...mail });
      if (res.sent) {
        sent++;
        doneThisRun.add(r.contactId);
        await recordSentEmail({
          kind: "review",
          toEmail: r.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          contactId: r.contactId,
          documentId: r.id,
        });
        await db
          .update(documents)
          .set({ reviewRequestedAt: new Date(), updatedAt: new Date() })
          .where(eq(documents.id, r.id));
        await db.insert(activities).values({
          type: "email",
          subject: "Review-verzoek verstuurd",
          body: `Google-reviewverzoek naar ${r.email} (≈3 weken na levering).`,
          documentId: r.id,
          contactId: r.contactId,
        });
      } else skipped++;
    } catch {
      skipped++;
    }
  }

  return { ok: true, candidates: rows.length, sent, skipped };
}
