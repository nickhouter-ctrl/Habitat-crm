/**
 * Cron job: poll IMAP voor nieuwe mails en schrijf ze naar email_inbox.
 *
 * Beveiliging: alleen Vercel Cron mag deze route triggeren (header check).
 * Lokaal kun je 'm handmatig hitten zonder header.
 *
 * De feitelijke poll-logica staat in lib/imap-poll.ts (gedeeld met de
 * "Mails ophalen"-knop op /inbox).
 */
import { NextResponse } from "next/server";

import { runImapPoll } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Beveiliging: in productie alleen Vercel Cron (header authorization)
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runImapPoll();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
