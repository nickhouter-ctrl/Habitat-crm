import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { commissionEntries, documents, referrals } from "@/lib/db/schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Zorgt dat er een commissieregel bestaat voor elke (niet-concept/void) factuur
 * van een aangebrachte klant (referee) in een actieve aanbreng-relatie.
 * Idempotent (uniek per documentId). Bounded: alleen facturen van referees.
 * Wordt aangeroepen bij het laden van /commissies en de portal /me.
 *
 * Commissie = commissionPct × subtotaal (ex. btw) van de factuur. Optioneel
 * beperkt tot één referrer (voor de portal van die klant).
 */
export async function ensureCommissions(referrerContactId?: string): Promise<void> {
  const activeRefs = await db.query.referrals.findMany({
    where: referrerContactId
      ? and(eq(referrals.active, true), eq(referrals.referrerContactId, referrerContactId))
      : eq(referrals.active, true),
  });
  if (activeRefs.length === 0) return;

  // Eén referral per referee (de eerste actieve).
  const refByReferee = new Map<string, (typeof activeRefs)[number]>();
  for (const r of activeRefs) if (!refByReferee.has(r.refereeContactId)) refByReferee.set(r.refereeContactId, r);
  const refereeIds = [...refByReferee.keys()];

  const invoices = await db
    .select({ id: documents.id, contactId: documents.contactId, subtotalEur: documents.subtotalEur })
    .from(documents)
    .where(
      and(
        eq(documents.kind, "invoice"),
        inArray(documents.contactId, refereeIds),
        notInArray(documents.status, ["draft", "void"]),
      ),
    );
  if (invoices.length === 0) return;

  const existing = new Set(
    (await db.select({ documentId: commissionEntries.documentId }).from(commissionEntries)).map((e) => e.documentId),
  );

  for (const inv of invoices) {
    if (existing.has(inv.id) || !inv.contactId) continue;
    const ref = refByReferee.get(inv.contactId);
    if (!ref) continue;
    const base = Number(inv.subtotalEur ?? 0);
    if (!(base > 0)) continue;
    const pct = Number(ref.commissionPct);
    await db
      .insert(commissionEntries)
      .values({
        referralId: ref.id,
        documentId: inv.id,
        baseAmountEur: base.toFixed(2),
        pct: pct.toFixed(2),
        amountEur: round2(base * (pct / 100)).toFixed(2),
      })
      .onConflictDoNothing();
  }
}
