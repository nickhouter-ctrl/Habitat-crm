"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { z } from "zod";
import { heeftCap } from "@/lib/auth/modules";
import { randomUUID } from "node:crypto";
import { changeAgendaTask } from "@/lib/agenda-task-completion";
import { agendaDateTime } from "@/lib/agenda-dates";
import { sendQueuedStaffNotification } from "@/lib/staff-notifications";
import { db } from "@/lib/db";
import { activities, appointments, contacts, staffNotifications, users } from "@/lib/db/schema";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireModule("agenda");
}

/** Combineer een date-input (YYYY-MM-DD) + optionele time-input (HH:MM) → Date. */
const optionalId = z.union([z.string().uuid(), z.literal("")]);
const shortTitle = z.string().trim().min(1).max(250).regex(/^[^\r\n]+$/);
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function existingRequest(tx:Tx,userId:string,id:string,kind:'task'|'appointment'){
  await tx.select({id:users.id}).from(users).where(eq(users.id,userId)).for('update');
  const [existing]=kind==='task'?await tx.select({owner:activities.authorId}).from(activities).where(eq(activities.id,id)):await tx.select({owner:appointments.createdBy}).from(appointments).where(eq(appointments.id,id));
  if(!existing)return null;
  if(existing.owner!==userId)throw new Error('Invalid request');
  const [notice]=await tx.select({id:staffNotifications.id}).from(staffNotifications).where(eq(staffNotifications.eventKey,`${kind}:${id}`));
  if(!notice && kind==='task')throw new Error('Invalid request');
  return {notificationId:notice?.id ?? null};
}
async function checkReferences(tx: Tx, contactId: string, assigneeId: string) {
  if(contactId){const [c]=await tx.select({id:contacts.id}).from(contacts).where(eq(contacts.id,contactId));if(!c)throw new Error('Contact niet gevonden.');}
  if(assigneeId){const [u]=await tx.select({role:users.role}).from(users).where(eq(users.id,assigneeId));if(!u||!heeftCap(u.role,'schrijven'))throw new Error('Kies een medewerker die taken mag uitvoeren.');}
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Zelf een afspraak in de agenda zetten. */
export async function createAppointment(formData: FormData) {
  await saveAppointment(formData);
}
async function saveAppointment(formData: FormData) {
  const user = await requireUser();
  const requestId=z.string().uuid().parse(str(formData,"submissionId")||randomUUID());
  const title = shortTitle.parse(str(formData, "title"));
  const startsAt = agendaDateTime(str(formData, "date"), str(formData, "time") || "09:00");
  if (!title || !startsAt) throw new Error("Titel en datum zijn verplicht");
  const contactId = optionalId.parse(str(formData, "contactId"));
  const assigneeId = optionalId.parse(str(formData, "assigneeId"));
  const notificationId = await db.transaction(async tx => {
    const existing=await existingRequest(tx,user.id,requestId,"appointment");if(existing)return existing.notificationId;
    await checkReferences(tx, contactId, assigneeId);
    const [appointment] = await tx.insert(appointments).values({
    id:requestId,title,
    startsAt,
    location: z.string().max(500).parse(str(formData, "location")) || null,
    notes: z.string().max(5000).parse(str(formData, "notes")) || null,
    contactId: contactId || null,
    // Leeg mag: niet elke afspraak is van iemand in het bijzonder.
    assigneeId: assigneeId || null,
    createdBy: user.id,
    status: "scheduled",
    }).returning({id:appointments.id});
    if(assigneeId){const [notice]=await tx.insert(staffNotifications).values({eventKey:`appointment:${appointment.id}`,kind:'appointment_assignment',entityId:appointment.id,userId:assigneeId,actorId:user.id}).returning({id:staffNotifications.id});return notice.id;}
  });
  const sent=notificationId?await sendQueuedStaffNotification(notificationId):false;
  revalidatePath("/agenda");
  revalidatePath("/");
  return sent;
}

/** Afspraak afvinken. Net als een taak verdwijnt hij dan uit de agenda; wat
 *  geweest is hoeft er niet meer te staan. `status` blijft het label dat ook de
 *  agenda-feed (/api/calendar) leest. */
export async function completeAppointment(id: string) {
  await requireUser();
  await db
    .update(appointments)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, z.string().uuid().parse(id)));
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function reopenAppointment(id: string) {
  await requireUser();
  await db
    .update(appointments)
    .set({ status: "scheduled", completedAt: null, updatedAt: new Date() })
    .where(eq(appointments.id, z.string().uuid().parse(id)));
  revalidatePath("/agenda");
  revalidatePath("/");
}

