/**
 * Badge-tellers voor de navigatie (zijbalk + starttegels): open aanvragen,
 * nieuwe mails, inkoopfacturen die op goedkeuring wachten en klanten die op
 * onze opvolgmail reageerden.
 *
 * De vroegere "te betalen inkoop"-badge op /inkooporders is bewust weg:
 * betaalstatus van inkoop leeft alleen in Holded (keuze Nick 24-08-2026).
 */
import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { magPad } from "@/lib/auth/modules";
import { voorstelZichtbaarVoor, mailZichtbaarVoor } from "@/lib/mail-visibility";
import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions, purchaseInvoiceReviews, quoteRequests, staffMessages } from "@/lib/db/schema";
import { openVoorstellenFilter } from "@/lib/assistant/achterhaald";
import { telAntwoordNodig } from "@/lib/followup-checklist-data";
import { gewoneAanvragen } from "@/lib/aanvraag-selectie";

export async function verzamelNavBadges(rol?: string, userEmail?: string | null, userId?: string): Promise<Record<string, number>> {
  // Een teller op een menu-item dat iemand niet mag zien, hoeft niet geteld te
  // worden. Voor de bestaande rollen verandert er niets.
  const mag = (pad: string) => rol === undefined || magPad(rol, pad);
  const nul = [{ value: 0 }];

  const [[pending], [inboxNew], [teKeuren], [suggestions], antwoordNodig, [teamUnread]] = await Promise.all([
    mag("/aanvragen")
      ? db.select({ value: count() }).from(quoteRequests).where(and(gewoneAanvragen, eq(quoteRequests.status, "pending")))
      : nul,
    mag("/inbox")
      ? db
          .select({ value: count() })
          .from(emailInbox)
          // Het marketingpostvak is privé: die ongelezen mail hoort niet in de
          // teller van iemand anders.
          .where(and(sql`${emailInbox.status} <> 'archived'`, isNull(emailInbox.readAt), mailZichtbaarVoor(userEmail)))
      : nul,
    mag("/inkooporders/te-verwerken")
      ? db.select({ value: count() }).from(purchaseInvoiceReviews).where(eq(purchaseInvoiceReviews.status, "pending"))
      : nul,
    mag("/assistent")
      ? db
          .select({ value: count() })
          .from(inboxSuggestions)
          .where(and(openVoorstellenFilter, voorstelZichtbaarVoor(userEmail)))
      : nul,
    // Klanten die op onze opvolgmail reageerden en nog op antwoord wachten.
    mag("/opvolging") ? rol === "sales" ? Promise.resolve(0) : telAntwoordNodig(userEmail) : 0,
    mag("/teamberichten") && userId ? db.select({value:count()}).from(staffMessages).where(and(eq(staffMessages.recipientId,userId),isNull(staffMessages.readAt))) : nul,
  ]);
  return {
    "/assistent": suggestions?.value ?? 0,
    "/aanvragen": pending?.value ?? 0,
    "/inbox": inboxNew?.value ?? 0,
    "/inkooporders/te-verwerken": teKeuren?.value ?? 0,
    "/opvolging": antwoordNodig,
    "/teamberichten": teamUnread?.value ?? 0,
  };
}
