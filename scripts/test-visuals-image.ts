/**
 * Fase 0-kwaliteitsproef voor de Visualisaties-feature (plan 24-08-2026):
 * maak van een bronbeeld een fotorealistische render met Gemini.
 *
 * Gebruik:
 *   npx tsx scripts/test-visuals-image.ts <bronbeeld> [modus] ["extra wensen"]
 *
 * Modus:
 *   design    — SketchUp-aanzicht → fotorealistisch, geometrie exact behouden (default)
 *   floorplan — 2D-plattegrond → render van een ruimte (geef de ruimte in de wensen)
 *   restyle   — foto van bestaande ruimte → gerenoveerde versie
 *   tuin      — tuinfoto → aangelegde tuin
 *
 * Uitvoer: PNG in visuals-proef/ (projectroot). Vereist GEMINI_API_KEY in .env.local
 * (gratis key van aistudio.google.com is genoeg voor deze proef).
 */
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { generateImage, visualsAiConfigured } from "@/lib/visuals/gemini";

const STIJL =
  "moderne mediterrane stijl (Costa Blanca): warme natuurtinten, microcement, licht hout, veel daglicht";

const PROMPTS: Record<string, (wensen: string) => string> = {
  design: (w) =>
    `Turn this 3D design view (SketchUp) into a photorealistic interior photo. ` +
    `CRITICAL: keep the exact geometry, camera angle, wall positions, window and door placement and room layout from the source image — only replace materials, lighting and finishes with photorealistic ones. ` +
    `Style: ${STIJL}.${w ? ` Extra wishes: ${w}.` : ""} High-end real-estate photography, natural light, no people, no text.`,
  floorplan: (w) =>
    `This is a 2D floor plan of a home on the Costa Blanca (Spain). Create a photorealistic interior photo of ${w || "the living room"}, consistent with the layout shown in the plan. ` +
    `Style: ${STIJL}. High-end real-estate photography, natural light, no people, no text.`,
  restyle: (w) =>
    `This is a photo of an existing room before renovation. Show the SAME room, same camera angle and same architecture, but fully renovated. ` +
    `Style: ${STIJL}.${w ? ` Extra wishes: ${w}.` : ""} Photorealistic, natural light, no people, no text.`,
  tuin: (w) =>
    `This is a photo of a garden before landscaping. Show the SAME garden from the same viewpoint, but professionally landscaped: mediterranean planting (olive trees, lavender), natural stone terrace, ambient lighting.${w ? ` Extra wishes: ${w}.` : ""} Photorealistic, golden-hour light, no people, no text.`,
};

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const [bron, modus = "design", wensen = ""] = process.argv.slice(2);
  if (!bron || !(modus in PROMPTS)) {
    console.log("Gebruik: npx tsx scripts/test-visuals-image.ts <bronbeeld> [design|floorplan|restyle|tuin] [\"extra wensen\"]");
    process.exit(1);
  }
  if (!visualsAiConfigured()) {
    console.error("GEMINI_API_KEY ontbreekt in .env.local — maak een (gratis) key op https://aistudio.google.com");
    process.exit(1);
  }
  const mime = MIME[extname(bron).toLowerCase()];
  if (!mime) {
    console.error(`Bronbeeld moet png/jpg/webp zijn (kreeg: ${bron}). Exporteer een PDF-plattegrond eerst als afbeelding.`);
    process.exit(1);
  }

  const prompt = PROMPTS[modus](wensen.trim());
  console.log(`modus: ${modus}\nprompt: ${prompt}\n`);
  console.time("generatie");
  const beeld = await generateImage({
    prompt,
    referenceImages: [{ bytes: readFileSync(bron), mimeType: mime }],
    aspectRatio: "16:9",
  });
  console.timeEnd("generatie");

  mkdirSync("visuals-proef", { recursive: true });
  const naam = `${basename(bron, extname(bron))}-${modus}-${Date.now() % 100000}.png`;
  const pad = join("visuals-proef", naam);
  writeFileSync(pad, beeld.bytes);
  console.log(`✔ ${pad} (${(beeld.bytes.length / 1024).toFixed(0)} kB)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
