import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { inboxSuggestions } from "@/lib/db/schema";

/**
 * Wanneer een mailvoorstel van de assistent achterhaald is.
 *
 * De assistent is een "wat moet ik nog doen"-lijst. Zodra er met de mail is
 * gehandeld, hoort het voorstel weg te zijn — anders staat dezelfde factuur na
 * het keuren nog een keer bij de assistent. Achterhaald is:
 *
 *   • de mail is gearchiveerd
 *   • de mail is gekoppeld aan een inkooporder of een offerteaanvraag
 *   • er hangt een factuurkaart aan die al beslist is (goedgekeurd, afgekeurd,
 *     genegeerd of vervangen)
 *   • de mail is gelezen — dan is hij langs de ogen geweest en is een voorstel
 *     over "wat is dit" niet meer nodig
 *
 * `auto_archived` voorstellen blijven staan: die lijst is er juist om te
 * controleren wat het systeem zelf heeft opgeborgen.
 */
const beslisteKaart = sql`exists (
  select 1 from purchase_invoice_reviews r
  where r.email_id = ${inboxSuggestions.emailId} and r.status <> 'pending'
)`;

/** Filter voor queries die openstaande voorstellen ophalen. */
export const nogRelevant = or(
  eq(inboxSuggestions.status, "auto_archived"),
  and(
    sql`exists (select 1 from email_inbox e where e.id = ${inboxSuggestions.emailId}
        and e.status = 'new' and e.read_at is null
        and e.linked_purchase_order_id is null and e.linked_quote_request_id is null)`,
    sql`not ${beslisteKaart}`,
  ),
);

/**
 * Voorstellen sluiten die door handelen achterhaald zijn. Draait in de
 * mail-cron; zo lopen de teller in het menu, de dagtaken en de lijst niet uit
 * elkaar. Geeft terug hoeveel er zijn gesloten.
 */
export async function sluitAchterhaaldeVoorstellen(): Promise<number> {
  const rijen = await db
    .update(inboxSuggestions)
    .set({ status: "reviewed", reviewedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(inboxSuggestions.status, "open"),
        isNull(inboxSuggestions.reviewedAt),
        or(
          sql`exists (select 1 from email_inbox e where e.id = ${inboxSuggestions.emailId}
              and (e.status <> 'new' or e.read_at is not null
                   or e.linked_purchase_order_id is not null or e.linked_quote_request_id is not null))`,
          beslisteKaart,
        ),
      ),
    )
    .returning({ id: inboxSuggestions.id });
  return rijen.length;
}

/** Zelfde regel, maar voor één mail — na het keuren of koppelen van die mail. */
export async function sluitVoorstellenVoorMail(emailId: string): Promise<void> {
  await db
    .update(inboxSuggestions)
    .set({ status: "reviewed", reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(inboxSuggestions.emailId, emailId), eq(inboxSuggestions.status, "open"), isNull(inboxSuggestions.reviewedAt)));
}

/** Voor de teller in het menu en de dagtaken: dezelfde definitie, één plek. */
export const openVoorstellenFilter = and(
  inArray(inboxSuggestions.status, ["open", "auto_archived"]),
  isNull(inboxSuggestions.reviewedAt),
  nogRelevant,
);
