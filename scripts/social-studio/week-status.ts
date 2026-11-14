/**
 * Overzicht van de social-posts van een week (JSON) voor de wekelijkse
 * content-sessie. Alleen lezen.
 *   npx tsx scripts/social-studio/week-status.ts [weekStart]   (standaard: volgende week)
 */
import "../load-env";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../lib/db";
import { assets, socialPosts } from "../../lib/db/schema";
import { nextWeekStart } from "../../lib/social/planner";

(async () => {
  const weekStart = process.argv[2] ?? nextWeekStart(new Date());
  const posts = await db.select().from(socialPosts).where(eq(socialPosts.weekStart, weekStart)).orderBy(asc(socialPosts.plannedDate));
  const ids = posts.flatMap((p) => [...p.assetIds, ...(p.videoSourceAssetId ? [p.videoSourceAssetId] : []), ...(p.videoAssetId ? [p.videoAssetId] : [])]);
  const names = new Map(
    ids.length ? (await db.select({ id: assets.id, ref: assets.sourceRef }).from(assets).where(inArray(assets.id, ids))).map((a) => [a.id, a.ref]) : [],
  );
  console.log(
    JSON.stringify(
      {
        weekStart,
        posts: posts.map((p) => ({
          id: p.id,
          date: p.plannedDate,
          time: p.publishTime,
          status: p.status,
          kind: p.kind,
          theme: p.theme,
          images: p.assetIds.map((id) => names.get(id) ?? id),
          videoSource: p.videoSourceAssetId ? names.get(p.videoSourceAssetId) : null,
          hasVideo: Boolean(p.videoUrl || p.videoAssetId),
          customMedia: p.assetIds.length === 0 && Boolean(p.zernioMediaUrls?.length),
          zernioPostId: p.zernioPostId,
          aiGenerated: p.aiGenerated,
          caption: p.caption,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
})();
