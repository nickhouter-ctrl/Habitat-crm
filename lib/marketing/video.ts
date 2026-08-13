/**
 * Video-assets (U7) — zelfde uitgangspunten als de beeld-pijplijn: bytes
 * worden altijd GEKOPIEERD naar eigen Storage (brief §3.3), paden zijn
 * content-addressed. Verschillen met beeld:
 *
 *  - geen perceptuele hash: dedupe gaat op exacte inhoudshash (sha256);
 *  - metadata (duur, afmetingen, posterframe) komt uit de browser bij de
 *    upload (HTMLVideoElement + canvas) — de server draait geen ffmpeg;
 *  - het posterframe wordt als aparte JPEG naast de video opgeslagen en
 *    dient als thumbnail in de bibliotheek én als `image_url` voor Meta's
 *    video_data (lib/meta/publish.ts).
 *
 * De creative-editor blijft image-only: een video-ad verwijst direct naar
 * het asset (ads.assetId) en krijgt zijn copy uit copy_blocks in de
 * publish-flow.
 */
import { sha256Hex } from "./ingest";
import type { MarketingStorage } from "./storage";

/** Ondersteunde videoformaten (browser-afspeelbaar + door Meta geaccepteerd). */
const VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Vercel-functies accepteren max 100 MB request-body. */
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Is dit mimetype een ondersteunde video? */
export function isVideoContentType(contentType: string): boolean {
  return VIDEO_MIME.has(contentType);
}

/** Content-addressed opslagpad: `video/<sha256>.<ext>`. */
export function videoStoragePath(bytes: Uint8Array, contentType: string): string {
  return `video/${sha256Hex(bytes)}.${EXT_BY_MIME[contentType] ?? "mp4"}`;
}

/** Duur als `m:ss` voor de duur-badge in de bibliotheek; null/0 → "—"/"0:00". */
export function formatDuration(seconds: number | string | null | undefined): string {
  if (seconds == null || seconds === "") return "—";
  const total = Math.floor(Number(seconds));
  if (!Number.isFinite(total) || total < 0) return "—";
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------- ingest */

/** Invoer voor {@link ingestVideoAsset}. */
export interface VideoIngestInput {
  bytes: Uint8Array;
  contentType: string;
  /** Herkomst; default "upload" — de website-sync (U9) levert "website". */
  source?: "website" | "upload";
  /** Bestandsnaam of andere herkomstreferentie. */
  sourceRef: string;
  /** Oorspronkelijke locatie (paginaherkomst bij website-sync). */
  sourceUrl?: string | null;
  productId?: string | null;
  tags?: string[];
  /** Browser-metadata; null als de browser ze niet kon lezen. */
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  /** Posterframe (JPEG uit canvas), optioneel. */
  thumbnail?: { bytes: Uint8Array; contentType: string } | null;
}

/** Rij-vorm voor de `assets`-tabel (mediaType video, geen phash). */
export interface NewVideoAssetRecord {
  mediaType: "video";
  source: "website" | "upload";
  sourceRef: string;
  sourceUrl: string | null;
  storagePath: string;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: string | null;
  productId: string | null;
  tags: string[];
}

/** Toegang tot de `assets`-tabel, geïnjecteerd door de aanroeper. */
export interface VideoIngestRepo {
  /** Bestaand asset met dit content-addressed pad (= identieke bytes). */
  findByStoragePath(path: string): Promise<{ id: string } | null>;
  insertVideoAsset(record: NewVideoAssetRecord): Promise<{ id: string }>;
}

/** Uitkomst van de video-ingest. */
export interface VideoIngestResult {
  status: "stored" | "duplicate";
  assetId: string;
  storagePath: string;
  thumbnailPath?: string | null;
}

/**
 * Sla een geüploade video op en registreer het asset. Dedupe op exacte
 * inhoud: hetzelfde bestand nogmaals uploaden geeft het bestaande asset
 * terug ("duplicate") en slaat niets opnieuw op.
 */
export async function ingestVideoAsset(
  input: VideoIngestInput,
  deps: { storage: MarketingStorage; repo: VideoIngestRepo },
): Promise<VideoIngestResult> {
  if (input.bytes.length === 0) throw new Error("Leeg videobestand.");
  if (input.bytes.length > MAX_VIDEO_BYTES) {
    throw new Error("Video groter dan 100 MB — comprimeer hem eerst.");
  }
  if (!isVideoContentType(input.contentType)) {
    throw new Error(
      `Videoformaat niet ondersteund (${input.contentType}) — gebruik MP4, MOV of WebM.`,
    );
  }

  const path = videoStoragePath(input.bytes, input.contentType);
  const existing = await deps.repo.findByStoragePath(path);
  if (existing) {
    return { status: "duplicate", assetId: existing.id, storagePath: path };
  }

  const storagePath = await deps.storage.put(path, input.bytes, input.contentType);

  let thumbnailPath: string | null = null;
  if (input.thumbnail && input.thumbnail.bytes.length > 0) {
    thumbnailPath = await deps.storage.put(
      path.replace(/\.\w+$/, "_poster.jpg"),
      input.thumbnail.bytes,
      input.thumbnail.contentType,
    );
  }

  const { id } = await deps.repo.insertVideoAsset({
    mediaType: "video",
    source: input.source ?? "upload",
    sourceRef: input.sourceRef,
    sourceUrl: input.sourceUrl ?? null,
    storagePath,
    thumbnailPath,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds:
      input.durationSeconds != null ? input.durationSeconds.toFixed(2) : null,
    productId: input.productId ?? null,
    tags: input.tags ?? [],
  });

  return { status: "stored", assetId: id, storagePath, thumbnailPath };
}
