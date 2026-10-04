"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, contacts, staffMessages, staffNotifications, users } from "@/lib/db/schema";
import { requireModule, requireModuleRead } from "@/lib/auth/guards";
import { heeftCap } from "@/lib/auth/modules";
import { agendaDateTime } from "@/lib/agenda-dates";
import { sendQueuedStaffNotification } from "@/lib/staff-notifications";

export type TeamMessageResult = { success?: string; error?: string; messageId?: string };
const input = z.object({
  submissionId: z.string().uuid(),
  recipientId: z.string().uuid(),
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
    const saved = await db.transaction(async tx => {
      // Serialize retries of a sender; the same form cannot create two tasks.
      await tx.select({id:users.id}).from(users).where(eq(users.id,user.id)).for('update');
      const [existing]=await tx.select().from(staffMessages).where(eq(staffMessages.id,d.submissionId));
      if(existing){
        if(existing.senderId!==user.id)throw new Error('invalid-request');
        const [notice]=await tx.select({id:staffNotifications.id}).from(staffNotifications).where(eq(staffNotifications.eventKey,`message:${existing.id}`));
        return {messageId:existing.id,notificationId:notice.id};
      }
      const [recipient] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, d.recipientId));
      if (!recipient || (d.makeTask === "on" && !heeftCap(recipient.role, "schrijven"))) throw new Error("invalid-recipient");
      if (d.contactId) { const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, d.contactId)); if (!contact) throw new Error("invalid-contact"); }
      let taskId: string | null = null;
      if (d.makeTask === "on") { const [task] = await tx.insert(activities).values({ type: "task", subject: d.subject, body: d.body, dueAt, contactId: d.contactId || null, assigneeId: d.recipientId, authorId: user.id, priority: d.priority }).returning({ id: activities.id }); taskId = task.id; }
      const [message] = await tx.insert(staffMessages).values({ id:d.submissionId,senderId: user.id, recipientId: d.recipientId, contactId: d.contactId || null, taskId, subject: d.subject, body: d.body }).returning({ id: staffMessages.id });
      const [notice] = await tx.insert(staffNotifications).values({ eventKey: `message:${message.id}`, kind: "team_message", entityId: message.id, userId: d.recipientId, actorId: user.id }).returning({ id: staffNotifications.id });
      return { messageId: message.id, notificationId: notice.id };
    });
    const mailed = await sendQueuedStaffNotification(saved.notificationId);
    revalidatePath("/", "layout"); revalidatePath("/teamberichten"); revalidatePath("/agenda");
    return { messageId: saved.messageId, success: mailed ? "Bericht bezorgd in het CRM en per e-mail gemeld." : "Bericht bezorgd in het CRM. De e-mailmelding is nog niet bevestigd." };
  } catch {
    return { error: "Bericht niet opgeslagen. Controleer de medewerker, de klant en de ingevulde gegevens." };
  }
}

export async function markTeamMessageRead(id: string) {
  const user = await requireModuleRead("teamberichten");
  await db.update(staffMessages).set({ readAt: new Date(), updatedAt: new Date() }).where(and(eq(staffMessages.id, z.string().uuid().parse(id)), eq(staffMessages.recipientId, user.id),isNull(staffMessages.readAt)));
  revalidatePath("/", "layout");
}
