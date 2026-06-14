/** Cron: mail de dag vóór een geplande levering een herinnering naar de klant. */
import { NextResponse } from "next/server";

import { runDeliveryReminders } from "@/lib/delivery-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDeliveryReminders();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
