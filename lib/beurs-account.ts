import "server-only";

/**
 * Meteen een website-account voor wie we op de beurs spreken.
 *
 * Normaal vraagt een klant een account aan en keuren wij het goed. Op de beurs
 * is die goedkeuring al gebeurd — aan de stand, in een gesprek. Dus krijgt de
 * bezoeker de "stel je wachtwoord in"-knop meteen in zijn bevestigingsmail en
 * kan hij dezelfde avond nog het assortiment met prijzen bekijken.
 *
 * Eén ding blijft bewust streng. Zakelijke prijzen horen bij een bedrijf, en
 * iedereen die langsloopt kan de QR-code scannen en "architect" aanvinken.
 * Vandaar `bepaalTier`: een zakelijke rol levert alleen zakelijke prijzen op
 * als wíj de bezoeker hebben ingevoerd, of als hij zelf een bedrijfsnaam heeft
 * ingevuld. Twijfelgevallen worden particulier; dat is bij Accounts met één
 * klik om te zetten, andersom moeten we het terugnemen.
 */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { websiteActivationLink, mailLanguage } from "@/lib/portal/website-activation";

const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.habitat-one.com";

export interface BeursAccount {
  /** Link om een wachtwoord in te stellen; null als er al een actief account is. */
  activatieLink: string | null;
  tier: "particulier" | "aannemer";
}

/**
 * Account klaarzetten en de activatielink teruggeven. Faalt dit, dan mag de
 * bezoeker daar niets van merken: de aanroeper vangt de fout en stuurt de
 * bevestigingsmail zonder knop.
 */
export async function zetBeursAccountKlaar(args: {
  email: string;
  naam: string;
  contactId: string | null;
  bedrijf?: string | null;
  taal: string | null;
  tier: "particulier" | "aannemer";
}): Promise<BeursAccount> {
  const email = args.email.trim().toLowerCase();
  const token = randomBytes(24).toString("base64url");
  const verloopt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const bestaand = await db.query.customerAccounts.findFirst({
    where: sql`lower(${customerAccounts.email}) = ${email}`,
    columns: { id: true, status: true, priceTier: true, contactId: true },
  });

  if (bestaand) {
    // Al ingelogd geweest? Dan geen nieuwe wachtwoordlink meesturen — die zou
    // in een doorgestuurde mail een sleutel tot zijn account zijn. Het tarief
    // laten we ook staan; dat is een beslissing die al genomen is.
    if (bestaand.status === "active") return { activatieLink: null, tier: bestaand.priceTier };
    await db
      .update(customerAccounts)
      .set({
        contactId: bestaand.contactId ?? args.contactId,
        websiteAccess: true,
        activationToken: token,
        activationExpires: verloopt,
        updatedAt: new Date(),
      })
      .where(eq(customerAccounts.id, bestaand.id));
    return {
      activatieLink: websiteActivationLink(WEBSITE_URL, token, mailLanguage(args.taal)),
      tier: bestaand.priceTier,
    };
  }

  await db.insert(customerAccounts).values({
    contactId: args.contactId,
    email,
    priceTier: args.tier,
    status: "pending",
    websiteAccess: true,
    businessName: args.bedrijf?.trim() || null,
    activationToken: token,
    activationExpires: verloopt,
  });

  return {
    activatieLink: websiteActivationLink(WEBSITE_URL, token, mailLanguage(args.taal)),
    tier: args.tier,
  };
}
