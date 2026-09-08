/**
 * Opvolg-signalen: klanten die stil zijn gebleven na een offerte of na onze
 * laatste mail. Puur data-gedreven — geen extra kolommen: het signaal
 * verdwijnt vanzelf zodra er een mail van de klant binnenkomt (inbox) of wij
 * zelf opnieuw iets sturen (mailarchief). Er wordt hier nooit automatisch
 * gemaild; de startpagina toont het signaal en de medewerker beslist.
 */
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, documents, emailInbox, quoteRequests, sentEmails } from "@/lib/db/schema";

/** Na zoveel dagen stilte verschijnt het signaal. */
export const OPVOLG_DAGEN = 5;

const dagen = (sinds: Date): number =>
  Math.floor((Date.now() - sinds.getTime()) / 86_400_000);

export interface OpvolgOfferte {
  id: string;
  docNumber: string | null;
  title: string | null;
  contactNaam: string;
  contactEmail: string;
  dagenStil: number;
}

/**
 * Verstuurde offertes waar de klant sinds verzending niets van zich liet horen
 * (geen inkomende mail ná sentAt) en wij ook niet recent zelf opvolgden (geen
 * uitgaande mail in de laatste OPVOLG_DAGEN — die reset de timer).
 */
export async function offertesTeOpvolgen(): Promise<OpvolgOfferte[]> {
  const rows = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      title: documents.title,
      contactNaam: contacts.name,
      contactEmail: contacts.email,
      sentAt: documents.sentAt,
    })
    .from(documents)
    .innerJoin(contacts, eq(contacts.id, documents.contactId))
    .where(
      and(
        eq(documents.kind, "estimate"),
        eq(documents.status, "sent"),
        sql`${documents.sentAt} <= now() - make_interval(days => ${OPVOLG_DAGEN})`,
        isNull(documents.acceptedAt),
        isNull(documents.rejectedAt),
        sql`${contacts.email} is not null and ${contacts.email} <> ''`,
        sql`not exists (select 1 from ${emailInbox} where lower(${emailInbox.fromEmail}) = lower(${contacts.email}) and ${emailInbox.receivedAt} > ${documents.sentAt})`,
        sql`not exists (select 1 from ${sentEmails} where lower(${sentEmails.toEmail}) = lower(${contacts.email}) and ${sentEmails.createdAt} > now() - make_interval(days => ${OPVOLG_DAGEN}))`,
      ),
    )
    .orderBy(documents.sentAt);

  return rows.map((r) => ({
    id: r.id,
    docNumber: r.docNumber,
    title: r.title,
    contactNaam: r.contactNaam,
    contactEmail: r.contactEmail ?? "",
    dagenStil: r.sentAt ? dagen(r.sentAt) : OPVOLG_DAGEN,
  }));
}

export interface OpvolgAanvraag {
  id: string;
  naam: string;
  email: string;
  dagenStil: number;
}

/** SQL-fragment: laatste uitgaande mail naar het adres van de aanvraag. */
const LAATSTE_UIT = sql`(select max(${sentEmails.createdAt}) from ${sentEmails} where lower(${sentEmails.toEmail}) = lower(${quoteRequests.email}))`;

/**
 * Aanvragen waar wij het laatste woord hadden: onze laatste mail is ≥ OPVOLG_DAGEN
 * oud en er kwam sindsdien niets van dat adres binnen. Aanvragen zonder enige
 * uitgaande mail tellen niet mee ("open aanvraag" is al een eigen signaal), en
 * klanten met een openstaande verstuurde offerte ook niet (die vallen onder
 * het offerte-signaal).
 */
export async function aanvragenTeOpvolgen(): Promise<OpvolgAanvraag[]> {
  const rows = await db
    .select({
      id: quoteRequests.id,
      naam: quoteRequests.name,
      email: quoteRequests.email,
      laatsteUit: sql<string | null>`${LAATSTE_UIT}`,
    })
    .from(quoteRequests)
    .where(
      and(
        sql`${quoteRequests.status} in ('pending', 'accepted')`,
        sql`${LAATSTE_UIT} <= now() - make_interval(days => ${OPVOLG_DAGEN})`,
        sql`not exists (select 1 from ${emailInbox} where lower(${emailInbox.fromEmail}) = lower(${quoteRequests.email}) and ${emailInbox.receivedAt} > ${LAATSTE_UIT})`,
        sql`not exists (select 1 from ${documents} d join ${contacts} c on c.id = d.contact_id where lower(c.email) = lower(${quoteRequests.email}) and d.kind = 'estimate' and d.status = 'sent')`,
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    naam: r.naam,
    email: r.email,
    dagenStil: r.laatsteUit ? dagen(new Date(r.laatsteUit)) : OPVOLG_DAGEN,
  }));
}

/**
 * Voor de aanvraag-detailpagina: hoeveel dagen is de klant al stil na onze
 * laatste mail? Null = geen banner (nooit gemaild, klant reageerde, of nog
 * binnen de termijn).
 */
export async function aanvraagStilSinds(email: string): Promise<number | null> {
  if (!email) return null;
  const [row] = await db
    .select({
      laatsteUit: sql<string | null>`max(${sentEmails.createdAt})`,
      reactieNa: sql<string | null>`(select max(${emailInbox.receivedAt}) from ${emailInbox} where lower(${emailInbox.fromEmail}) = lower(${email}))`,
    })
    .from(sentEmails)
    .where(sql`lower(${sentEmails.toEmail}) = lower(${email})`);

  if (!row?.laatsteUit) return null;
  const uit = new Date(row.laatsteUit);
  if (row.reactieNa && new Date(row.reactieNa) > uit) return null;
  const stil = dagen(uit);
  return stil >= OPVOLG_DAGEN ? stil : null;
}
