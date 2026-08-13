/**
 * Asset-ingest pijplijn voor de marketingmodule (brief §5).
 *
 * Elke bron (website, Instagram, upload, gegenereerd) levert bytes aan; deze
 * module doet de verwerking die voor álle bronnen identiek is:
 *
 *  1. valideren (leeg, type, grootte)
 *  2. decoderen → afmetingen
 *  3. perceptuele hash (64-bits DCT-pHash) voor duplicaatdetectie
 *  4. drie dominante kleuren (median cut) voor paletvoorstellen
 *  5. duplicaat? → bronnen samenvoegen, NIET opnieuw opslaan
 *     nieuw? → bytes kopiëren naar onze eigen storage (content-addressed pad)
 *
 * De pijplijn is dependency-injected (storage, repo, decoder) zodat de
 * sync-routes (T3) er Drizzle + Supabase in prikken en de unit tests
 * in-memory implementaties gebruiken. Zuivere rekenfuncties (phash, kleuren,
 * afmetingen, hamming) zijn los geëxporteerd en getest.
 *
 * Let op: `sharpDecoder` vereist de dependency `sharp` (decoderen van
 * JPEG/PNG/WebP/AVIF naar ruwe RGBA-pixels).
 */
import { createHash } from "node:crypto";

import type { MarketingStorage } from "./storage";

/* -------------------------------------------------------------------- types */

/** Herkomst van een asset — kolom `assets.source` in de brief. */
export type AssetSource = "website" | "instagram" | "upload" | "generated";

/** Ruwe RGBA-pixels van een gedecodeerd beeld. */
export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, rij-voor-rij, 4 bytes per pixel. */
  rgba: Uint8ClampedArray;
}

/** Decodeert beeldbytes naar RGBA-pixels (productie: sharp; tests: fake). */
export type ImageDecoder = (bytes: Uint8Array) => Promise<DecodedImage>;

/** Invoer voor één te verwerken beeld. */
export interface IngestInput {
  bytes: Uint8Array;
  contentType: string;
  source: AssetSource;
  /** Slug, IG-media-id of bestandsnaam — herkomstreferentie. */
  sourceRef: string;
  /** Oorspronkelijke locatie; alléén als herkomst, wij linken er nooit naar. */
  sourceUrl?: string | null;
  productId?: string | null;
  tags?: string[];
  /** Bereik/likes/opgeslagen — alleen bij Instagram-herkomst. */
  igMetrics?: Record<string, number> | null;
}

/** Record zoals de repo het in de `assets`-tabel schrijft. */
export interface NewAssetRecord {
  source: AssetSource;
  sourceRef: string;
  sourceUrl: string | null;
  storagePath: string;
  width: number;
  height: number;
  phash: string;
  /** Drie hexwaarden, bv. ["#0f2e36", …]. */
  dominantColors: string[];
  productId: string | null;
  tags: string[];
  igMetrics: Record<string, number> | null;
}

/**
 * Toegang tot de `assets`-tabel, geïnjecteerd door de aanroeper.
 * `listPhashes` levert alle bestaande hashes voor de near-duplicate-scan;
 * bij de huidige bibliotheekomvang (duizenden beelden) is een lineaire scan
 * ruim voldoende.
 */
export interface AssetIngestRepo {
  listPhashes(): Promise<Array<{ id: string; phash: string }>>;
  insertAsset(record: NewAssetRecord): Promise<{ id: string }>;
  /** Duplicaat gevonden: voeg de nieuwe herkomst toe aan het bestaande asset. */
  mergeSource(assetId: string, input: IngestInput): Promise<void>;
}

/** Uitkomst van de pijplijn. */
export interface IngestResult {
  status: "stored" | "duplicate";
  assetId: string;
  phash: string;
  width: number;
  height: number;
  dominantColors: string[];
  /** Alleen gezet bij `stored` — bij een duplicaat is niets opgeslagen. */
  storagePath?: string;
}

