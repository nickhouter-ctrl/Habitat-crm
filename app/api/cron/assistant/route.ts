import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/require-cron";
import { prepareInboxSuggestions } from "@/lib/assistant/mail";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  return NextResponse.json(await prepareInboxSuggestions());
}
