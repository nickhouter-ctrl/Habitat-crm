/**
 * Beeldvoorbereiding voor social: bijsnijden naar 1080×1350 (staand, feed en
 * carrousel) of 1080×1080 (vierkant), en het Flex-Surfaces-woordmerk
 * linksonder erop (public/brand/flex-surfaces-lockup.png, gemaakt met
 * scripts/generate-brand-lockup.ts).
 *
 * De rekenkunde (uitsnede, plek van het merk) is puur en getest; sharp wordt
 * pas bij gebruik geladen, net als in lib/marketing/ingest.ts.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type SocialFormat = "portrait" | "square" | "story";

export const FORMAT_SIZE: Record<SocialFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  /** 9:16 — bronbeeld voor de Reel (het videomodel neemt het formaat van het beeld over). */
  story: { width: 1080, height: 1920 },
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

/** Merk: ~48% van de beeldbreedte, marge 5% van de breedte, linksonder. */
export const LOCKUP_WIDTH_RATIO = 0.48;
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

/**
 * Donkere verloopvlek linksonder, zodat het witte merk ook op lichte steen
 * leesbaar blijft: zwart, max ~45% dekking in de hoek, ~75% breed × 30% hoog,
 * zacht uitlopend naar transparant.
 */
export const SCRIM_MAX_OPACITY = 0.45;
export const SCRIM_WIDTH_RATIO = 0.75;
export const SCRIM_HEIGHT_RATIO = 0.3;

export function scrimGeometry(imageWidth: number, imageHeight: number): { rx: number; ry: number } {
  return { rx: Math.round(imageWidth * SCRIM_WIDTH_RATIO), ry: Math.round(imageHeight * SCRIM_HEIGHT_RATIO) };
}

/**
 * SVG (zonder tekst, dus geen fonts nodig): een zwarte ellips met de hoek
 * linksonder als middelpunt, sterk vervaagd. librsvg vervaagt alleen wat op
 * het canvas staat, dus het canvas is aan alle kanten `pad` groter; daarna
 * snijdt `renderScrim` het beeldformaat eruit — zo houdt de hoek zelf volle
 * dekking en loopt de rand zacht uit naar transparant.
 */
export function scrimSvg(imageWidth: number, imageHeight: number): { svg: string; pad: number } {
  const { rx, ry } = scrimGeometry(imageWidth, imageHeight);
  const blur = Math.round(ry * 0.3);
  const pad = blur * 3;
  const w = imageWidth + 2 * pad;
  const h = imageHeight + 2 * pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <filter id="b" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${blur}"/></filter>
  </defs>
  <ellipse cx="${pad}" cy="${imageHeight + pad}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="${SCRIM_MAX_OPACITY}" filter="url(#b)"/>
</svg>`;
  return { svg, pad };
}

/** De verloopvlek als PNG op beeldformaat. */
async function renderScrim(imageWidth: number, imageHeight: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { svg, pad } = scrimSvg(imageWidth, imageHeight);
  return sharp(Buffer.from(svg)).extract({ left: pad, top: pad, width: imageWidth, height: imageHeight }).png().toBuffer();
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
      img = sharp(await img.toBuffer()).composite([
        { input: await renderScrim(tw, th), left: 0, top: 0 },
        { input: resized, left: place.left, top: place.top },
      ]);
    }
  }
  return img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/* ------------------------------------------------------------------ video */

const MUSIC_DIR = path.join(process.cwd(), "public", "brand", "music");

/** Logo + verloopvlek als transparante PNG op videoformaat (zelfde opmaak als de foto's). */
async function renderVideoOverlay(width: number, height: number): Promise<Buffer | null> {
  const sharp = (await import("sharp")).default;
  const lockup = await loadLockup();
  if (!lockup) return null;
  const meta = await sharp(lockup).metadata();
  const place = lockupPlacement(width, height, meta.width ?? 1, meta.height ?? 1);
  const resized = await sharp(lockup).resize(place.width, place.height).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await renderScrim(width, height), left: 0, top: 0 },
      { input: resized, left: place.left, top: place.top },
    ])
    .png()
    .toBuffer();
}

/** Afmetingen + duur uit de ffmpeg-uitvoer (er zit geen ffprobe in ffmpeg-static). */
export function parseFfmpegInfo(stderr: string): { width: number; height: number; seconds: number } | null {
  const dim = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const dur = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!dim || !dur) return null;
  return {
    width: Number(dim[1]),
    height: Number(dim[2]),
    seconds: Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]),
  };
}

function runFfmpeg(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-20000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/**
 * Merk + muziek op de video: Flex-Surfaces-logo linksonder (met dezelfde
 * verloopvlek als op de foto's) en een rustig instrumentaal nummer met
 * fade-in/-out. Lukt het niet (geen ffmpeg, kapotte video), dan gaat de video
 * ongewijzigd door — de post blijft dan bruikbaar.
 */
export async function brandVideo(bytes: Uint8Array, seed = ""): Promise<Uint8Array> {
  let bin: string | null = null;
  try {
    bin = ((await import("ffmpeg-static")) as unknown as { default: string | null }).default;
  } catch {
    bin = null;
  }
  if (!bin) {
    console.warn("[social] ffmpeg niet beschikbaar; video zonder logo/muziek");
    return bytes;
  }
  const dir = await mkdtemp(path.join(tmpdir(), "social-video-"));
  try {
    const input = path.join(dir, "in.mp4");
    const overlay = path.join(dir, "logo.png");
    const output = path.join(dir, "out.mp4");
    await writeFile(input, bytes);
    const info = parseFfmpegInfo((await runFfmpeg(bin, ["-hide_banner", "-i", input])).stderr);
    if (!info) throw new Error("videoformaat niet te lezen");
    const png = await renderVideoOverlay(info.width, info.height);
    if (!png) return bytes;
    await writeFile(overlay, png);

    const tracks = (await readdir(MUSIC_DIR).catch(() => [] as string[])).filter((f) => f.endsWith(".mp3")).sort();
    const track = tracks.length ? path.join(MUSIC_DIR, tracks[hashSeed(seed) % tracks.length]) : null;
    const d = Math.max(1, info.seconds);
    const fadeOut = Math.max(0, d - 1.5).toFixed(2);
    const args = ["-hide_banner", "-y", "-i", input, "-i", overlay];
    if (track) args.push("-stream_loop", "-1", "-i", track);
    args.push(
      "-filter_complex",
      track
        ? `[0:v][1:v]overlay=0:0,format=yuv420p[v];[2:a]volume=0.85,afade=t=in:d=0.6,afade=t=out:st=${fadeOut}:d=1.5[a]`
        : "[0:v][1:v]overlay=0:0,format=yuv420p[v]",
      "-map", "[v]",
    );
    if (track) args.push("-map", "[a]", "-c:a", "aac", "-b:a", "160k");
    else args.push("-map", "0:a?", "-c:a", "copy");
    args.push("-t", d.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", output);
    const res = await runFfmpeg(bin, args);
    if (res.code !== 0) throw new Error(res.stderr.split("\n").slice(-4).join(" ").slice(0, 300));
    return new Uint8Array(await readFile(output));
  } catch (err) {
    console.warn("[social] video-merk mislukt; video ongewijzigd:", err);
    return bytes;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
