/**
 * Wekelijkse concurrentie-pull (brief §8b): haalt per gevolgde concurrent het
 * publieke DSA-advertentiearchief op en werkt `competitor_ads` bij. Gestopte
 * advertenties behouden hun rij (delivery_stop), nieuwe worden gemarkeerd.
 *
 * GET  — Vercel-cron (Bearer CRON_SECRET; zie vercel.json, maandagochtend).
 * POST — handmatige trigger vanaf het dashboard (ingelogd, geen viewer).
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";
import { runCompetitorSync } from "@/lib/meta/ads-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runSync(): Promise<NextResponse> {
  try {
    const result = await runCompetitorSync();
    return NextResponse.json(
      { ok: result.errors.length === 0, ...result },
      { status: result.errors.length === 0 ? 200 : 207 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
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
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: synchroniseren is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }
  return runSync();
}
