"use server";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, contacts, staffMessages, staffNotifications, users } from "@/lib/db/schema";
import { requireModule, requireModuleRead } from "@/lib/auth/guards";
import { heeftCap } from "@/lib/auth/modules";
import { agendaDateTime } from "@/lib/agenda-dates";
import { sendQueuedStaffNotification } from "@/lib/staff-notifications";

export type TeamMessageResult = { success?: string; error?: string; messageId?: string; aantal?: number };

/** Wie een teambericht kan ontvangen — dezelfde kring als de keuzelijst. */
const TEAM_ROLLEN = ["admin", "agent", "marketing"] as const;

/**
 * Een vast bericht-id per ontvanger, afgeleid van het formulier-id. Bij "hele
 * team" wordt één formulier meerdere berichten; drukt iemand twee keer op
 * versturen (of herhaalt de browser het verzoek), dan komen dezelfde ids terug
 * en vindt de tweede poging ze al — niemand krijgt het bericht dubbel.
 */
function berichtIdVoor(formulierId: string, ontvangerId: string): string {
  const h = createHash("sha256").update(`${formulierId}:${ontvangerId}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const input = z.object({
  submissionId: z.string().uuid(),
  // Eén collega, of "team": iedereen behalve de afzender.
  recipientId: z.union([z.string().uuid(), z.literal("team")]),
  contactId: z.union([z.string().uuid(), z.literal("")]),
  subject: z.string().trim().min(3).max(250).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(3).max(5000),
  makeTask: z.enum(["on", "off"]).default("off"),
  dueDate: z.string().max(10),
  time: z.string().max(5),
  priority: z.enum(["hoog", "middel", "laag"]).default("middel"),
});

export async function sendTeamMessage(_: TeamMessageResult, fd: FormData): Promise<TeamMessageResult> {
  const user = await requireModule("teamberichten");
  try {
    const d = input.parse({ ...Object.fromEntries(fd), makeTask: fd.get("makeTask") ?? "off" });
    const dueAt = d.makeTask === "on" && d.dueDate ? agendaDateTime(d.dueDate, d.time || "17:00") : null;
    if (d.makeTask === "on" && d.dueDate && !dueAt) return { error: "Kies een geldige datum en tijd voor de taak." };
    const heleTeam = d.recipientId === "team";
    const saved = await db.transaction(async tx => {
      // Serialize retries of a sender; the same form cannot create two tasks.
      await tx.select({id:users.id}).from(users).where(eq(users.id,user.id)).for('update');
      const ontvangers = heleTeam
        ? await tx.select({ id: users.id, role: users.role }).from(users).where(and(inArray(users.role, [...TEAM_ROLLEN]), ne(users.id, user.id)))
        : await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, d.recipientId));
      if (!ontvangers.length) throw new Error("invalid-recipient");
      if (d.makeTask === "on" && ontvangers.some(r => !heeftCap(r.role, "schrijven"))) throw new Error("invalid-recipient");
      if (d.contactId) { const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, d.contactId)); if (!contact) throw new Error("invalid-contact"); }

      const resultaat: { messageId: string; notificationId: string }[] = [];
      for (const ontvanger of ontvangers) {
        // Eén collega houdt het formulier-id als bericht-id, zoals altijd; bij
        // het hele team krijgt elke ontvanger een eigen, afgeleid id.
        const id = heleTeam ? berichtIdVoor(d.submissionId, ontvanger.id) : d.submissionId;
        const [existing]=await tx.select().from(staffMessages).where(eq(staffMessages.id,id));
        if(existing){
          if(existing.senderId!==user.id)throw new Error('invalid-request');
          const [notice]=await tx.select({id:staffNotifications.id}).from(staffNotifications).where(eq(staffNotifications.eventKey,`message:${existing.id}`));
          resultaat.push({messageId:existing.id,notificationId:notice.id});
          continue;
        }
        let taskId: string | null = null;
        if (d.makeTask === "on") { const [task] = await tx.insert(activities).values({ type: "task", subject: d.subject, body: d.body, dueAt, contactId: d.contactId || null, assigneeId: ontvanger.id, authorId: user.id, priority: d.priority }).returning({ id: activities.id }); taskId = task.id; }
        const [message] = await tx.insert(staffMessages).values({ id, senderId: user.id, recipientId: ontvanger.id, contactId: d.contactId || null, taskId, subject: d.subject, body: d.body }).returning({ id: staffMessages.id });
        const [notice] = await tx.insert(staffNotifications).values({ eventKey: `message:${message.id}`, kind: "team_message", entityId: message.id, userId: ontvanger.id, actorId: user.id }).returning({ id: staffNotifications.id });
        resultaat.push({ messageId: message.id, notificationId: notice.id });
      }
      return resultaat;
    });
    const gemeld = await Promise.all(saved.map(s => sendQueuedStaffNotification(s.notificationId)));
    const mailed = gemeld.every(Boolean);
    revalidatePath("/", "layout"); revalidatePath("/teamberichten"); revalidatePath("/agenda");
    if (heleTeam) return { messageId: saved[0].messageId, aantal: saved.length, success: mailed ? "Bericht bezorgd bij {n} collega's in het CRM en per e-mail gemeld." : "Bericht bezorgd bij {n} collega's in het CRM. Niet alle e-mailmeldingen zijn bevestigd." };
    return { messageId: saved[0].messageId, success: mailed ? "Bericht bezorgd in het CRM en per e-mail gemeld." : "Bericht bezorgd in het CRM. De e-mailmelding is nog niet bevestigd." };
  } catch {
    return { error: "Bericht niet opgeslagen. Controleer de medewerker, de klant en de ingevulde gegevens." };
  }
}

export async function markTeamMessageRead(id: string) {
  const user = await requireModuleRead("teamberichten");
  await db.update(staffMessages).set({ readAt: new Date(), updatedAt: new Date() }).where(and(eq(staffMessages.id, z.string().uuid().parse(id)), eq(staffMessages.recipientId, user.id),isNull(staffMessages.readAt)));
  revalidatePath("/", "layout");
}
