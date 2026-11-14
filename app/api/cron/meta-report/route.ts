/** Cron: maandagochtend het wekelijkse advertentie-overzicht mailen. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { sendWeeklyAdReport } from "@/lib/meta/weekly-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await sendWeeklyAdReport());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
