/** Cron: ochtendsamenvatting van inkoopfacturen die op goedkeuring wachten. */
import { NextResponse } from "next/server";

import { runPurchaseInvoiceDigest } from "@/lib/purchase-invoice-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runPurchaseInvoiceDigest();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
