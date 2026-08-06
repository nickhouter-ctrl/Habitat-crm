/** Cron: mail de dag vóór een geplande levering een herinnering naar de klant. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runDeliveryReminders } from "@/lib/delivery-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runDeliveryReminders();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
