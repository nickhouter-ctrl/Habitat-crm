/**
 * Cron: één verzendronde van de e-mailcampagnes.
 *
 * Draait elke tien minuten binnen kantoortijd. Dat is veel vaker dan nodig —
 * 55 rondes van maximaal 25 mails is ruim boven elke dagcap — en dat is de
 * bedoeling: de **cap** is de rem, niet het schema. Zo loopt een campagne door
 * als een ronde eens overslaat, zonder dat er ooit meer uitgaat dan afgesproken.
 *
 * De cron-tijden van Vercel staan in UTC en schuiven dus mee met de zomertijd;
 * `inVenster()` controleert daarom binnen de ronde nog eens op de Madrid-klok.
 */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { runCampaignSend } from "@/lib/leads/send-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runCampaignSend();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
