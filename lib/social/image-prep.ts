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

/**
 * Officieel Flex-Surfaces-logo (zwart vlak met crème letters, "BY HABITAT-ONE"
 * eronder) bovenaan in het midden, ~40% van de beeldbreedte. Twee versies: met
 * zwarte onderregel voor een lichte ondergrond, met crème onderregel (en zachte
 * schaduw) voor een donkere — gekozen op de helderheid van het beeld daar.
 */
export const LOGO_WIDTH_RATIO = 0.4;
export const LOGO_TOP_RATIO = 0.03;

export function logoPlacement(
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
): { width: number; height: number; left: number; top: number } {
  const width = Math.round(imageWidth * LOGO_WIDTH_RATIO);
  const height = Math.round((logoHeight / logoWidth) * width);
  return { width, height, left: Math.round((imageWidth - width) / 2), top: Math.round(imageHeight * LOGO_TOP_RATIO) };
}

export type LogoVariant = "sub-dark" | "sub-cream";

/** Gemiddelde helderheid (0–255) onder de onderregel → welke versie leesbaar is. */
export function logoVariantFor(luminance: number): LogoVariant {
  return luminance > 140 ? "sub-dark" : "sub-cream";
}

const logoCache = new Map<LogoVariant, Buffer | null>();

async function loadLogo(variant: LogoVariant): Promise<Buffer | null> {
  if (logoCache.has(variant)) return logoCache.get(variant)!;
  const file = path.join(process.cwd(), "public", "brand", `flex-surfaces-logo-${variant}.png`);
  try {
    const buf = await readFile(file);
    logoCache.set(variant, buf);
    return buf;
  } catch {
    console.warn("[social] logo niet gevonden:", file);
    logoCache.set(variant, null);
    return null;
  }
}

/**
 * Lichte, rustige achtergrond onder de onderregel → zwarte "BY HABITAT-ONE".
 * Anders (donker of druk, bv. bladeren tegen de lucht) → crème onderregel met
 * een zacht donker verloop bovenaan het beeld, zodat hij altijd leesbaar is.
 */
export function logoStyleFor(mean: number, stdev: number): { variant: LogoVariant; gradient: boolean } {
  return mean > 165 && stdev < 28 ? { variant: "sub-dark", gradient: false } : { variant: "sub-cream", gradient: true };
}

let socialCache: Buffer | null | undefined;
async function loadSocial(): Promise<Buffer | null> {
  if (socialCache !== undefined) return socialCache;
  socialCache = await readFile(path.join(process.cwd(), "public", "brand", "flex-surfaces-logo-sub-cream-social.png")).catch(() => null);
  return socialCache;
}

/** Zacht verloop van boven (warm donker, ~69%) naar transparant op ~24% van de hoogte. */
async function topGradient(width: number, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const depth = height * 0.24;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const alpha = Math.round(175 * Math.pow(Math.max(0, 1 - y / depth), 1.6));
    if (!alpha) break;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[i] = 20; raw[i + 1] = 16; raw[i + 2] = 12; raw[i + 3] = alpha;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Logo (+ eventueel verloop) als composite-lagen op een beeld van width×height (`base` = het beeld zelf). */
async function logoLayers(base: Buffer, width: number, height: number): Promise<{ input: Buffer; left: number; top: number }[]> {
  const sharp = (await import("sharp")).default;
  const probe = await loadLogo("sub-dark");
  if (!probe) return [];
  const meta = await sharp(probe).metadata();
  const place = logoPlacement(width, height, meta.width ?? 1, meta.height ?? 1);
  const band = { left: place.left, top: place.top + Math.round(place.height * 0.78), width: place.width, height: Math.max(1, Math.round(place.height * 0.2)) };
  const stats = await sharp(base).resize(width, height, { fit: "fill" }).extract(band).greyscale().stats();
  const style = logoStyleFor(stats.channels[0].mean, stats.channels[0].stdev);
  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (style.gradient) layers.push({ input: await topGradient(width, height), left: 0, top: 0 });
  // Crème onderregel: de "-social"-versie met zachte schaduw (60 px rand rondom), zo
  // geschaald dat het logo even groot en op dezelfde plek staat als de gewone versie.
  const shadowed = style.variant === "sub-cream" ? await loadSocial() : null;
  if (shadowed) {
    const k = place.width / (meta.width ?? 1);
    const sm = await sharp(shadowed).metadata();
    const w = Math.round((sm.width ?? 1) * k);
    const h = Math.round((sm.height ?? 1) * k);
    const pad = Math.round(60 * k);
    const input = await sharp(shadowed).resize(w, h).png().toBuffer();
    const left = place.left - pad;
    const top = place.top - pad;
    if (left >= 0 && top >= 0 && left + w <= width && top + h <= height) {
      layers.push({ input, left, top });
      return layers;
    }
  }
  const logo = (await loadLogo(style.variant)) ?? probe;
  layers.push({ input: await sharp(logo).resize(place.width, place.height).png().toBuffer(), left: place.left, top: place.top });
  return layers;
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
    const baseBuf = await img.png().toBuffer();
    const layers = await logoLayers(baseBuf, tw, th);
    img = sharp(baseBuf);
    if (layers.length) img = img.composite(layers);
  }
  return img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/* ------------------------------------------------------------------ video */

const MUSIC_DIR = path.join(process.cwd(), "public", "brand", "music");

/** Het logo als transparante PNG op videoformaat; `frame` (een still) bepaalt welke versie. */
async function renderVideoOverlay(width: number, height: number, frame: Buffer | null): Promise<Buffer | null> {
  const sharp = (await import("sharp")).default;
  const base = frame ?? (await sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer());
  const layers = await logoLayers(base, width, height);
  if (!layers.length) return null;
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
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
 * Merk + muziek op de video: het officiële Flex-Surfaces-logo bovenaan in het
 * midden (zelfde opmaak als de foto's) en een rustig instrumentaal nummer met
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
    const still = path.join(dir, "still.png");
    const grabbed = await runFfmpeg(bin, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(1, info.seconds / 2)), "-i", input, "-frames:v", "1", still]);
    const frame = grabbed.code === 0 ? await readFile(still).catch(() => null) : null;
    const png = await renderVideoOverlay(info.width, info.height, frame);
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
