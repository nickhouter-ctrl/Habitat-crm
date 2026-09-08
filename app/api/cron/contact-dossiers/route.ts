/** Cron: ververs 's nachts de AI-dossiers van contacten met recente activiteit. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { verversDossiersMetRecenteActiviteit } from "@/lib/contact-dossier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await verversDossiersMetRecenteActiviteit();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
