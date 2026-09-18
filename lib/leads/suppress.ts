/**
 * Een adres op de afmeldlijst zetten. Één plek, want dit moet overal precies
 * hetzelfde gebeuren: bij een afmelding via de link, bij een bounce en bij een
 * spamklacht. Een adres dat hier belandt wordt door de wachtrij-SQL voor altijd
 * overgeslagen, over campagnes heen.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailSuppressions, prospects } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/leads/normalize";

export type SuppressReden = "unsubscribed" | "bounced" | "complaint" | "manual";

/** Reden → status die de prospect krijgt. */
const PROSPECT_STATUS: Record<SuppressReden, "unsubscribed" | "bounced"> = {
  unsubscribed: "unsubscribed",
  complaint: "unsubscribed",
  bounced: "bounced",
  manual: "unsubscribed",
};

/**
 * Zet het adres op de lijst en werk de prospect bij. Genormaliseerd, want
 * "Info@X.es" en "info@x.es" zijn hetzelfde postvak — een afmelding op de ene
 * schrijfwijze moet de andere ook dekken.
 */
export async function onderdruk(
  email: string,
  reden: SuppressReden,
): Promise<{ adres: string | null; prospectBijgewerkt: boolean }> {
  const adres = normalizeEmail(email);
  if (!adres) return { adres: null, prospectBijgewerkt: false };

  await db
    .insert(emailSuppressions)
    .values({ email: adres, reason: reden })
    .onConflictDoNothing({ target: emailSuppressions.email });

  const rijen = await db
    .update(prospects)
    .set({ status: PROSPECT_STATUS[reden], updatedAt: new Date() })
    .where(sql`lower(${prospects.email}) = ${adres}`)
    .returning({ id: prospects.id });

  return { adres, prospectBijgewerkt: rijen.length > 0 };
}

/**
 * Zachte bounce: het postvak is vol of tijdelijk onbereikbaar. Niet op de
 * afmeldlijst — dat zou een goede klant voorgoed uitsluiten — maar een week
 * met rust laten.
 */
export async function stelUit(email: string, dagen = 7): Promise<void> {
  const adres = normalizeEmail(email);
  if (!adres) return;
  await db
    .update(prospects)
    .set({ suppressUntil: new Date(Date.now() + dagen * 86_400_000), updatedAt: new Date() })
    .where(eq(sql`lower(${prospects.email})`, adres));
}
