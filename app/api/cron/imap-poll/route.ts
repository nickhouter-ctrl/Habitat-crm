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

import { requireCron } from "@/lib/auth/require-cron";

import { runImapPoll } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
// 300 s: het uitlezen van een factuur door de AI duurt seconden, en bij een
// mail met meerdere bijlagen (of een Excel van een halve MB) haalde de poll de
// oude limiet van 60 s niet — de facturen stonden dan wél in de wachtrij, maar
// de melding erover werd nooit verstuurd.
export const maxDuration = 300;

export async function GET(req: Request) {
  // Beveiliging: in productie alleen Vercel Cron (header authorization)
  const denied = requireCron(req);
  if (denied) return denied;

  const result = await runImapPoll();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
