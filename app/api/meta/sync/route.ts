/**
 * Meta-statussync (brief §7): overschrijft effective_status en
 * ad_review_feedback van al onze campagnes/advertentiesets/advertenties.
 *
 * GET  — Vercel-cron (Bearer CRON_SECRET, zie vercel.json).
 * POST — handmatige trigger vanuit de UI (ingelogd; ook viewers mogen
 *        verversen — het is een leesactie richting het CRM).
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";
import { metaErrorMessage } from "@/lib/meta/client";
import { syncMetaStatuses } from "@/lib/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runSync(): Promise<NextResponse> {
  try {
    const result = await syncMetaStatuses();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: metaErrorMessage(err) }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  return runSync();
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  return runSync();
}
