/**
 * Cron: ochtendbriefing om 07:30 Madrid-tijd. Vercel-crons draaien in UTC, dus
 * twee tijden (zomer/winter); alleen de run waarin het in Madrid 7 uur is mailt,
 * en hooguit één keer per dag.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { requireCron } from "@/lib/auth/require-cron";
import { sendBriefing } from "@/lib/autopilot/briefing";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(now));
  if (!force && hour !== 7) return NextResponse.json({ ok: true, skipped: `Madrid ${hour}u` });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
  if (!force) {
    const claimed = await db.execute(sql`insert into kv_cache(key, value) values (${`autopilot:briefing:${day}`}, '{}'::jsonb) on conflict do nothing returning key`);
    if (!claimed.length) return NextResponse.json({ ok: true, skipped: "al verstuurd" });
  }
  try {
    return NextResponse.json({ ok: true, ...(await sendBriefing()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