const PRIORITEITEN = ["hoog", "middel", "laag"] as const;

/** Een taak met (optionele) deadline — verschijnt in de agenda op de deadline
 *  en op de startpagina van degene aan wie 'ie is toegewezen. */
export async function createTask(formData: FormData) {
  await saveTask(formData);
}
async function saveTask(formData: FormData) {
  const user = await requireUser();
  const requestId=z.string().uuid().parse(str(formData,"submissionId")||randomUUID());
  const subject = shortTitle.parse(str(formData, "subject"));
  if (!subject) throw new Error("Taakomschrijving is verplicht");

  const date = str(formData, "date");
  const dueAt = date ? agendaDateTime(date, str(formData, "time") || "17:00") : null;
  if(date&&!dueAt)throw new Error('Ongeldige datum of tijd.');
  const contactId = optionalId.parse(str(formData, "contactId"));
  const assigneeId = optionalId.parse(str(formData, "assigneeId")) || user.id;
  const prioRaw = str(formData, "priority");
  const priority = (PRIORITEITEN as readonly string[]).includes(prioRaw)
    ? (prioRaw as (typeof PRIORITEITEN)[number])
    : "middel";
  const notificationId = await db.transaction(async tx => {
    const existing=await existingRequest(tx,user.id,requestId,"task");if(existing)return existing.notificationId!;
    await checkReferences(tx,contactId,assigneeId);
    const [task] = await tx.insert(activities).values({
    id:requestId,type: "task",
    subject,
    body: z.string().max(5000).parse(str(formData, "body")) || null,
    dueAt,
    contactId: contactId || null,
    authorId: user.id,
    // Geen keuze = bij de maker zelf.
    assigneeId,
    priority,
    }).returning({id:activities.id});
    const [notice]=await tx.insert(staffNotifications).values({eventKey:`task:${task.id}`,kind:'task_assignment',entityId:task.id,userId:assigneeId,actorId:user.id}).returning({id:staffNotifications.id});return notice.id;
  });
  const sent=await sendQueuedStaffNotification(notificationId);
  revalidatePath("/agenda");
  revalidatePath("/");
  return sent;
}

export type AgendaSaveResult={success?:string;error?:string};
export async function saveAgendaItem(_:AgendaSaveResult,fd:FormData):Promise<AgendaSaveResult>{
  await requireUser();
  try{const kind=z.enum(['task','appointment']).parse(fd.get('kind'));const sent=await(kind==='task'?saveTask(fd):saveAppointment(fd));return {success:sent?'Opgeslagen. De verantwoordelijke is per e-mail geïnformeerd.':'Opgeslagen. De e-mailmelding is nog niet bevestigd.'};}
  catch{return {error:'Niet opgeslagen. Controleer de titel, datum, tijd en verantwoordelijke.'};}
}

/** Een losse notitie vastleggen (zonder deadline). */
export async function createNote(formData: FormData) {
  const user = await requireUser();
  const body = z.string().min(1).max(10000).parse(str(formData, "body"));
  if (!body) throw new Error("Notitie is leeg");
  const contactId = optionalId.parse(str(formData, "contactId"));
  await db.insert(activities).values({
    type: "note",
    subject: str(formData, "subject") || null,
    body,
    contactId: contactId || null,
    authorId: user.id,
  });
  revalidatePath("/agenda");
}

export async function completeTask(id: string) {
  const user=await requireUser();
  await changeAgendaTask(z.string().uuid().parse(id),user.id,true);
  revalidatePath("/opvolging");revalidatePath("/beurs/opvolging");revalidatePath("/contacts");
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function reopenTask(id: string) {
  const user=await requireUser();
  await changeAgendaTask(z.string().uuid().parse(id),user.id,false);
  revalidatePath("/opvolging");revalidatePath("/beurs/opvolging");revalidatePath("/contacts");
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  await requireUser();
  await db.delete(activities).where(and(eq(activities.id,z.string().uuid().parse(id)),eq(activities.type,'task'),sql`coalesce(${activities.subject},'') not in ('Opvolging','Beursopvolging')`));
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function deleteAppointment(id: string) {
  await requireUser();
  await db.delete(appointments).where(eq(appointments.id, z.string().uuid().parse(id)));
  revalidatePath("/agenda");
}
