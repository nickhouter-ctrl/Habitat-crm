/** Cron: werk verkoopfactuurstatussen bij — betaald (uit Holded) + vervallen.
 *  Inkooporders bewust niet: betaalstatus van inkoop leeft alleen in Holded
 *  (keuze Nick 24-08-2026). */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runInvoiceStatusSweep } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runInvoiceStatusSweep();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
