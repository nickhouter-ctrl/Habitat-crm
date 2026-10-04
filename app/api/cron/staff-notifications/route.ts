import { requireCron } from "@/lib/auth/require-cron";
import { deliverStaffNotifications, queueDailyAgenda, staffAgendaItems } from "@/lib/staff-notifications";
import { db } from "@/lib/db";
import { staffNotifications, users } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { agendaDay } from "@/lib/agenda-dates";
import { isSystemMailRecipient } from "@/lib/mail-bcc";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
  // Live controle zonder mails of wijzigingen; geen namen/adressen in de response.
  if (new URL(req.url).searchParams.get("preview") === "1") {
    const team = (await db.select({ id: users.id, email: users.email }).from(users)).filter(user => isSystemMailRecipient(user.email));
    const counts = await Promise.all(team.map(async user => (await staffAgendaItems(user.id, agendaDay(new Date()))).length));
    const [pending] = await db.select({ value: count() }).from(staffNotifications).where(eq(staffNotifications.status, "pending"));
    return Response.json({ preview: true, colleaguesWithAgenda: counts.filter(Boolean).length, agendaItems: counts.reduce((a,b)=>a+b,0), pending: pending.value });
  }
    const queued = await queueDailyAgenda();
    const result = await deliverStaffNotifications();
    return Response.json({ queued, ...result }, { status: result.unknown ? 500 : 200 });
  } catch {
    console.error("[staff-notification] cron-failed");
    return Response.json({ error: "staff-notification-failed" }, { status: 500 });
  }
}
