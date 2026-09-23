import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, appointments, contacts, quoteRequests } from "@/lib/db/schema";
import { appointmentConfirmedEmail, sendEmail } from "@/lib/email";

export const SHOWROOM = "Showroom — Camí de la Fontana 3, Jávea";
/**
 * De beursstand. Een afspraak die via de beurspagina op de website binnenkomt
 * is géén showroombezoek: de klant staat over twee weken in Valencia, niet in
 * Jávea. Alles wat "showroom" zegt — de locatie, de agenda-titel, de mails en
 * de kies-pagina — moet dan meebewegen, anders stuur je iemand naar de
 * verkeerde stad.
 */
export const BEURSSTAND = "360 by Cevisama — Feria Valencia, stand C109";

/**
 * Hoort deze aanvraag bij de beurs? De website zet dat in de bron
 * (`website:feria-360-cevisama-2026`); dat is het enige veld waar het
 * betrouwbaar in staat — de berichttekst is vrije tekst van de klant.
 */
export function isBeursAanvraag(source: string | null | undefined): boolean {
  return (source ?? "").toLowerCase().startsWith("website:feria");
}

/** De standaardlocatie voor een afspraak uit deze aanvraag. */
export function standaardLocatie(source: string | null | undefined): string {
  return isBeursAanvraag(source) ? BEURSSTAND : SHOWROOM;
}

export type AppointmentReq = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  contactId: string | null;
  locale: string | null;
  acceptedAt: Date | null;
  /** Bron van de website — bepaalt of dit een beurs- of showroomafspraak is. */
  source?: string | null;
};

/** Zorg dat er een contact bij de aanvraag hoort (maak aan indien nodig). */
export async function ensureContactForRequest(req: AppointmentReq): Promise<string> {
  if (req.contactId) return req.contactId;
  const existing = await db.query.contacts.findFirst({ where: eq(contacts.email, req.email) });
  if (existing) return existing.id;
  const [c] = await db
    .insert(contacts)
    .values({
      name: req.name,
      email: req.email,
      phone: req.phone ?? null,
      source: "website-aanvraag",
      type: "lead",
      notes: req.company ? `Bedrijf: ${req.company}` : null,
    })
    .returning({ id: contacts.id });
  return c.id;
}

/**
 * Bevestig een afspraak: maak (indien nodig) een contact, zet de afspraak in de
 * agenda (tabel `appointments` → iCal-feed), zet de aanvraag op 'accepted',
 * stuurt de klant een bevestigingsmail en logt een activiteit.
 * Gedeeld door de CRM-actie (medewerker) én de publieke kies-pagina (klant).
 */
export async function confirmAppointment(
  req: AppointmentReq,
  opts: { startsAt: Date; location?: string | null; note?: string | null; createdBy?: string | null },
): Promise<{ when: string; contactId: string }> {
  const beurs = isBeursAanvraag(req.source);
  const location = (opts.location ?? "").trim() || standaardLocatie(req.source);
  const note = (opts.note ?? "").trim() || null;
  const contactId = await ensureContactForRequest(req);

  await db.insert(appointments).values({
    title: `${beurs ? "Beursafspraak" : "Showroombezoek"} — ${req.name}`,
    contactId,
    quoteRequestId: req.id,
    startsAt: opts.startsAt,
    location,
    notes: note,
    createdBy: opts.createdBy ?? null,
  });

  await db
    .update(quoteRequests)
    .set({ status: "accepted", acceptedAt: req.acceptedAt ?? new Date(), contactId, updatedAt: new Date() })
    .where(eq(quoteRequests.id, req.id));

  const when = opts.startsAt.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    const mail = appointmentConfirmedEmail({ lang: req.locale, contactName: req.name, when, location, note, fair: beurs });
    await sendEmail({ to: req.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.warn("[appointments] bevestigingsmail mislukt:", err);
  }

  await db.insert(activities).values({
    type: "note",
    subject: `Afspraak ingepland — ${when}`,
    body: `${location}${note ? `\n${note}` : ""}`,
    contactId,
    authorId: opts.createdBy ?? null,
  });

  return { when, contactId };
}
