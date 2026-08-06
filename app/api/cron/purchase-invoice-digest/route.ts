/** Cron: ochtendsamenvatting van inkoopfacturen die op goedkeuring wachten. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runPurchaseInvoiceDigest } from "@/lib/purchase-invoice-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runPurchaseInvoiceDigest();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
