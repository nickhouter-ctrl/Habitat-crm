import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appleCalendarConnections } from "@/lib/db/schema";
import { syncAppleCalendar } from "@/lib/apple-calendar/sync";
import { AppleCalendarError } from "@/lib/apple-calendar/client";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET, supplied = request.headers.get("authorization") ?? "";
  if (!expected) return Response.json({ error: "not-configured" }, { status: 503 });
  const target = Buffer.from(`Bearer ${expected}`), actual = Buffer.from(supplied);
  if (actual.length !== target.length || !timingSafeEqual(actual, target)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const configured = await db.query.appleCalendarConnections.findFirst({ where: eq(appleCalendarConnections.id, "team"), columns: { enabled: true } });
  if (!configured?.enabled) return Response.json({ skipped: true });
  try { return Response.json(await syncAppleCalendar()); }
  catch (error) {
    if (error instanceof AppleCalendarError && error.message === "busy") return Response.json({ skipped: true });
    return Response.json({ error: "sync-failed" }, { status: 503 });
  }
}
