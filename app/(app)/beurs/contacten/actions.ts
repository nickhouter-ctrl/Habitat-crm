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
import { and, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth/guards";
import { haalBeursGesprekken } from "@/lib/beurs-data";
import { vindDubbeleInvoeren } from "@/lib/beurs-lijst";
import { beursBijlagen } from "@/lib/beurs-bijlagen";
import { beursVervolgmail, vervolgmailHtml, vervolgmailTekst } from "@/lib/beurs-vervolgmail";
import { brandedEmail, escapeHtml, sendEmail, signatureHtml } from "@/lib/email";
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

/** Tag op het contact zodra de filmmail eruit is; zo krijgt niemand hem twee keer. */
const FILM_MAIL_TAG = "beurs:film-mail";

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

/**
 * Dubbele invoeren opruimen.
 *
 * Twee tikken die door elkaar heen liepen leverden twee identieke regels op.
 * Dat kan niet meer gebeuren, maar wat er al staat moet eruit kunnen zonder in
 * de database te duiken. Strenge regels (zelfde adres, zelfde bericht, binnen
 * twee minuten) staan in `vindDubbeleInvoeren`; hier alleen het opruimen, en
 * we houden altijd de oudste.
 */
export async function ruimDubbeleInvoerenOp(): Promise<VerwijderResultaat> {
  await requireModule("aanvragen");
  const groepen = vindDubbeleInvoeren(await haalBeursGesprekken());
  const weg = groepen.flatMap((g) => g.weg);
  if (weg.length === 0) return { ok: true, melding: "Geen dubbele invoeren gevonden." };

  // Welke contacten hingen eraan? Een dubbele invoer maakte soms ook een tweede
  // contactkaart aan; die moet mee, maar alleen als er verder niets aan hangt.
  const rijen = await db
    .select({ id: quoteRequests.id, contactId: quoteRequests.contactId })
    .from(quoteRequests)
    .where(inArray(quoteRequests.id, weg));

  await db.delete(quoteRequests).where(inArray(quoteRequests.id, weg));

  let contactenWeg = 0;
  for (const contactId of new Set(rijen.map((r) => r.contactId).filter((x): x is string => !!x))) {
    const c = await db.query.contacts.findFirst({
      where: eq(contacts.id, contactId),
      columns: { id: true, source: true },
    });
    if (!c?.source?.startsWith("beurs:")) continue;
    // Nog een aanvraag aan deze kaart? Dan is het de kaart die we houden.
    const restAanvragen = await db.query.quoteRequests.findFirst({
      where: eq(quoteRequests.contactId, contactId),
      columns: { id: true },
    });
    if (restAanvragen) continue;
    if ((await watHangtEraan(contactId)).length) continue;
    await db.delete(contacts).where(eq(contacts.id, contactId));
    contactenWeg += 1;
  }

  revalidatePath("/beurs");
  revalidatePath("/beurs/contacten");
  revalidatePath("/contacts");
  revalidatePath("/aanvragen");
  return {
    ok: true,
    melding: [
      `${weg.length} dubbele ${weg.length === 1 ? "invoer" : "invoeren"} opgeruimd`,
      contactenWeg ? `${contactenWeg} dubbele contactkaart${contactenWeg === 1 ? "" : "en"} verwijderd` : "",
      `(${groepen.map((g) => g.naam).join(", ")})`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/**
 * De opvolgmail met de films versturen.
 *
 * Twee dingen moeten hier kloppen. Niemand mag hem twee keer krijgen — de
 * bevestigingsmail is vandaag al een keer dubbel verstuurd, dat hoeft niet nog
 * eens — dus wie hem heeft gehad krijgt de tag `beurs:film-mail` en wordt
 * daarna overgeslagen. En het moet in porties: bij tientallen ontvangers loopt
 * één verzoek anders tegen de tijdgrens aan. Blijft er iets over, dan zegt de
 * melding hoeveel; nog een keer klikken pakt de rest.
 */
const PORTIE = 25;

export async function stuurBeursVervolgmail(): Promise<VerwijderResultaat> {
  await requireModule("aanvragen");

  const ontvangers = await db
    .selectDistinctOn([contacts.id], {
      id: contacts.id,
      naam: contacts.name,
      email: contacts.email,
      tags: contacts.tags,
    })
    .from(quoteRequests)
    .innerJoin(contacts, eq(contacts.id, quoteRequests.contactId))
    .where(and(like(quoteRequests.source, "beurs:%"), isNotNull(contacts.email)));

  const teDoen = ontvangers.filter((c) => !(c.tags ?? []).includes(FILM_MAIL_TAG));
  if (teDoen.length === 0) {
    return { ok: true, melding: "Iedereen heeft de films al gehad." };
  }

  let verstuurd = 0;
  let mislukt = 0;
  for (const c of teDoen.slice(0, PORTIE)) {
    const tekst = beursVervolgmail(c.naam ?? "");
    try {
      const res = await sendEmail({
        to: c.email!,
        subject: tekst.subject,
        attachments: await beursBijlagen(),
        html: brandedEmail(vervolgmailHtml(c.naam ?? "", signatureHtml())),
        text: vervolgmailTekst(c.naam ?? ""),
      });
      if (!res.sent) throw new Error(res.reason ?? "niet verstuurd");
      // Pas tággen als hij écht weg is; anders slaan we iemand over die niets kreeg.
      await db
        .update(contacts)
        .set({ tags: [...new Set([...(c.tags ?? []), FILM_MAIL_TAG])], updatedAt: new Date() })
        .where(eq(contacts.id, c.id));
      verstuurd += 1;
    } catch (err) {
      console.warn(`[beurs] filmmail mislukt voor ${c.email}:`, err);
      mislukt += 1;
    }
  }

  const rest = teDoen.length - verstuurd - mislukt;
  revalidatePath("/beurs/contacten");
  return {
    ok: true,
    melding: [
      `${verstuurd} ${verstuurd === 1 ? "mail" : "mails"} verstuurd`,
      mislukt ? `${mislukt} mislukt (staat nog open)` : "",
      rest > 0 ? `${rest} nog te gaan — klik nog een keer` : "klaar",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
