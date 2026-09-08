"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { genereerMailAntwoord } from "@/lib/ai-reply";
import { db } from "@/lib/db";
import { activities, contacts, quoteRequests, users } from "@/lib/db/schema";
import { asStringArray } from "@/lib/documents";
import { appointmentProposalEmail, sendEmail } from "@/lib/email";
import { recordSentEmail } from "@/lib/sent-email";
import { catalogusMailBijlagen, listCatalogFiles } from "@/lib/storage";
import { confirmAppointment } from "@/lib/appointments";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

async function baseUrl(): Promise<string> {
  const fixed = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/**
 * Accepteer een aanvraag: maak (indien nodig) een contact aan en koppel.
 * Mail-versturing komt later — schrijven we hier op een latere iteratie aan.
 */
export async function acceptQuoteRequest(id: string) {
  await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, id) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  let contactId = req.contactId;
  if (!contactId) {
    // Zoek bestaand contact op e-mail
    const existing = await db.query.contacts.findFirst({ where: eq(contacts.email, req.email) });
    if (existing) {
      contactId = existing.id;
    } else {
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
      contactId = c.id;
    }
  }

  await db
    .update(quoteRequests)
    .set({ status: "accepted", acceptedAt: new Date(), contactId, updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));

  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
  revalidatePath("/");
}

