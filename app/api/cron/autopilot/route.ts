/** Cron: accountaanvragen beoordelen en offerte-aanvragen klaarzetten (autopilot). */
import { NextResponse } from "next/server";

import { requireCron } from "@/lib/auth/require-cron";
import { runAccountAutopilot } from "@/lib/autopilot/accounts";
import { runQuoteAutopilot } from "@/lib/autopilot/quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const out: Record<string, unknown> = {};
  // Los van elkaar: een fout in het ene deel mag het andere niet tegenhouden.
  try { out.accounts = await runAccountAutopilot(); } catch (e) { out.accountsError = e instanceof Error ? e.message : String(e); }
  try { out.quotes = await runQuoteAutopilot(); } catch (e) { out.quotesError = e instanceof Error ? e.message : String(e); }
  const failed = "accountsError" in out || "quotesError" in out;
  return NextResponse.json({ ok: !failed, ...out }, { status: failed ? 500 : 200 });
}
