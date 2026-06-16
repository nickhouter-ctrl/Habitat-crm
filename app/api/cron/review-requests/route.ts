/** Cron: vraag klanten ~3 weken na levering om een Google-review. */
import { NextResponse } from "next/server";

import { runReviewRequests } from "@/lib/review-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReviewRequests();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