export interface IngestDeps {
  storage: MarketingStorage;
  repo: AssetIngestRepo;
  /** Standaard `sharpDecoder`; injecteerbaar voor tests. */
  decode?: ImageDecoder;
  /** Maximale hamming-afstand (van 64 bits) om als duplicaat te gelden. */
  maxHammingDistance?: number;
}

/* ---------------------------------------------------------------- constanten */

const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Standaarddrempel voor duplicaten: ≤ 5 afwijkende bits van 64. */
export const DUPLICATE_PHASH_THRESHOLD = 5;

/* ------------------------------------------------------------------- sha256 */

/** SHA-256 van bytes als lowercase hex (voor content-addressed opslagpaden). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/* --------------------------------------------------------------- dimensions */

/**
 * Lees breedte × hoogte rechtstreeks uit de bestandsheader (PNG, JPEG, GIF,
 * WebP). Decoder-onafhankelijk en goedkoop — handig voor vroege validatie.
 * Geeft `null` bij een onbekend of afgekapt bestand (AVIF valt daar bewust
 * onder; daarvoor geeft de decoder de maat).
 */
export function readImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readGif(bytes) ?? readWebp(bytes);
}

function readPng(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // standalone markers (RSTn, EOI) hebben geen lengteveld
    if (marker >= 0xd0 && marker <= 0xd9) {
      i += 2;
      continue;
    }
    const size = (b[i + 2] << 8) | b[i + 3];
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        height: (b[i + 5] << 8) | b[i + 6],
        width: (b[i + 7] << 8) | b[i + 8],
      };
    }
    i += 2 + size;
  }
  return null;
}

function readGif(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10) return null;
  const head = String.fromCharCode(...b.subarray(0, 6));
  if (head !== "GIF87a" && head !== "GIF89a") return null;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
}

function readWebp(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (chunk === "VP8 ") {
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null;
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/* ------------------------------------------------------------------- phash */

const PHASH_SAMPLE = 32; // beeld wordt teruggebracht tot 32×32 grijswaarden
const PHASH_LOW = 8; // laagfrequente 8×8 DCT-hoek → 64 bits

// cos((2x+1)·u·π / 64) voor x ∈ [0,32), u ∈ [0,8) — eenmalig voorberekend
const COS_TABLE: number[][] = Array.from({ length: PHASH_LOW }, (_, u) =>
  Array.from({ length: PHASH_SAMPLE }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SAMPLE)),
  ),
);

/**
 * Breng een RGBA-beeld terug tot `tw`×`th` grijswaarden via box-gemiddelden.
 * Exported voor tests; de pijplijn gebruikt hem intern voor de phash.
 */
export function grayscaleResize(
  img: DecodedImage,
  tw: number,
  th: number,
): Float64Array {
  const out = new Float64Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * img.height) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.height) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * img.width) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.width) / tw));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4;
          // luminantie (Rec. 601)
          sum += 0.299 * img.rgba[i] + 0.587 * img.rgba[i + 1] + 0.114 * img.rgba[i + 2];
        }
      }
      out[ty * tw + tx] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * 64-bits perceptuele hash (klassieke DCT-pHash): 32×32 grijswaarden → 2D
 * DCT-II → laagfrequente 8×8 hoek → bit per coëfficiënt t.o.v. de mediaan
 * (DC-term uitgezonderd). Resultaat: 16 hex-tekens. Robuust tegen schalen,
 * compressie-artefacten en helderheidsverschuivingen.
 */
