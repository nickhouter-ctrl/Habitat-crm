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

const FETCH_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Haal beeldbytes op van een externe bron (website-CDN, Instagram-CDN).
 * Alleen http(s), met harde timeout en groottelimiet. Gooit een NL-fout met
 * de bron-URL erin zodat de sync-samenvatting bruikbaar is.
 */
export async function fetchImageBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Beeld-URL is geen http(s): ${url}`);
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Beeld ophalen mislukt (${res.status}): ${url}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error(`Leeg beeldbestand: ${url}`);
  if (buf.byteLength > FETCH_MAX_BYTES) {
    throw new Error(`Beeld groter dan 25 MB: ${url}`);
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

/** Tel één ingest-uitkomst mee in de samenvatting. */
export function tally(summary: SyncSummary, result: IngestResult): void {
  if (result.status === "duplicate") summary.duplicates++;
  else summary.stored++;
}
