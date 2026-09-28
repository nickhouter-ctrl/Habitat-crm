"use server";

/**
 * Een beursinvoer weer weggooien.
 *
 * Op een stand wordt getest, verkeerd getypt en dubbel ingedrukt; dan wil je
 * die regel weg kunnen halen zonder in de database te duiken. Weg is hier écht
 * weg: het gesprek, het contact dat er alleen door bestond, en het website-
 * account dat we klaarzetten.
 *
 * Drie grenzen, omdat verwijderen niet terug te draaien is:
 *  1. alleen gesprekken met een beursbron;
 *  2. het contact alleen als het van de beurs kwam én er verder niets aan
 *     hangt — een offerte, project, pand of afspraak houdt het tegen;
 *  3. het account alleen zolang er nog nooit mee is ingelogd (geen wachtwoord).
 */
import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  appointments,
  consignments,
  contacts,
  customerAccounts,
  deals,
  documents,
  projects,
  properties,
  quoteRequests,
  referrals,
  sampleMovements,
} from "@/lib/db/schema";

/** Telt wat er nog aan een contact hangt; alles op 0 = veilig te verwijderen. */
async function watHangtEraan(contactId: string): Promise<string[]> {
  const [rij] = await db
    .select({
      offertes: sql<number>`(select count(*) from ${documents} where ${documents.contactId} = ${contactId})::int`,
      projecten: sql<number>`(select count(*) from ${projects} where ${projects.contactId} = ${contactId})::int`,
      deals: sql<number>`(select count(*) from ${deals} where ${deals.contactId} = ${contactId})::int`,
      panden: sql<number>`(select count(*) from ${properties} where ${properties.ownerContactId} = ${contactId})::int`,
      afspraken: sql<number>`(select count(*) from ${appointments} where ${appointments.contactId} = ${contactId})::int`,
      stalen: sql<number>`(select count(*) from ${sampleMovements} where ${sampleMovements.recipientId} = ${contactId})::int`,
      consignatie: sql<number>`(select count(*) from ${consignments} where ${consignments.resellerId} = ${contactId})::int`,
      aanbreng: sql<number>`(select count(*) from ${referrals} where ${referrals.referrerContactId} = ${contactId} or ${referrals.refereeContactId} = ${contactId})::int`,
    })
    .from(sql`(select 1) as x`);

  const labels: Record<string, string> = {
    offertes: "offertes of facturen",
    projecten: "projecten",
    deals: "deals",
    panden: "panden",
    afspraken: "afspraken",
    stalen: "stalenritten",
    consignatie: "consignatie",
    aanbreng: "aanbrengrelaties",
  };
  return Object.entries(rij ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([k]) => labels[k] ?? k);
}

export type VerwijderResultaat = { ok: true; melding: string } | { ok: false; fout: string };

export async function verwijderBeursInvoer(formData: FormData): Promise<VerwijderResultaat> {
  await requireModule("aanvragen");
  const contactId = String(formData.get("contactId") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email && !contactId) return { ok: false, fout: "Niets om te verwijderen." };

  // 1. De gesprekken van de beurs.
  const weg = await db
    .delete(quoteRequests)
    .where(
      and(
        like(quoteRequests.source, "beurs:%"),
        contactId
          ? or(eq(quoteRequests.contactId, contactId), sql`lower(${quoteRequests.email}) = ${email}`)
          : sql`lower(${quoteRequests.email}) = ${email}`,
      ),
    )
    .returning({ id: quoteRequests.id });

  const delen: string[] = [`${weg.length} ${weg.length === 1 ? "invoer" : "invoeren"} verwijderd`];

  // 2. Het account, zolang er nog nooit mee is ingelogd.
  if (email) {
    const wegAccount = await db
      .delete(customerAccounts)
      .where(
        and(
          sql`lower(${customerAccounts.email}) = ${email}`,
          eq(customerAccounts.status, "pending"),
          isNull(customerAccounts.passwordHash),
          isNull(customerAccounts.lastLoginAt),
        ),
      )
      .returning({ id: customerAccounts.id });
    if (wegAccount.length) delen.push("website-account ingetrokken");
  }

  // 3. Het contact — alleen als het van de beurs kwam en er niets aan hangt.
  if (contactId) {
    const c = await db.query.contacts.findFirst({
      where: eq(contacts.id, contactId),
      columns: { id: true, source: true, name: true },
    });
    if (c) {
      if (!c.source?.startsWith("beurs:")) {
        delen.push("het contact bleef staan (het kwam niet van de beurs)");
      } else {
        const blokkades = await watHangtEraan(contactId);
        if (blokkades.length) {
          delen.push(`het contact bleef staan — er hangen nog ${blokkades.join(", ")} aan`);
        } else {
          await db.delete(contacts).where(eq(contacts.id, contactId));
          delen.push("contact verwijderd");
        }
      }
    }
  }

  revalidatePath("/beurs");
  revalidatePath("/beurs/contacten");
  revalidatePath("/contacts");
  revalidatePath("/aanvragen");
  return { ok: true, melding: delen.join(" · ") };
}