export async function rejectQuoteRequest(id: string) {
  await requireUser();
  await db
    .update(quoteRequests)
    .set({ status: "rejected", rejectedAt: new Date(), updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
  revalidatePath("/");
}

export async function reopenQuoteRequest(id: string) {
  await requireUser();
  await db
    .update(quoteRequests)
    .set({ status: "pending", acceptedAt: null, rejectedAt: null, updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
}

export async function deleteQuoteRequest(id: string) {
  await requireUser();
  await db.delete(quoteRequests).where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  redirect("/aanvragen");
}

export async function saveQuoteRequestNotes(id: string, formData: FormData) {
  await requireUser();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await db.update(quoteRequests).set({ notes, updatedAt: new Date() }).where(eq(quoteRequests.id, id));
  revalidatePath(`/aanvragen/${id}`);
}

/**
 * Plan een afspraak (showroombezoek) uit een aanvraag: maakt een agenda-item,
 * koppelt/maakt het contact, stuurt de klant een bevestigingsmail en zet de
 * aanvraag op 'accepted'.
 */
export async function scheduleAppointment(quoteRequestId: string, formData: FormData) {
  const user = await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, quoteRequestId) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!date || !time) redirect(`/aanvragen/${quoteRequestId}?error=datum`);
  const startsAt = new Date(`${date}T${time}`);
  if (Number.isNaN(startsAt.getTime())) redirect(`/aanvragen/${quoteRequestId}?error=datum`);

  await confirmAppointment(req, { startsAt, location, note, createdBy: user.id });

  revalidatePath("/agenda");
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${quoteRequestId}`);
  redirect("/agenda");
}

/**
 * Stel meerdere alternatieve momenten voor: bewaar de slots + een token en mail
 * de klant een link naar de publieke kies-pagina. De klant kiest er één → de
 * afspraak wordt dan automatisch bevestigd (in de agenda).
 */
export async function proposeSlots(quoteRequestId: string, formData: FormData) {
  const user = await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, quoteRequestId) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  const slots: { date: string; time: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const date = String(formData.get(`date_${i}`) ?? "").trim();
    const time = String(formData.get(`time_${i}`) ?? "").trim();
    if (date && time && !Number.isNaN(new Date(`${date}T${time}`).getTime())) slots.push({ date, time });
  }
  if (slots.length === 0) redirect(`/aanvragen/${quoteRequestId}?error=slots`);

  const token = req.bookingToken ?? newToken();
  await db
    .update(quoteRequests)
    .set({ proposedSlots: slots, bookingToken: token, status: "proposed", updatedAt: new Date() })
    .where(eq(quoteRequests.id, quoteRequestId));

  const url = `${await baseUrl()}/book/${token}`;
  try {
    const mail = appointmentProposalEmail({ lang: req.locale, contactName: req.name, url });
    await sendEmail({ to: req.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.warn("[aanvragen] voorstel-mail mislukt:", err);
  }

  await db.insert(activities).values({
    type: "note",
    subject: `Afspraak-voorstel verstuurd (${slots.length} ${slots.length === 1 ? "optie" : "opties"})`,
    body: slots.map((s) => `${s.date} ${s.time}`).join(" · "),
    contactId: req.contactId,
    authorId: user.id,
  });

  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${quoteRequestId}`);
  redirect(`/aanvragen/${quoteRequestId}?proposed=1`);
}

/** AI-concept voor "Mail de klant": nette, professionele mail in de taal van
 *  de aanvraag. De `instructie` is wat de medewerker alvast in het tekstvak
 *  typte (mag leeg). Alleen een concept — versturen blijft een aparte klik. */
export async function aiAanvraagConcept(
  quoteRequestId: string,
  instructie: string,
): Promise<{ subject: string; body: string; bijlagen: string[] } | null> {
  const user = await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, quoteRequestId) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  // Naam vers uit de DB — de JWT-sessie kan een oude naam cachen.
  const me = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { name: true },
  });

  const kindTekst: Record<string, string> = {
    quote: "offerte-aanvraag via de website",
    appointment: "verzoek voor een showroombezoek/afspraak",
    contact: "contactbericht via de website",
  };

  return genereerMailAntwoord({
    soort: "aanvraag",
    klantNaam: req.name,
    klantEmail: req.email,
    onderwerp: kindTekst[req.kind] ?? "aanvraag via de website",
    bericht:
      [
        req.message?.trim(),
        req.appointmentDate || req.appointmentTime
          ? `Gewenst moment: ${[req.appointmentDate, req.appointmentTime].filter(Boolean).join(" ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n") || "(geen berichttekst — alleen gegevens en/of producten)",
    taal: req.locale,
    producten: asStringArray(req.productNames),
    medewerker: me?.name ?? user.name ?? "Habitat One",
    instructie,
    beschikbareBijlagen: (await listCatalogFiles()).map((f) => f.path),
  });
}

/** Mail de klant direct vanuit een aanvraag (bv. met extra vragen). */
export async function mailQuoteRequestCustomer(quoteRequestId: string, formData: FormData) {
  const user = await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, quoteRequestId) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  const subject = String(formData.get("subject") ?? "").trim() || "Je aanvraag bij Habitat One";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) redirect(`/aanvragen/${quoteRequestId}?error=leeg`);

  const bijlagePaden = formData.getAll("bijlage").map((v) => String(v));

  let sent = false;
  try {
    const attachments = await catalogusMailBijlagen(bijlagePaden);
    const res = await sendEmail({
      to: req.email,
      subject,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px;white-space:pre-wrap">${escapeHtml(message)}</div>`,
      text: message,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    sent = res.sent;
  } catch (err) {
    console.warn("[aanvragen] klant-mail mislukt:", err);
  }

  if (sent) {
    // Archief: zo verschijnt de mail in de conversatie op de aanvraag-pagina.
    const tekst = message + (bijlagePaden.length > 0 ? `\n\n📎 ${bijlagePaden.join(", ")}` : "");
    await recordSentEmail({
      kind: "other",
      toEmail: req.email,
      subject,
      html: `<div style="white-space:pre-wrap">${escapeHtml(tekst)}</div>`,
      text: tekst,
      contactId: req.contactId,
    });
  }

  await db.insert(activities).values({
    type: "email",
    subject: `Mail naar klant — ${subject}`,
    body:
      message +
      (bijlagePaden.length > 0 ? `\n\nBijlagen: ${bijlagePaden.join(", ")}` : ""),
    contactId: req.contactId,
    authorId: user.id,
  });

  revalidatePath(`/aanvragen/${quoteRequestId}`);
  redirect(`/aanvragen/${quoteRequestId}?gemaild=${sent ? "1" : "0"}`);
}
