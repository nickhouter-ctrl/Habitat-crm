/** Cron: werk factuurstatussen bij — betaald (uit Holded) + vervallen. */
import { NextResponse } from "next/server";

import { runInvoiceStatusSweep } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runInvoiceStatusSweep();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
