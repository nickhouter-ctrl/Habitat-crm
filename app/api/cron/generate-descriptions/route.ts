/** Cron: genereer unieke meertalige productteksten voor meubels (batchgewijs). */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runDescriptionGeneration } from "@/lib/generate-description";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runDescriptionGeneration();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
