/** Cron: genereer unieke meertalige productteksten voor meubels (batchgewijs). */
import { NextResponse } from "next/server";

import { runDescriptionGeneration } from "@/lib/generate-description";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDescriptionGeneration();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
