/** Cron: stuur betaalherinneringen voor vervallen, onbetaalde facturen. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runPaymentReminders } from "@/lib/payment-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runPaymentReminders();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
