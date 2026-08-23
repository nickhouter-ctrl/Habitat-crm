/** Cron: werk factuurstatussen bij — betaald (uit Holded) + vervallen —
 *  en neem de betaalstatus van gekoppelde inkooporders over. */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";

import { runInvoiceStatusSweep } from "@/lib/invoice-status";
import { syncPurchasePaymentsFromHolded } from "@/lib/purchase-payment-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await runInvoiceStatusSweep();
  // Inkoop-betalingen best-effort: een Holded-storing mag de factuursweep niet 500'en.
  const purchases = await syncPurchasePaymentsFromHolded().catch((e) => ({
    error: e instanceof Error ? e.message : String(e),
  }));
  return NextResponse.json({ ...result, purchases }, { status: result.ok ? 200 : 500 });
}
