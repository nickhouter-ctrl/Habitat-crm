/**
 * Lege CONCEPT-rij voor een extra Reel aanmaken op een dag zonder vaste post
 * (de vaste posts staan op ma/wo/vr; reels voor volgers op di/do/za/zo).
 * Daarna vult de weekrun de rij met zernio.py + update-post.ts, net als de
 * andere posts. Nick keurt hem in het CRM goed; pas dan wordt hij ingepland.
 *
 *   npx tsx scripts/social-studio/add-reel-slot.ts 2026-12-01 [--time 19:00] [--theme interior]
 *
 * Doet niets als er op die datum al een post staat (uniek op plannedDate).
 */
import "../load-env";

import { db } from "../../lib/db";
import { socialPosts } from "../../lib/db/schema";
import { isoWeekday, shiftDate } from "../../lib/social/planner";

const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

(async () => {
  if (!date) throw new Error("Geef een datum mee (JJJJ-MM-DD).");
  const time = opt("time", "19:00");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Tijd als UU:MM.");
  const weekday = isoWeekday(date);
  const [row] = await db
    .insert(socialPosts)
    .values({
      weekStart: shiftDate(date, -(weekday - 1)),
      plannedDate: date,
      publishTime: time,
      slot: 10 + weekday,
      theme: opt("theme", "reel"),
      kind: "video",
      caption: "",
      status: "draft",
    })
    .onConflictDoNothing({ target: socialPosts.plannedDate })
    .returning({ id: socialPosts.id });
  if (!row) {
    console.log(JSON.stringify({ date, created: false, reason: "er staat al een post op deze datum" }));
  } else {
    console.log(JSON.stringify({ date, created: true, id: row.id }));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
