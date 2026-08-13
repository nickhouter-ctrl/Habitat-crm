/**
 * Instagram-bron van de asset-bibliotheek (brief §5): haalt via de Instagram
 * Graph API de media van ons eigen zakelijke account op, downloadt elke
 * afbeelding naar eigen Storage (IG-URL's verlopen binnen dagen — §3.3) en
 * bewaart de organische insights in `ig_metrics`: een post die organisch goed
 * liep is een sterke kandidaat voor advertentiebeeld.
 *
 * GET  — Vercel-cron (Bearer CRON_SECRET; zie vercel.json, dagelijks 04:10).
 * POST — handmatige trigger (ingelogd, geen viewer).
 *
 * Media worden sequentieel verwerkt (TOCTOU-note van de ingest-review).
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";

import { emptySummary, fetchImageBytes, ingestFromBytes, tally } from "../../_ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GRAPH_BASE = "https://graph.facebook.com";
const MAX_PAGES = 10;

interface IgMedia {
  id: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
}

function igToken(): string {
  const token = process.env.IG_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("IG_ACCESS_TOKEN of META_ACCESS_TOKEN is niet ingesteld (zie .env.example).");
  }
  return token;
}

async function igGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${process.env.META_GRAPH_VERSION ?? "v23.0"}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${igToken()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Instagram API: ${msg}`);
  }
  return data as T;
}

/**
 * Insights per media-item (reach, likes, saved). Niet elk mediatype levert
 * alle metrics — een insights-fout is geen reden het beeld over te slaan.
 */
async function fetchInsights(mediaId: string): Promise<Record<string, number> | null> {
  try {
    const res = await igGet<{ data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }>(
      `/${mediaId}/insights`,
      { metric: "reach,likes,saved" },
    );
    const metrics: Record<string, number> = {};
    for (const entry of res.data ?? []) {
      const value = entry.values?.[0]?.value;
      if (entry.name && typeof value === "number") metrics[entry.name] = value;
    }
    return Object.keys(metrics).length > 0 ? metrics : null;
  } catch {
    return null;
  }
}

/** Hashtags uit de caption als tags — maakt de bibliotheek filterbaar. */
function hashtagsFrom(caption: string | undefined): string[] {
  return Array.from(new Set((caption ?? "").match(/#([\p{L}\p{N}_]+)/gu) ?? [])).map((t) =>
    t.slice(1).toLowerCase(),
  );
}

async function runSync(): Promise<NextResponse> {
  const summary = emptySummary();
  const igUser = process.env.IG_USER_ID ?? "me";
  let path: string | null = `/${igUser}/media`;
  let after: string | undefined;

  try {
    for (let page = 0; page < MAX_PAGES && path; page++) {
      const res: {
        data?: IgMedia[];
        paging?: { cursors?: { after?: string }; next?: string };
      } = await igGet(path, {
        fields: "id,media_type,media_url,permalink,caption,timestamp",
        limit: "50",
        ...(after ? { after } : {}),
      });

      for (const media of res.data ?? []) {
        try {
          // Carrousels: de losse beelden zitten in /children.
          const items: IgMedia[] =
            media.media_type === "CAROUSEL_ALBUM"
              ? ((
                  await igGet<{ data?: IgMedia[] }>(`/${media.id}/children`, {
                    fields: "id,media_type,media_url",
                  })
                ).data ?? [])
              : [media];
          const igMetrics = await fetchInsights(media.id);
          const tags = hashtagsFrom(media.caption);

          for (const item of items) {
            if (item.media_type !== "IMAGE" || !item.media_url) {
              summary.skipped++;
              continue;
            }
            const { bytes, contentType } = await fetchImageBytes(item.media_url);
            const result = await ingestFromBytes({
              bytes,
              contentType,
              source: "instagram",
              sourceRef: item.id,
              sourceUrl: media.permalink ?? item.media_url,
              tags,
              igMetrics,
            });
            tally(summary, result);
          }
        } catch (err) {
          summary.errors.push(
            `IG-media ${media.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      after = res.paging?.cursors?.after;
      path = res.paging?.next && after ? `/${igUser}/media` : null;
    }
  } catch (err) {
    // Fout op lijstniveau (token, rechten): meteen zichtbaar maken.
    return NextResponse.json(
      { ok: false, ...summary, errors: [...summary.errors, err instanceof Error ? err.message : String(err)] },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { ok: summary.errors.length === 0, ...summary },
    { status: summary.errors.length === 0 ? 200 : 207 },
  );
}

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  return runSync();
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: synchroniseren is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }
  return runSync();
}