export function computePhashFromPixels(img: DecodedImage): string {
  const gray = grayscaleResize(img, PHASH_SAMPLE, PHASH_SAMPLE);

  // 2D DCT-II, alleen de PHASH_LOW×PHASH_LOW hoek is nodig
  const coeffs: number[] = new Array(PHASH_LOW * PHASH_LOW);
  for (let u = 0; u < PHASH_LOW; u++) {
    for (let v = 0; v < PHASH_LOW; v++) {
      let sum = 0;
      for (let y = 0; y < PHASH_SAMPLE; y++) {
        const cy = COS_TABLE[u][y];
        for (let x = 0; x < PHASH_SAMPLE; x++) {
          sum += gray[y * PHASH_SAMPLE + x] * cy * COS_TABLE[v][x];
        }
      }
      coeffs[u * PHASH_LOW + v] = sum;
    }
  }

  // mediaan over de AC-coëfficiënten (index 0 = DC, die domineert en telt niet mee)
  const ac = coeffs.slice(1).sort((a, b) => a - b);
  const median = ac[Math.floor(ac.length / 2)];

  let hex = "";
  for (let i = 0; i < coeffs.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | (coeffs[i + j] > median ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

/** Aantal afwijkende bits tussen twee even lange hex-hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`Hash-lengtes verschillen (${a.length} vs ${b.length}).`);
  }
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** Dichtstbijzijnde bestaande hash binnen `maxDistance`, anders null. */
export function findNearestPhash(
  candidates: Array<{ id: string; phash: string }>,
  phash: string,
  maxDistance: number,
): { id: string; phash: string; distance: number } | null {
  let best: { id: string; phash: string; distance: number } | null = null;
  for (const c of candidates) {
    if (c.phash.length !== phash.length) continue; // andere hash-generatie
    const distance = hammingDistance(c.phash, phash);
    if (distance <= maxDistance && (best === null || distance < best.distance)) {
      best = { ...c, distance };
    }
  }
  return best;
}

/* --------------------------------------------------------- dominante kleuren */

const COLOR_SAMPLE_TARGET = 10_000; // max aantal bemonsterde pixels
const ALPHA_MIN = 128; // (half)transparante pixels tellen niet mee

/**
 * De drie dominante kleuren van een beeld als hex-strings, via median-cut
 * quantisatie op een deterministische pixelsteekproef. Bij minder dan drie
 * te onderscheiden kleuren wordt de laatste herhaald (altijd 3 waarden,
 * zoals `assets.dominant_colors` verwacht).
 */
export function dominantColorsFromPixels(img: DecodedImage, count = 3): string[] {
  const totalPixels = img.width * img.height;
  const stride = Math.max(1, Math.floor(totalPixels / COLOR_SAMPLE_TARGET));
  const samples: Array<[number, number, number]> = [];
  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    if (img.rgba[i + 3] < ALPHA_MIN) continue;
    samples.push([img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]]);
  }
  if (samples.length === 0) return new Array(count).fill("#000000");

  const boxes: Array<Array<[number, number, number]>> = [samples];
  // splitsen tot we ruim genoeg dozen hebben (of niets meer te splitsen valt)
  while (boxes.length < count + 1) {
    const splittable = boxes
      .map((box, idx) => ({ box, idx, ...widestChannel(box) }))
      .filter((b) => b.range > 0)
      .sort((a, b) => b.range - a.range)[0];
    if (!splittable) break;
    const sorted = [...splittable.box].sort(
      (a, b) => a[splittable.channel] - b[splittable.channel],
    );
    const cut = splitBoundary(sorted, splittable.channel);
    if (cut === null) break;
    boxes.splice(splittable.idx, 1, sorted.slice(0, cut), sorted.slice(cut));
  }

  const colors = boxes
    .map((box) => ({ hex: averageHex(box), population: box.length }))
    .sort((a, b) => b.population - a.population)
    .map((b) => b.hex);
  while (colors.length < count) colors.push(colors[colors.length - 1]);
  return colors.slice(0, count);
}

function widestChannel(box: Array<[number, number, number]>): {
  channel: 0 | 1 | 2;
  range: number;
} {
  let channel: 0 | 1 | 2 = 0;
  let range = 0;
  for (const ch of [0, 1, 2] as const) {
    let min = 255;
    let max = 0;
    for (const px of box) {
      if (px[ch] < min) min = px[ch];
      if (px[ch] > max) max = px[ch];
    }
    if (max - min > range) {
      range = max - min;
      channel = ch;
    }
  }
  return { channel, range };
}

/**
 * Snijpunt voor median cut: zo dicht mogelijk bij het midden, maar altijd op
 * een grens waar de kanaalwaarde verandert zodat beide helften niet leeg zijn.
 */
function splitBoundary(
  sorted: Array<[number, number, number]>,
  channel: 0 | 1 | 2,
): number | null {
  const mid = Math.floor(sorted.length / 2);
  for (let offset = 0; offset < sorted.length; offset++) {
    for (const k of [mid - offset, mid + offset]) {
      if (k > 0 && k < sorted.length && sorted[k - 1][channel] !== sorted[k][channel]) {
        return k;
      }
    }
  }
  return null;
}

function averageHex(box: Array<[number, number, number]>): string {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const px of box) {
    r += px[0];
    g += px[1];
    b += px[2];
  }
  const toHex = (v: number) =>
    Math.round(v / box.length)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ------------------------------------------------------------------ decoder */

/**
 * Productie-decoder op basis van sharp (JPEG/PNG/WebP/AVIF → RGBA).
 * Lazy import zodat testomgevingen zonder native binding de pure functies
 * kunnen blijven gebruiken.
 */
export const sharpDecoder: ImageDecoder = async (bytes) => {
  let sharp: (typeof import("sharp"))["default"];
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new Error(
      "De dependency 'sharp' is niet geïnstalleerd — nodig om beelden te decoderen (npm i sharp).",
    );
  }
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  };
};

