/**
 * Publicatieketen (brief §7): PNG → POST /act/adimages → image_hash →
 * POST /act/adcreatives met object_story_spec → POST /act/ads met
 * status: PAUSED. Fase 1 zet niets live (§3.4) — activeren gebeurt in Ads
 * Manager. Elke mislukte publicatie belandt zichtbaar op de ad-rij in de UI
 * mét de vertaalde Meta-foutmelding, niet alleen in een log.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ads, adSets, creativeSpecs } from "@/lib/db/schema";

import { meta, metaErrorMessage, withMetaRetry, MetaError } from "./client";
import type { ObjectStorySpec } from "./types";

/* ------------------------------------------------- adset-planningsvalidatie */

/** Invoer voor {@link validateAdSetScheduling} — spiegelt de `ad_sets`-rij. */
export interface AdSetSchedulingInput {
  startTime?: Date | null;
  endTime?: Date | null;
  /** Meta `adset_schedule`-blokken; aanwezig = team wil dagdelen. */
  dayparting?: unknown[] | null;
  lifetimeBudgetEur?: string | null;
  dailyBudgetEur?: string | null;
}

/**
 * Valideer planning en budgetvorm van een advertentieset vóór de Meta-call.
 * Dagdelen vereisen een lifetime-budget — zonder deze check faalt de API-call
 * met een cryptische melding (brief §7). Geeft NL-foutzinnen terug; leeg =
 * geldig.
 */
export function validateAdSetScheduling(input: AdSetSchedulingInput): string[] {
  const errors: string[] = [];
  const hasDayparting = Array.isArray(input.dayparting) && input.dayparting.length > 0;
  const hasLifetime = !!input.lifetimeBudgetEur;
  const hasDaily = !!input.dailyBudgetEur;

  if (hasDayparting && !hasLifetime) {
    errors.push(
      "Dagdelen (advertentieschema) vereisen een lifetime-/looptijdbudget. Kies een looptijdbudget of laat de dagdelen weg.",
    );
  }
  if (hasLifetime && !hasDaily && !input.endTime) {
    errors.push(
      "Een looptijdbudget vereist een einddatum voor de advertentieset. Vul een einddatum in.",
    );
  }
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
    errors.push("De einddatum moet na de startdatum liggen.");
  }
  if (hasLifetime && hasDaily) {
    errors.push(
      "Kies óf een dagbudget óf een looptijdbudget, niet allebei — Meta accepteert er precies één.",
    );
  }
  if (!hasLifetime && !hasDaily) {
    errors.push("Een advertentieset heeft een budget nodig: dagbudget of looptijdbudget.");
  }
  return errors;
}

/* -------------------------------------------------------- object_story_spec */

/** Invoer voor {@link buildObjectStorySpec}. */
export interface ObjectStorySpecInput {
  pageId: string;
  /** Instagram-account-id; null/leeg = geen Instagram-plaatsing meesturen. */
  igUserId?: string | null;
  imageHash: string;
  message: string;
  link: string;
  /** Meta CTA-type, bv. "LEARN_MORE" of "CONTACT_US". */
  callToAction: string;
}

/** Bouw de `object_story_spec` voor een link-ad met beeld (puur, testbaar). */
export function buildObjectStorySpec(input: ObjectStorySpecInput): ObjectStorySpec {
  const spec: ObjectStorySpec = {
    page_id: input.pageId,
    link_data: {
      image_hash: input.imageHash,
      message: input.message,
      link: input.link,
      call_to_action: { type: input.callToAction, value: { link: input.link } },
    },
  };
  if (input.igUserId) spec.instagram_user_id = input.igUserId;
  return spec;
}

/* ---------------------------------------------------------- publicatieketen */

/** Invoer voor {@link publishAdToMeta}. */
export interface PublishAdInput {
  /** Onze `ads`-rij (moet bestaan; `adSetId` moet een Meta-id hebben). */
  adId: string;
  /** De gerenderde PNG van de spec — bytes, geen URL (wij kopiëren altijd). */
  png: Uint8Array;
  /** Advertentietekst (message in de link_data). */
  message: string;
  /** Landingspagina. */
  link: string;
  /** Meta CTA-type; default "LEARN_MORE". */
  callToAction?: string;
}

