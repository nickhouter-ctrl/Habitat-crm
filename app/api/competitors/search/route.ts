/**
 * Zoek adverterende pagina's op naam in het EU-advertentiearchief (U8) —
 * voor "concurrent volgen zonder zelf page-id's op te zoeken". Leesactie
 * (ook viewers mogen zoeken); zonder META_ADS_ARCHIVE_TOKEN legt de respons
 * uit wat er mist in plaats van stil te falen.
 *
 * GET /api/competitors/search?q=<naam>
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { searchArchivePages } from "@/lib/meta/ads-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if (!process.env.META_ADS_ARCHIVE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Zoeken vereist META_ADS_ARCHIVE_TOKEN (Ad Library-token, zie .env.example). Stel die in om concurrenten op naam te vinden.",
      },
      { status: 503 },
    );
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 100) {
    return NextResponse.json(
      { error: "Gebruik een zoekterm van minstens 3 tekens." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ ok: true, hits: await searchArchivePages(q) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Zoeken in het archief mislukte." },
      { status: 502 },
    );
  }
}
