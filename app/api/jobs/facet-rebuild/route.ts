/**
 * Nachtelijke herbouw van `facet_performance` (brief §8).
 *
 * GET  — Vercel-cron (03:15, zie vercel.json; Bearer CRON_SECRET).
 * POST — handmatige trigger vanuit de UI (ingelogd).
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";
import { rebuildFacetPerformance } from "@/lib/marketing/facets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runRebuild(): Promise<NextResponse> {
  try {
    const result = await rebuildFacetPerformance();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Facet-rebuild mislukt:", err);
    return NextResponse.json(
      { ok: false, error: "De herbouw van de leerlaag is mislukt; zie de serverlog." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireCron(req);
  if (denied) return denied;
  return runRebuild();
}

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  return runRebuild();
}
