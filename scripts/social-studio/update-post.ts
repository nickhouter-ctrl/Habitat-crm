/**
 * Een CONCEPT-post bijwerken met zelfgemaakte (al afgewerkte) media en tekst,
 * na upload naar Zernio door zernio.py. Raakt alleen posts met status
 * draft/failed — nooit iets dat al akkoord, ingepland of gepubliceerd is.
 *
 *   npx tsx scripts/social-studio/update-post.ts <update.json>
 *   update.json: { "id": "...", "kind": "carousel"|"single"|"video", "theme": "...",
 *                  "caption": "...", "mediaUrls": ["https://media.zernio.com/..."],
 *                  "zernioPostId": "...", "aiGenerated": true }
 */
import "../load-env";
import fs from "node:fs";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../lib/db";
import { socialAssetUsage, socialPosts } from "../../lib/db/schema";

interface Update {
  id: string;
  kind: "carousel" | "single" | "video";
  theme?: string;
  caption: string;
  mediaUrls: string[];
  zernioPostId: string;
  aiGenerated: boolean;
}

(async () => {
  const u = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as Update;
  if (!u.id || !u.caption?.trim() || !u.mediaUrls?.length || !u.zernioPostId) throw new Error("id, caption, mediaUrls en zernioPostId zijn verplicht.");
  if (!u.mediaUrls.every((x) => x.startsWith("https://media.zernio.com/"))) throw new Error("Media moeten via Zernio geüpload zijn.");
  const video = u.kind === "video";
  const [row] = await db
    .update(socialPosts)
    .set({
      kind: u.kind,
      ...(u.theme ? { theme: u.theme } : {}),
      caption: u.caption.trim(),
      // Eigen, al afgewerkte media: geen bibliotheekbeelden meer (anders zou het CRM ze opnieuw bijsnijden/merken).
      assetIds: [],
      videoAssetId: null,
      videoUrl: video ? u.mediaUrls[0] : null,
      videoJob: null,
      zernioMediaUrls: u.mediaUrls,
      zernioPostId: u.zernioPostId,
      aiGenerated: u.aiGenerated,
      status: "draft",
      error: null,
    })
    .where(and(eq(socialPosts.id, u.id), inArray(socialPosts.status, ["draft", "failed"])))
    .returning({ id: socialPosts.id, date: socialPosts.plannedDate });
  if (!row) throw new Error("Post niet gevonden of niet meer bewerkbaar (al akkoord/ingepland?).");
  await db.delete(socialAssetUsage).where(eq(socialAssetUsage.postId, u.id));
  console.log(`bijgewerkt: ${row.date} (${row.id})`);
  process.exit(0);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
