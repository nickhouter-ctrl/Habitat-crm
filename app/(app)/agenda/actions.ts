"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, appointments } from "@/lib/db/schema";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

/** Combineer een date-input (YYYY-MM-DD) + optionele time-input (HH:MM) → Date. */
function combineDateTime(date: string, time: string, fallbackTime: string): Date | null {
  if (!date) return null;
  const t = /^\d{2}:\d{2}/.test(time) ? time : fallbackTime;
  const d = new Date(`${date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Zelf een afspraak in de agenda zetten. */
export async function createAppointment(formData: FormData) {
  await requireUser();
  const title = str(formData, "title");
  const startsAt = combineDateTime(str(formData, "date"), str(formData, "time"), "09:00");
  if (!title || !startsAt) throw new Error("Titel en datum zijn verplicht");

  const contactId = str(formData, "contactId");
  await db.insert(appointments).values({
    title,
    startsAt,
    location: str(formData, "location") || null,
    notes: str(formData, "notes") || null,
    contactId: contactId.length === 36 ? contactId : null,
    status: "scheduled",
  });
  revalidatePath("/agenda");
}

/** Een taak met (optionele) deadline — verschijnt in de agenda op de deadline. */
export async function createTask(formData: FormData) {
  await requireUser();
  const subject = str(formData, "subject");
  if (!subject) throw new Error("Taakomschrijving is verplicht");

  const date = str(formData, "date");
  const dueAt = date ? combineDateTime(date, str(formData, "time"), "17:00") : null;
  const contactId = str(formData, "contactId");
  await db.insert(activities).values({
    type: "task",
    subject,
    body: str(formData, "body") || null,
    dueAt,
    contactId: contactId.length === 36 ? contactId : null,
  });
  revalidatePath("/agenda");
}

/** Een losse notitie vastleggen (zonder deadline). */
export async function createNote(formData: FormData) {
  await requireUser();
  const body = str(formData, "body");
  if (!body) throw new Error("Notitie is leeg");
  const contactId = str(formData, "contactId");
  await db.insert(activities).values({
    type: "note",
    subject: str(formData, "subject") || null,
    body,
    contactId: contactId.length === 36 ? contactId : null,
  });
  revalidatePath("/agenda");
}

export async function completeTask(id: string) {
  await requireUser();
  await db.update(activities).set({ completedAt: new Date() }).where(eq(activities.id, id));
  revalidatePath("/agenda");
}

export async function reopenTask(id: string) {
  await requireUser();
  await db.update(activities).set({ completedAt: null }).where(eq(activities.id, id));
  revalidatePath("/agenda");
}

export async function deleteTask(id: string) {
  await requireUser();
  await db.delete(activities).where(eq(activities.id, id));
  revalidatePath("/agenda");
}

export async function deleteAppointment(id: string) {
  await requireUser();
  await db.delete(appointments).where(eq(appointments.id, id));
  revalidatePath("/agenda");
}
