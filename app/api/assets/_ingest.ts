/**
 * Gedeelde bedrading voor de asset-ingestroutes (website/instagram/upload):
 * één Drizzle-implementatie van `AssetIngestRepo` + één `ingestFromBytes` die
 * opslag, decoder en repo aan de pijplijn in lib/marketing/ingest.ts koppelt.
 * Alle drie de bronnen gedragen zich daardoor identiek (brief §5, acceptatie).
 *
 * Underscore-prefix: dit is bewust géén route.
 */
import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import {
  ingestAsset,
  sharpDecoder,
  type AssetIngestRepo,
  type IngestInput,
  type IngestResult,
} from "@/lib/marketing/ingest";
import { marketingStorage } from "@/lib/marketing/storage";
import {
  ingestVideoAsset,
  type VideoIngestInput,
  type VideoIngestRepo,
  type VideoIngestResult,
} from "@/lib/marketing/video";

/** Drizzle-implementatie van de repo-poort van de ingest-pijplijn. */
export const drizzleAssetRepo: AssetIngestRepo = {
  async listPhashes() {
    const rows = await db
      .select({ id: assets.id, phash: assets.phash })
      .from(assets)
      .where(isNotNull(assets.phash));
    return rows.filter((r): r is { id: string; phash: string } => r.phash !== null);
  },

  async insertAsset(record) {
    const [row] = await db
      .insert(assets)
      .values({
        source: record.source,
        sourceRef: record.sourceRef,
        sourceUrl: record.sourceUrl,
        storagePath: record.storagePath,
        width: record.width,
        height: record.height,
        phash: record.phash,
        dominantColors: record.dominantColors,
        productId: record.productId,
        tags: record.tags,
        igMetrics: record.igMetrics,
      })
      .returning({ id: assets.id });
    return row;
  },

  /**
   * Duplicaat: niets opnieuw opslaan, wél herkomst samenvoegen (brief §5) —
   * tags verenigen, ontbrekende productkoppeling invullen en IG-cijfers
   * bijschrijven (het organische signaal is juist waardevol).
   */
  async mergeSource(assetId, input) {
    const [existing] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!existing) return;
    const tags = Array.from(new Set([...(existing.tags ?? []), ...(input.tags ?? [])]));
    await db
      .update(assets)
      .set({
        tags,
        productId: existing.productId ?? input.productId ?? null,
        igMetrics: input.igMetrics ?? existing.igMetrics,
      })
      .where(eq(assets.id, assetId));
  },
};

/** Eén beeld door de standaardpijplijn (Supabase-opslag + sharp + Drizzle). */
export function ingestFromBytes(input: IngestInput): Promise<IngestResult> {
  return ingestAsset(input, {
    storage: marketingStorage(),
    repo: drizzleAssetRepo,
    decode: sharpDecoder,
  });
}

/** Drizzle-implementatie van de video-repo (U7): dedupe op inhoudshash-pad. */
export const drizzleVideoRepo: VideoIngestRepo = {
  async findByStoragePath(path) {
    const [row] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.storagePath, path))
      .limit(1);
    return row ?? null;
  },
  async insertVideoAsset(record) {
    const [row] = await db.insert(assets).values(record).returning({ id: assets.id });
    return row;
  },
};

/** Eén video door de pijplijn (geen phash; browser-metadata, zie video.ts). */
export function ingestVideoFromBytes(input: VideoIngestInput): Promise<VideoIngestResult> {
  return ingestVideoAsset(input, { storage: marketingStorage(), repo: drizzleVideoRepo });
}

/**
 * Leg een niet-downloadbare video-embed (YouTube/Vimeo) vast als VERWIJZING
 * (U9): een asset-rij met virtueel pad `embed/<provider>/<id>` — er staan
 * geen bytes in Storage; de bibliotheek toont een "bekijk op…"-link.
 * Idempotent op dat pad.
 */
export async function recordEmbedAsset(input: {
  provider: "youtube" | "vimeo";
  id: string;
  /** Publieke kijk-URL van de embed. */
  url: string;
  /** Pagina waarop de embed stond (paginaherkomst). */
  pageUrl: string;
  tags: string[];
}): Promise<{ status: "stored" | "duplicate"; assetId: string }> {
  const virtualPath = `embed/${input.provider}/${input.id}`;
  const existing = await drizzleVideoRepo.findByStoragePath(virtualPath);
  if (existing) return { status: "duplicate", assetId: existing.id };
  const [row] = await db
    .insert(assets)
    .values({
      mediaType: "video",
      source: "website",
      sourceRef: input.url,
      sourceUrl: input.pageUrl,
      storagePath: virtualPath,
      tags: input.tags,
    })
    .returning({ id: assets.id });
  return { status: "stored", assetId: row.id };
}

const FETCH_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Haal mediabytes op van een externe bron (website-CDN, Instagram-CDN).
 * Alleen http(s), met harde timeout en groottelimiet (default 25 MB; de
 * website-video's van U9 mogen tot 100 MB). Gooit een NL-fout met de
 * bron-URL erin zodat de sync-samenvatting bruikbaar is.
 */
export async function fetchImageBytes(
  url: string,
  maxBytes = FETCH_MAX_BYTES,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Media-URL is geen http(s): ${url}`);
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`Media ophalen mislukt (${res.status}): ${url}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error(`Leeg mediabestand: ${url}`);
  if (buf.byteLength > maxBytes) {
    throw new Error(`Bestand groter dan ${Math.round(maxBytes / 1024 / 1024)} MB: ${url}`);
  }
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg",
  };
}

/** Samenvatting van één sync-run — de respons van de sync-routes. */
export interface SyncSummary {
  stored: number;
  duplicates: number;
  skipped: number;
  /** NL-omschrijvingen van mislukte items — zichtbaar, geen stille storing. */
  errors: string[];
}

export function emptySummary(): SyncSummary {
  return { stored: 0, duplicates: 0, skipped: 0, errors: [] };
}

/** Tel één ingest-uitkomst (beeld of video) mee in de samenvatting. */
export function tally(
  summary: SyncSummary,
  result: Pick<IngestResult | VideoIngestResult, "status">,
): void {
  if (result.status === "duplicate") summary.duplicates++;
  else summary.stored++;
}
