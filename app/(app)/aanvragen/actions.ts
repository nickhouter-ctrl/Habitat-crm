"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, contacts, quoteRequests } from "@/lib/db/schema";
import { appointmentProposalEmail, sendEmail } from "@/lib/email";
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