/** Uitkomst van een publicatiepoging — fouten zijn al vertaald voor de UI. */
export type PublishResult =
  | { ok: true; metaAdId: string; imageHash: string; metaCreativeId: string }
  | { ok: false; error: string };

/**
 * Publiceer één ad-rij naar Meta als GEPAUZEERDE advertentie. Elke stap wordt
 * direct op de rij vastgelegd (imageHash → metaCreativeId → metaId), zodat een
 * halverwege mislukte keten zichtbaar en hervatbaar is. Bij een fout krijgt de
 * rij `effectiveStatus: "PUBLISH_FAILED"` + de vertaalde melding in
 * `reviewFeedback.publishError` — prominent in de campagne-UI (T8).
 */
export async function publishAdToMeta(input: PublishAdInput): Promise<PublishResult> {
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) {
    return { ok: false, error: "META_PAGE_ID is niet ingesteld (zie .env.example)." };
  }
  const igUserId = process.env.IG_USER_ID ?? null;

  const [ad] = await db.select().from(ads).where(eq(ads.id, input.adId)).limit(1);
  if (!ad) return { ok: false, error: "Advertentie niet gevonden in het CRM." };

  const [adSet] = await db.select().from(adSets).where(eq(adSets.id, ad.adSetId)).limit(1);
  if (!adSet?.metaId) {
    return {
      ok: false,
      error: "De advertentieset staat nog niet in Meta. Publiceer eerst de advertentieset.",
    };
  }
  const [spec] = await db
    .select()
    .from(creativeSpecs)
    .where(eq(creativeSpecs.id, ad.specId))
    .limit(1);
  if (spec && spec.status !== "approved" && spec.status !== "scheduled") {
    return {
      ok: false,
      error: `De creative heeft status "${spec.status}" — alleen goedgekeurde creatives kunnen naar Meta. Keur de creative eerst goed.`,
    };
  }

  try {
    // Stap 1 — beeld uploaden. Elke stap in zijn eigen retry-envelop: een
    // rate-limit halverwege mag eerdere stappen niet overdoen.
    const imageHash =
      ad.imageHash ?? (await withMetaRetry(() => meta.adImages.upload(input.png)));
    await db.update(ads).set({ imageHash }).where(eq(ads.id, ad.id));

    // Stap 2 — adcreative met object_story_spec (incl. Instagram-plaatsing).
    let metaCreativeId = ad.metaCreativeId;
    if (!metaCreativeId) {
      const creative = await withMetaRetry(() =>
        meta.adCreatives.create({
          name: ad.name,
          object_story_spec: buildObjectStorySpec({
            pageId,
            igUserId,
            imageHash,
            message: input.message,
            link: input.link,
            callToAction: input.callToAction ?? "LEARN_MORE",
          }),
        }),
      );
      if (!creative.id) throw new MetaError(200, creative, "Meta gaf geen creative-id terug");
      metaCreativeId = creative.id;
      await db.update(ads).set({ metaCreativeId }).where(eq(ads.id, ad.id));
    }

    // Stap 3 — de advertentie zelf, altijd PAUSED (afgedwongen in de client).
    let metaAdId = ad.metaId;
    if (!metaAdId) {
      const created = await withMetaRetry(() =>
        meta.ads.create({
          name: ad.name,
          adset_id: adSet.metaId,
          creative: { creative_id: metaCreativeId },
        }),
      );
      if (!created.id) throw new MetaError(200, created, "Meta gaf geen ad-id terug");
      metaAdId = created.id;
    }
    await db
      .update(ads)
      .set({ metaId: metaAdId, effectiveStatus: "PAUSED", lastSyncedAt: new Date() })
      .where(eq(ads.id, ad.id));

    return { ok: true, metaAdId, imageHash, metaCreativeId };
  } catch (err) {
    const message = metaErrorMessage(err);
    await db
      .update(ads)
      .set({
        effectiveStatus: "PUBLISH_FAILED",
        reviewFeedback: {
          publishError: message,
          code: err instanceof MetaError ? err.code : undefined,
          at: new Date().toISOString(),
        },
      })
      .where(eq(ads.id, ad.id));
    return { ok: false, error: message };
  }
}
