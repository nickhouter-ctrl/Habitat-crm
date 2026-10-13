import { NextResponse } from "next/server";
import { resolveFollowupDownloadToken } from "@/lib/followup-download-link";
import { followupDownloadTarget, listFollowupFiles } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let path: string | null = null;
  try { path = resolveFollowupDownloadToken(token, (await listFollowupFiles()).map((file) => file.path)); } catch { /* fail closed when storage or secret config is unavailable */ }
  if (!path) return new Response("Link niet geldig.", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  const target = await followupDownloadTarget(path);
  if (!target) return new Response("Bestand niet beschikbaar.", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
