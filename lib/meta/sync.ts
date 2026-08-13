/**
 * Statussync (brief §7): haalt `effective_status` en `ad_review_feedback` op
 * voor al onze campagnes, advertentiesets en advertenties met een Meta-id en
 * overschrijft die velden bij elke sync. Afkeuringen komen zo in
 * `ads.reviewFeedback` terecht en worden prominent getoond in de CRM-lijst.
 */
import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { adCampaigns, ads, adSets } from "@/lib/db/schema";

import { meta, withMetaRetry } from "./client";
import type { MetaStatusFields } from "./types";

/** Max object-id's per `/?ids=…`-call (Graph API-limiet is 50). */
const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Aantallen bijgewerkte rijen per entiteit — voor de cron-respons/logs. */
export interface SyncResult {
  campaigns: number;
  adSets: number;
  ads: number;
}

/**
 * Haal statussen batched op en schrijf ze terug. Een object dat Meta niet
 * (meer) kent laten we ongemoeid — het CRM-record blijft de eigen waarheid;
 * alleen een geslaagd antwoord overschrijft. PUBLISH_FAILED (lokale marker
 * van een mislukte publicatie) blijft staan tot een sync een echte status
 * teruggeeft voor dat metaId.
 */
export async function syncMetaStatuses(): Promise<SyncResult> {
  const result: SyncResult = { campaigns: 0, adSets: 0, ads: 0 };

  // -- campagnes en advertentiesets: alleen effective_status
  const campaignRows = await db
    .select({ id: adCampaigns.id, metaId: adCampaigns.metaId })
    .from(adCampaigns)
    .where(isNotNull(adCampaigns.metaId));
  for (const batch of chunk(campaignRows, BATCH_SIZE)) {
    const statuses = await withMetaRetry(() =>
      meta.statusBatch(batch.map((r) => r.metaId!), "effective_status"),
    );
    for (const row of batch) {
      const status = statuses[row.metaId!];
      if (!status) continue;
      await db
        .update(adCampaigns)
        .set({ effectiveStatus: status.effective_status, lastSyncedAt: new Date() })
        .where(eq(adCampaigns.id, row.id));
      result.campaigns++;
    }
  }

  const adSetRows = await db
    .select({ id: adSets.id, metaId: adSets.metaId })
    .from(adSets)
    .where(isNotNull(adSets.metaId));
  for (const batch of chunk(adSetRows, BATCH_SIZE)) {
    const statuses = await withMetaRetry(() =>
      meta.statusBatch(batch.map((r) => r.metaId!), "effective_status"),
    );
    for (const row of batch) {
      const status = statuses[row.metaId!];
      if (!status) continue;
      await db
        .update(adSets)
        .set({ effectiveStatus: status.effective_status, lastSyncedAt: new Date() })
        .where(eq(adSets.id, row.id));
      result.adSets++;
    }
  }

  // -- advertenties: ook ad_review_feedback (afkeuringen zichtbaar maken)
  const adRows = await db
    .select({ id: ads.id, metaId: ads.metaId })
    .from(ads)
    .where(isNotNull(ads.metaId));
  for (const batch of chunk(adRows, BATCH_SIZE)) {
    const statuses = await withMetaRetry(() =>
      meta.statusBatch(
        batch.map((r) => r.metaId!),
        "effective_status,ad_review_feedback",
      ),
    );
    for (const row of batch) {
      const status = statuses[row.metaId!];
      if (!status) continue;
      await db
        .update(ads)
        .set({
          effectiveStatus: status.effective_status,
          reviewFeedback: status.ad_review_feedback ?? null,
          lastSyncedAt: new Date(),
        })
        .where(eq(ads.id, row.id));
      result.ads++;
    }
  }

  return result;
}

/**
 * Sync één zojuist gepubliceerde advertentie meteen (acceptatie §7: status
 * binnen een minuut terug in het CRM, zonder op de cron te wachten).
 */
export async function syncSingleAd(adId: string): Promise<MetaStatusFields | null> {
  const [row] = await db
    .select({ id: ads.id, metaId: ads.metaId })
    .from(ads)
    .where(eq(ads.id, adId))
    .limit(1);
  if (!row?.metaId) return null;
  const statuses = await withMetaRetry(() =>
    meta.statusBatch([row.metaId!], "effective_status,ad_review_feedback"),
  );
  const status = statuses[row.metaId];
  if (!status) return null;
  await db
    .update(ads)
    .set({
      effectiveStatus: status.effective_status,
      reviewFeedback: status.ad_review_feedback ?? null,
      lastSyncedAt: new Date(),
    })
    .where(eq(ads.id, row.id));
  return status;
}
