/**
 * Fontbestanden voor de rendermotor — als ArrayBuffer uit `public/fonts`,
 * bewust NIET via een CDN (brief §6: het systeem moet blijven werken zonder
 * externe diensten). Sora is het huisstijl-font (zie app/layout.tsx).
 *
 * Server-only: leest van het bestandssysteem. De resultaten worden per proces
 * gecachet — fonts en logo's veranderen niet tijdens runtime.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { LOGO_FILES } from "./tokens";

export interface CreativeFont {
  name: "Sora";
  data: ArrayBuffer;
  weight: 400 | 600 | 800;
  style: "normal";
}

const FONT_FILES: Array<{ file: string; weight: CreativeFont["weight"] }> = [
  { file: "public/fonts/sora/Sora-Regular.ttf", weight: 400 },
  { file: "public/fonts/sora/Sora-SemiBold.ttf", weight: 600 },
  { file: "public/fonts/sora/Sora-ExtraBold.ttf", weight: 800 },
];

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

let fontsPromise: Promise<CreativeFont[]> | null = null;

/** Laad de Sora-gewichten (400/600/800) als ArrayBuffer, éénmaal per proces. */
export function loadCreativeFonts(): Promise<CreativeFont[]> {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ file, weight }) => {
      const buf = await readFile(path.join(process.cwd(), file));
      return { name: "Sora" as const, data: toArrayBuffer(buf), weight, style: "normal" as const };
    }),
  );
  return fontsPromise;
}

const logoCache = new Map<"cream" | "dark", Promise<string>>();

/**
 * Logovariant als data-URI, zodat Satori geen netwerk nodig heeft om het
 * logo in de creative te tekenen.
 */
export function loadLogoDataUri(variant: "cream" | "dark"): Promise<string> {
  let cached = logoCache.get(variant);
  if (!cached) {
    cached = readFile(path.join(process.cwd(), LOGO_FILES[variant])).then(
      (buf) => `data:image/png;base64,${buf.toString("base64")}`,
    );
    logoCache.set(variant, cached);
  }
  return cached;
}