/* ----------------------------------------------------------------- pijplijn */

/**
 * Verwerk één beeld: valideren → decoderen → phash + kleuren → duplicaatcheck
 * → opslaan óf bronnen samenvoegen. Zie de module-docblock voor het waarom.
 *
 * @throws bij lege, te grote of niet-ondersteunde bestanden (Nederlandse
 *   melding, geschikt om direct in de UI te tonen).
 */
export async function ingestAsset(
  input: IngestInput,
  deps: IngestDeps,
): Promise<IngestResult> {
  if (!input.bytes || input.bytes.length === 0) throw new Error("Leeg bestand.");
  if (!IMAGE_MIME.has(input.contentType)) {
    throw new Error(
      `Niet-ondersteund bestandstype (${input.contentType || "onbekend"}). Gebruik JPG, PNG, WebP of AVIF.`,
    );
  }
  if (input.bytes.length > MAX_BYTES) throw new Error("Bestand te groot (max 25 MB).");

  const decode = deps.decode ?? sharpDecoder;
  const decoded = await decode(input.bytes);
  const phash = computePhashFromPixels(decoded);
  const dominantColors = dominantColorsFromPixels(decoded);

  const existing = await deps.repo.listPhashes();
  const duplicate = findNearestPhash(
    existing,
    phash,
    deps.maxHammingDistance ?? DUPLICATE_PHASH_THRESHOLD,
  );
  if (duplicate) {
    await deps.repo.mergeSource(duplicate.id, input);
    return {
      status: "duplicate",
      assetId: duplicate.id,
      phash,
      width: decoded.width,
      height: decoded.height,
      dominantColors,
    };
  }

  // Content-addressed pad: zelfde bytes → zelfde pad, dus put is idempotent.
  const ext = EXT_BY_MIME[input.contentType] ?? "bin";
  const path = `${input.source}/${sha256Hex(input.bytes).slice(0, 40)}.${ext}`;
  const storagePath = await deps.storage.put(path, input.bytes, input.contentType);

  const { id } = await deps.repo.insertAsset({
    source: input.source,
    sourceRef: input.sourceRef,
    sourceUrl: input.sourceUrl ?? null,
    storagePath,
    width: decoded.width,
    height: decoded.height,
    phash,
    dominantColors,
    productId: input.productId ?? null,
    tags: input.tags ?? [],
    igMetrics: input.igMetrics ?? null,
  });

  return {
    status: "stored",
    assetId: id,
    phash,
    width: decoded.width,
    height: decoded.height,
    dominantColors,
    storagePath,
  };
}
