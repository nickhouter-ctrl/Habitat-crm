/** Cron: dagelijkse data-gezondheidscontrole; mailt bevindingen naar de eigenaar. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runDataHealth } from "@/lib/data-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runDataHealth();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
