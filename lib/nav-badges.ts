/**
 * Badge-tellers voor de navigatie (zijbalk + starttegels): open aanvragen,
 * nieuwe mails en inkoopfacturen die op goedkeuring wachten.
 *
 * De vroegere "te betalen inkoop"-badge op /inkooporders is bewust weg:
 * betaalstatus van inkoop leeft alleen in Holded (keuze Nick 24-08-2026).
 */
import "server-only";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions, purchaseInvoiceReviews, quoteRequests } from "@/lib/db/schema";
import { openVoorstellenFilter } from "@/lib/assistant/achterhaald";

export async function verzamelNavBadges(): Promise<Record<string, number>> {
  const [[pending], [inboxNew], [teKeuren], [suggestions]] = await Promise.all([
    db.select({ value: count() }).from(quoteRequests).where(eq(quoteRequests.status, "pending")),
    db.select({ value: count() }).from(emailInbox).where(and(sql`${emailInbox.status} <> 'archived'`, isNull(emailInbox.readAt))),
    db
      .select({ value: count() })
      .from(purchaseInvoiceReviews)
      .where(eq(purchaseInvoiceReviews.status, "pending")),
    db.select({ value: count() }).from(inboxSuggestions).where(openVoorstellenFilter),
  ]);
  return {
    "/assistent": suggestions?.value ?? 0,
    "/aanvragen": pending?.value ?? 0,
    "/inbox": inboxNew?.value ?? 0,
    "/inkooporders/te-verwerken": teKeuren?.value ?? 0,
  };
}
