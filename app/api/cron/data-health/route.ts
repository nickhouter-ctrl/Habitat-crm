/** Cron: dagelijkse data-gezondheidscontrole; mailt bevindingen naar de eigenaar. */
import { NextResponse } from "next/server";

import { runDataHealth } from "@/lib/data-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDataHealth();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
