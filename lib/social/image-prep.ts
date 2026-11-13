/**
 * Beeldvoorbereiding voor social: bijsnijden naar 1080×1350 (staand, feed en
 * carrousel) of 1080×1080 (vierkant), en het Flex-Surfaces-woordmerk
 * linksonder erop (public/brand/flex-surfaces-lockup.png, gemaakt met
 * scripts/generate-brand-lockup.ts).
 *
 * De rekenkunde (uitsnede, plek van het merk) is puur en getest; sharp wordt
 * pas bij gebruik geladen, net als in lib/marketing/ingest.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type SocialFormat = "portrait" | "square";

export const FORMAT_SIZE: Record<SocialFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
};

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Grootste uitsnede met de doelverhouding binnen de bron ("cover"), rond een
 * focuspunt (0..1, standaard het midden) en altijd binnen de randen.
 */
export function coverCrop(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): CropBox {
  if (srcWidth <= 0 || srcHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Ongeldige afmetingen voor bijsnijden.");
  }
  const targetRatio = targetWidth / targetHeight;
  let width = srcWidth;
  let height = Math.round(srcWidth / targetRatio);
  if (height > srcHeight) {
    height = srcHeight;
    width = Math.round(srcHeight * targetRatio);
  }
  width = Math.min(width, srcWidth);
  height = Math.min(height, srcHeight);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const left = clamp(Math.round(focus.x * srcWidth - width / 2), srcWidth - width);
  const top = clamp(Math.round(focus.y * srcHeight - height / 2), srcHeight - height);
  return { left, top, width, height };
}

/** Merk: ~38% van de beeldbreedte, marge 5% van de breedte, linksonder. */
export const LOCKUP_WIDTH_RATIO = 0.38;
export const LOCKUP_MARGIN_RATIO = 0.05;

export function lockupPlacement(
  imageWidth: number,
  imageHeight: number,
  lockupWidth: number,
  lockupHeight: number,
): { width: number; height: number; left: number; top: number } {
  const width = Math.round(imageWidth * LOCKUP_WIDTH_RATIO);
  const height = Math.round((lockupHeight / lockupWidth) * width);
  const margin = Math.round(imageWidth * LOCKUP_MARGIN_RATIO);
  return { width, height, left: margin, top: Math.max(0, imageHeight - margin - height) };
}

const LOCKUP_PATH = path.join(process.cwd(), "public", "brand", "flex-surfaces-lockup.png");
let lockupCache: Buffer | null = null;

async function loadLockup(): Promise<Buffer | null> {
  if (lockupCache) return lockupCache;
  try {
    lockupCache = await readFile(LOCKUP_PATH);
    return lockupCache;
  } catch {
    console.warn("[social] merk-PNG niet gevonden:", LOCKUP_PATH);
    return null;
  }
}

/** Snijd bij, schaal naar het formaat en zet het merk erop. Geeft JPEG terug. */
export async function prepareSocialImage(
  bytes: Uint8Array,
  format: SocialFormat,
  opts: { brand?: boolean } = {},
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { width: tw, height: th } = FORMAT_SIZE[format];
  // .rotate() zonder argument volgt de EXIF-oriëntatie (telefoonfoto's).
  const oriented = await sharp(Buffer.from(bytes)).rotate().toBuffer({ resolveWithObject: true });
  const crop = coverCrop(oriented.info.width, oriented.info.height, tw, th);
  let img = sharp(oriented.data).extract(crop).resize(tw, th, { fit: "fill" });

  if (opts.brand !== false) {
    const lockup = await loadLockup();
    if (lockup) {
      const meta = await sharp(lockup).metadata();
      const place = lockupPlacement(tw, th, meta.width ?? 1, meta.height ?? 1);
      const resized = await sharp(lockup).resize(place.width, place.height).png().toBuffer();
      img = sharp(await img.toBuffer()).composite([{ input: resized, left: place.left, top: place.top }]);
    }
  }
  return img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * TODO(video-branding): het merk ook op video's. Er zit geen ffmpeg in de
 * stack; zodra dat er is (bv. ffmpeg-static in een aparte functie) hier de
 * overlay doen. Tot die tijd gaat de video ongewijzigd door.
 */
export async function brandVideo(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes;
}
