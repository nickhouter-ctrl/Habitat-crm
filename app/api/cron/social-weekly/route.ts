/**
 * Cron: elke donderdagochtend de social-posts voor volgende week klaarzetten
 * (als CONCEPT in Zernio) en de eigenaar mailen met een link naar de
 * reviewpagina. Er gaat niets online zonder akkoord op /marketing/social.
 *
 * Idempotent: een tweede run in dezelfde week maakt niets dubbel (uniek op
 * plannedDate) en mailt niet opnieuw (notifiedAt). Loopt daarnaast de lopende
 * video-jobs na.
 *
 * `?week=YYYY-MM-DD` (een maandag) plant een andere week — handig bij testen.
 * `?poll=1` loopt alleen de video-jobs na (uurlijkse cron), plant niets.
 */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { nextWeekStart, isoWeekday } from "@/lib/social/planner";
import { buildWeek, pollVideoJobs, sendWeekEmail } from "@/lib/social/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  if (url.searchParams.get("poll") === "1") {
    return NextResponse.json({ ok: true, videosReady: await pollVideoJobs() });
  }
  const param = url.searchParams.get("week");
  const weekStart =
    param && /^\d{4}-\d{2}-\d{2}$/.test(param) && isoWeekday(param) === 1 ? param : nextWeekStart(new Date());

  const videos = await pollVideoJobs().catch((e) => {
    console.error("[social-weekly] video-jobs nalopen mislukt:", e);
    return 0;
  });
  const built = await buildWeek(weekStart);
  const mail = await sendWeekEmail(weekStart);

  return NextResponse.json({
    ok: true,
    weekStart,
    created: built.created,
    posts: built.posts.length,
    videosReady: videos,
    mailed: mail.sent,
  });
}
