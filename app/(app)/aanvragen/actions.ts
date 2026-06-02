"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, appointments, contacts, quoteRequests } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

const SHOWROOM = "Showroom — Camí de la Fontana 3, Jávea";

/** Zorg dat er een contact bij de aanvraag hoort (maak aan indien nodig). */
async function ensureContactForRequest(req: {
  contactId: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
}): Promise<string> {
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
  const location = String(formData.get("location") ?? "").trim() || SHOWROOM;
  const note = String(formData.get("note") ?? "").trim();
  if (!date || !time) redirect(`/aanvragen/${quoteRequestId}?error=datum`);
  const startsAt = new Date(`${date}T${time}`);
  if (Number.isNaN(startsAt.getTime())) redirect(`/aanvragen/${quoteRequestId}?error=datum`);

  const contactId = await ensureContactForRequest(req);

  await db.insert(appointments).values({
    title: `Showroombezoek — ${req.name}`,
    contactId,
    quoteRequestId,
    startsAt,
    location,
    notes: note || null,
    createdBy: user.id,
  });

  await db
    .update(quoteRequests)
    .set({ status: "accepted", acceptedAt: req.acceptedAt ?? new Date(), contactId, updatedAt: new Date() })
    .where(eq(quoteRequests.id, quoteRequestId));

  const when = startsAt.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    await sendEmail({
      to: req.email,
      subject: "Bevestiging afspraak — Habitat One",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px">
  <h2 style="color:#402419;margin:0 0 12px">Je afspraak is bevestigd</h2>
  <p>Beste ${escapeHtml(req.name)},</p>
  <p>We kijken ernaar uit je te ontvangen:</p>
  <p style="font-size:16px;margin:14px 0"><strong>${escapeHtml(when)}</strong><br/>${escapeHtml(location)}</p>
  ${note ? `<p style="white-space:pre-wrap">${escapeHtml(note)}</p>` : ""}
  <p style="margin-top:18px">Tot snel!<br/>Habitat One</p>
</div>`,
      text: `Je afspraak is bevestigd:\n${when}\n${location}${note ? `\n\n${note}` : ""}\n\nHabitat One`,
    });
  } catch (err) {
    console.warn("[aanvragen] afspraak-bevestiging mislukt:", err);
  }

  await db.insert(activities).values({
    type: "note",
    subject: `Afspraak ingepland — ${when}`,
    body: `${location}${note ? `\n${note}` : ""}`,
    contactId,
    authorId: user.id,
  });

  revalidatePath("/agenda");
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${quoteRequestId}`);
  redirect("/agenda");
}

/** Mail de klant direct vanuit een aanvraag (bv. met extra vragen). */
export async function mailQuoteRequestCustomer(quoteRequestId: string, formData: FormData) {
  const user = await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, quoteRequestId) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  const subject = String(formData.get("subject") ?? "").trim() || "Je aanvraag bij Habitat One";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) redirect(`/aanvragen/${quoteRequestId}?error=leeg`);

  let sent = false;
  try {
    const res = await sendEmail({
      to: req.email,
      subject,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px;white-space:pre-wrap">${escapeHtml(message)}</div>`,
      text: message,
    });
    sent = res.sent;
  } catch (err) {
    console.warn("[aanvragen] klant-mail mislukt:", err);
  }

  await db.insert(activities).values({
    type: "email",
    subject: `Mail naar klant — ${subject}`,
    body: message,
    contactId: req.contactId,
    authorId: user.id,
  });

  revalidatePath(`/aanvragen/${quoteRequestId}`);
  redirect(`/aanvragen/${quoteRequestId}?gemaild=${sent ? "1" : "0"}`);
}
