/**
 * Cron: nachtelijk onderhoud aan de verzendwachtrij.
 *
 * Zet rijen terug die tijdens een ronde zijn blijven hangen (een time-out, een
 * deploy halverwege) en rondt campagnes af waarvan de wachtrij leeg is. Dit
 * gebeurt ook aan het begin van elke verzendronde; deze cron is het vangnet
 * voor het geval er een dag niets verstuurd wordt.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { db } from "@/lib/db";
import { campaignRecipients, emailCampaigns } from "@/lib/db/schema";
import { herstelVastgelopen } from "@/lib/leads/send-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const hersteld = await herstelVastgelopen();

  // Campagnes waarvan niets meer in de wachtrij staat, afronden.
  const lopend = await db
    .select({ id: emailCampaigns.id })
    .from(emailCampaigns)
    .where(inArray(emailCampaigns.status, ["queued", "sending"]));

  let afgerond = 0;
  for (const c of lopend) {
    const [nog] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, c.id), inArray(campaignRecipients.status, ["queued", "sending"])));
    if (Number(nog?.n ?? 0) === 0) {
      await db.update(emailCampaigns).set({ status: "sent", updatedAt: new Date() }).where(eq(emailCampaigns.id, c.id));
      afgerond++;
    }
  }

  return NextResponse.json({ ok: true, hersteld, afgerond });
}
