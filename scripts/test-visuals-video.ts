/**
 * Fase 0/2-proef: maak van een render (bv. uit test-visuals-image.ts) een
 * korte walkthrough-clip met Veo. Bewijst meteen of de key Veo-toegang heeft
 * (vereist betaald Gemini-tier — de gratis tier weigert dit).
 *
 * Gebruik:
 *   npx tsx scripts/test-visuals-video.ts <render.png> ["camerabeweging/wensen"]
 *
 * Uitvoer: MP4 in visuals-proef/.
 */
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import {
  downloadVideoBytes,
  pollVideoOperation,
  startVideoOperation,
  visualsAiConfigured,
} from "@/lib/visuals/gemini";

async function main() {
  const [bron, wensen = ""] = process.argv.slice(2);
  if (!bron) {
    console.log('Gebruik: npx tsx scripts/test-visuals-video.ts <render.png> ["camerabeweging/wensen"]');
    process.exit(1);
  }
  if (!visualsAiConfigured()) {
    console.error("GEMINI_API_KEY ontbreekt in .env.local");
    process.exit(1);
  }

  const prompt =
    `Slow, smooth walkthrough camera movement through this interior, as in a high-end real-estate video. ` +
    `The room stays exactly as shown in the image. Subtle natural light, no people, no text, no camera shake.` +
    (wensen.trim() ? ` ${wensen.trim()}` : "");

  console.log("Veo-operation starten…");
  const op = await startVideoOperation({
    prompt,
    image: { bytes: readFileSync(bron), mimeType: bron.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" },
  });
  console.log(`operation: ${op}\npollen (duurt doorgaans 1–3 min)…`);

  const start = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const status = await pollVideoOperation(op);
    if (status.error) throw new Error(status.error);
    if (status.done && status.fileUri) {
      const bytes = await downloadVideoBytes(status.fileUri);
      mkdirSync("visuals-proef", { recursive: true });
      const pad = join("visuals-proef", `${basename(bron, extname(bron))}-clip.mp4`);
      writeFileSync(pad, bytes);
      console.log(`✔ ${pad} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    console.log(`… nog bezig (${Math.round((Date.now() - start) / 1000)} s)`);
    if (Date.now() - start > 10 * 60_000) throw new Error("Na 10 minuten nog niet klaar — afgebroken.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
