/** Cron: vraag klanten ~3 weken na levering om een Google-review. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runReviewRequests } from "@/lib/review-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runReviewRequests();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
