/** Cron: nieuwe pagina-posts automatisch adverteren + oude advertenties pauzeren. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { runMetaBoost } from "@/lib/meta/boost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await runMetaBoost();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
