/**
 * Een handgemaakte post (bv. AI-beelden uit een Codex/Higgsfield-sessie) als
 * CONCEPT in de social-reviewpagina zetten. De beelden gaan eerst de
 * beeldbibliotheek in (zonder logo; het CRM zet het merk er bij Zernio op),
 * met tag "ai-generated" zodat Instagram het AI-label krijgt.
 * Bij "Akkoord" in het CRM gaat de post naar Zernio en wordt hij ingepland.
 *
 *   npx tsx scripts/add-social-post.ts <manifest.json>           (dry run)
 *   npx tsx scripts/add-social-post.ts <manifest.json> --apply
 *
 * manifest: { "date": "2026-12-07", "theme": "interior", "kind": "carousel",
 *             "caption": "pad/naar/caption.txt", "images": ["a.jpg", ...], "aiGenerated": true }
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { ingestFromBytes } from "../app/api/assets/_ingest";
import { db } from "../lib/db";
import { socialAssetUsage, socialPosts } from "../lib/db/schema";
import { isoWeekday, shiftDate } from "../lib/social/planner";

const APPLY = process.argv.includes("--apply");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

interface Manifest {
  date: string;
  theme: string;
  kind: "carousel" | "single";
  caption: string;
  images: string[];
  aiGenerated?: boolean;
}

async function main() {
  if (!file) throw new Error("Geef het pad naar het manifest mee.");
  const base = path.dirname(path.resolve(file));
  const m = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new Error("date moet YYYY-MM-DD zijn.");
  const caption = fs.readFileSync(path.resolve(base, m.caption), "utf8").trim();
  const images = m.images.map((p) => path.resolve(base, p));
  for (const p of images) if (!fs.existsSync(p)) throw new Error(`Beeld ontbreekt: ${p}`);
  const weekStart = shiftDate(m.date, 1 - isoWeekday(m.date));

  const [existing] = await db.select({ id: socialPosts.id, status: socialPosts.status }).from(socialPosts).where(eq(socialPosts.plannedDate, m.date));
  console.log(`${m.date} (week ${weekStart}) ${m.kind} ${images.length} beeld(en) — ${caption.slice(0, 60).replace(/\n/g, " ")}…`);
  if (existing) throw new Error(`Op ${m.date} staat al een post (${existing.status}). Kies een andere dag.`);
  if (!APPLY) {
    console.log("Dry run — draai met --apply om te importeren.");
    process.exit(0);
  }

  const assetIds: string[] = [];
  for (const p of images) {
    const res = await ingestFromBytes({
      bytes: new Uint8Array(fs.readFileSync(p)),
      contentType: p.endsWith(".png") ? "image/png" : "image/jpeg",
      source: "upload",
      sourceRef: path.basename(p),
      tags: ["flex-surfaces", ...(m.aiGenerated ? ["ai-generated"] : [])], // zie AI_ASSET_TAG
    });
    assetIds.push(res.assetId);
  }

  const [row] = await db
    .insert(socialPosts)
    .values({
      weekStart,
      plannedDate: m.date,
      slot: 0,
      theme: m.theme,
      kind: m.kind,
      assetIds,
      caption,
      aiGenerated: Boolean(m.aiGenerated),
      status: "draft",
    })
    .returning({ id: socialPosts.id });
  await db.insert(socialAssetUsage).values(assetIds.map((assetId) => ({ assetId, postId: row.id, usedOn: m.date }))).onConflictDoNothing();
  console.log(`Klaar: post ${row.id} staat als concept in Marketing → Social media.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
