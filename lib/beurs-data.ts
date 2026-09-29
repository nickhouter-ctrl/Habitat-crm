import "server-only";

/**
 * De gesprekken van de beurs uit de database halen — één plek, want zowel het
 * scherm als de CSV-download leest ze.
 */
import { desc, eq, like } from "drizzle-orm";

import { db } from "@/lib/db";
import type { BeursGesprek } from "@/lib/beurs-lijst";
import { contacts, quoteRequests } from "@/lib/db/schema";

/**
 * Alle beursgesprekken, nieuwste eerst. `beurs:%` en niet alleen de huidige
 * beurs: volgend jaar staat de vorige lijst er dan nog netjes bij.
 */
export async function haalBeursGesprekken(limiet = 2000): Promise<BeursGesprek[]> {
  return db
    .select({
      aanvraagId: quoteRequests.id,
      contactId: quoteRequests.contactId,
      naam: quoteRequests.name,
      email: quoteRequests.email,
      telefoon: quoteRequests.phone,
      bedrijf: quoteRequests.company,
      bericht: quoteRequests.message,
      taal: quoteRequests.locale,
      tags: contacts.tags,
      wanneer: quoteRequests.createdAt,
      plaats: contacts.city,
      land: contacts.country,
      lat: contacts.latitude,
      lon: contacts.longitude,
    })
    .from(quoteRequests)
    .leftJoin(contacts, eq(contacts.id, quoteRequests.contactId))
    .where(like(quoteRequests.source, "beurs:%"))
    .orderBy(desc(quoteRequests.createdAt))
    .limit(limiet);
}
