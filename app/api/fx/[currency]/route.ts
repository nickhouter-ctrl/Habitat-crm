import { NextResponse } from "next/server";

import { rateToEur } from "@/lib/fx";

/** Live wisselkoers → EUR (bv. /api/fx/usd) voor de kozijn-calculator (client). */
export async function GET(_req: Request, { params }: { params: Promise<{ currency: string }> }) {
  const { currency } = await params;
  const rate = await rateToEur(currency);
  return NextResponse.json({ currency: currency.toUpperCase(), rate });
}
