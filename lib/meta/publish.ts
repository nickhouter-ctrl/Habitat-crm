/**
 * Publicatieketen (brief §7): PNG → POST /act/adimages → image_hash →
 * POST /act/adcreatives met object_story_spec → POST /act/ads met
 * status: PAUSED. Fase 1 zet niets live (§3.4) — activeren gebeurt in Ads
 * Manager. Elke mislukte publicatie belandt zichtbaar op de ad-rij in de UI
 * mét de vertaalde Meta-foutmelding, niet alleen in een log.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { adCampaigns, ads, adSets, creativeSpecs } from "@/lib/db/schema";

import {
  adAccountPath,
  eurToCents,
  meta,
  metaErrorMessage,
  withMetaRetry,
  MetaError,
} from "./client";
import type { MetaStatusFields, ObjectStorySpec } from "./types";

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

/* ------------------------------------------- campagne- & adset-push (U5) */

/** Invoer voor {@link buildCampaignPayload}. */
export interface CampaignPushInput {
  name: string;
  objective: string | null;
}

/**
 * Meta-payload voor een nieuwe campagne — altijd PAUSED (§3.4).
 * `special_ad_categories` is verplicht sinds v18; wij adverteren materialen
 * en verbouwingen, geen woningaanbod, dus "NONE". Zou hier ooit
 * vastgoed-aanbod door moeten, dan is HOUSING wettelijk verplicht.
 */
export function buildCampaignPayload(input: CampaignPushInput): Record<string, unknown> {
  return {
    name: input.name,
    objective: input.objective ?? "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: ["NONE"],
    // Verplicht (v23, subcode 4834011) zodra budgetten op adset-niveau staan —
    // zoals bij ons. `false`: adsets delen geen 20% van elkaars budget; de
    // leerlaag rekent per adset en budgetdeling zou die cijfers vervuilen.
    is_adset_budget_sharing_enabled: false,
  };
}

/** Invoer voor {@link buildAdSetPayload} — spiegelt de `ad_sets`-rij. */
export interface AdSetPushInput {
  name: string;
  campaignMetaId: string;
  /** Doelstelling van de bovenliggende campagne (bepaalt optimization_goal). */
  objective: string | null;
  startTime: Date | null;
  endTime: Date | null;
  dailyBudgetEur: string | null;
  lifetimeBudgetEur: string | null;
  dayparting: unknown[] | null;
  targeting: unknown | null;
}

/** DSA-begunstigde (EU-transparantie): configureerbaar, default de eigen zaak. */
function dsaBeneficiary(): string {
  return process.env.META_DSA_BENEFICIARY ?? "Habitat One & One SL";
}

/**
 * Meta-payload voor een nieuwe advertentieset — altijd PAUSED. Budgetten in
 * centen via {@link eurToCents} (nooit floats, §9); dagdelen als
 * `adset_schedule` + `pacing_type: ["day_parting"]` (vereist lifetime-budget —
 * de aanroeper draait {@link validateAdSetScheduling} vóóraf). Standaard-
 * targeting is Spanje; een eigen `targeting`-object gaat één-op-één door en
 * wordt door de aanroeper op de rij bewaard (reproduceerbaarheid).
 * Lead-formulieren zijn een latere fase, dus leads optimaliseren we
 * voorlopig ook op LINK_CLICKS.
 */
export function buildAdSetPayload(input: AdSetPushInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignMetaId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: input.objective === "OUTCOME_AWARENESS" ? "REACH" : "LINK_CLICKS",
    // Verplicht (v23, subcode 2490487): zonder expliciete strategie eist Meta
    // een bodbedrag. Laagste kosten zonder limiet = geen bod nodig en past bij
    // kleine showroombudgetten; een bodlimiet is voor later, als er data is.
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    // DSA-transparantie (EU, subcode 3858081): wie profiteert van en wie
    // betaalt voor de advertentie. Bij ons allebei de eigen zaak.
    dsa_beneficiary: dsaBeneficiary(),
    dsa_payor: process.env.META_DSA_PAYOR ?? dsaBeneficiary(),
    targeting: input.targeting ?? { geo_locations: { countries: ["ES"] } },
  };
  if (input.dailyBudgetEur) payload.daily_budget = eurToCents(input.dailyBudgetEur);
  if (input.lifetimeBudgetEur) payload.lifetime_budget = eurToCents(input.lifetimeBudgetEur);
  if (input.startTime) payload.start_time = input.startTime.toISOString();
  if (input.endTime) payload.end_time = input.endTime.toISOString();
  if (Array.isArray(input.dayparting) && input.dayparting.length > 0) {
    payload.adset_schedule = input.dayparting;
    payload.pacing_type = ["day_parting"];
  }
  return payload;
}

/** Uitkomst van een push of koppeling — fouten al vertaald voor de UI. */
export type PushResult = { ok: true; metaId: string } | { ok: false; error: string };

/** Zet een CRM-campagne als gepauzeerde campagne in Meta; schrijft meta_id terug. */
export async function pushCampaignToMeta(campaignId: string): Promise<PushResult> {
  const [campaign] = await db
    .select()
    .from(adCampaigns)
    .where(eq(adCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return { ok: false, error: "Campagne niet gevonden in het CRM." };
  if (campaign.metaId) return { ok: true, metaId: campaign.metaId };

  try {
    const created = await withMetaRetry(() =>
      meta.campaigns.create(buildCampaignPayload(campaign)),
    );
    if (!created.id) throw new MetaError(200, created, "Meta gaf geen campagne-id terug");
    await db
      .update(adCampaigns)
      .set({ metaId: created.id, effectiveStatus: "PAUSED", lastSyncedAt: new Date() })
      .where(eq(adCampaigns.id, campaignId));
    return { ok: true, metaId: created.id };
  } catch (err) {
    return { ok: false, error: metaErrorMessage(err) };
  }
}

/**
 * Zet een CRM-advertentieset als gepauzeerde adset in Meta; schrijft meta_id
 * en de daadwerkelijk verstuurde targeting terug. De campagne moet al in
 * Meta staan (of eerst gepusht/gekoppeld worden).
 */
export async function pushAdSetToMeta(adSetId: string): Promise<PushResult> {
  const [adSet] = await db.select().from(adSets).where(eq(adSets.id, adSetId)).limit(1);
  if (!adSet) return { ok: false, error: "Advertentieset niet gevonden in het CRM." };
  if (adSet.metaId) return { ok: true, metaId: adSet.metaId };

  const [campaign] = await db
    .select()
    .from(adCampaigns)
    .where(eq(adCampaigns.id, adSet.campaignId))
    .limit(1);
  if (!campaign?.metaId) {
    return {
      ok: false,
      error: "De campagne staat nog niet in Meta. Zet eerst de campagne in Meta (of koppel een bestaand id).",
    };
  }

  const schedulingErrors = validateAdSetScheduling({
    startTime: adSet.startTime,
    endTime: adSet.endTime,
    dayparting: adSet.dayparting as unknown[] | null,
    lifetimeBudgetEur: adSet.lifetimeBudgetEur,
    dailyBudgetEur: adSet.dailyBudgetEur,
  });
  if (schedulingErrors.length > 0) {
    return { ok: false, error: schedulingErrors.join(" ") };
  }

  const payload = buildAdSetPayload({
    name: adSet.name,
    campaignMetaId: campaign.metaId,
    objective: campaign.objective,
    startTime: adSet.startTime,
    endTime: adSet.endTime,
    dailyBudgetEur: adSet.dailyBudgetEur,
    lifetimeBudgetEur: adSet.lifetimeBudgetEur,
    dayparting: adSet.dayparting as unknown[] | null,
    targeting: adSet.targeting,
  });

  try {
    const created = await withMetaRetry(() => meta.adSets.create(payload));
    if (!created.id) throw new MetaError(200, created, "Meta gaf geen adset-id terug");
    await db
      .update(adSets)
      .set({
        metaId: created.id,
        effectiveStatus: "PAUSED",
        targeting: payload.targeting,
        lastSyncedAt: new Date(),
      })
      .where(eq(adSets.id, adSetId));
    return { ok: true, metaId: created.id };
  } catch (err) {
    return { ok: false, error: metaErrorMessage(err) };
  }
}

/**
 * Koppel een bestáánd Meta-object aan een CRM-rij (voor campagnes/adsets die
 * al in Business Manager zijn aangemaakt). Valideert het id bij Meta en
 * neemt meteen de actuele effective_status over.
 */
export async function linkExistingMetaId(
  kind: "campaign" | "adSet",
  localId: string,
  metaId: string,
): Promise<PushResult> {
  try {
    const status = await withMetaRetry(() =>
      meta.request<MetaStatusFields>(`/${metaId}`, { query: { fields: "effective_status" } }),
    );
    const table = kind === "campaign" ? adCampaigns : adSets;
    await db
      .update(table)
      .set({
        metaId,
        effectiveStatus: status.effective_status ?? null,
        lastSyncedAt: new Date(),
      })
      .where(eq(table.id, localId));
    return { ok: true, metaId };
  } catch (err) {
    if (err instanceof MetaError && (err.status === 404 || err.code === 100)) {
      return {
        ok: false,
        error: "Meta kent dit id niet (of het token mag het niet zien). Controleer het id in Ads Manager.",
      };
    }
    return { ok: false, error: metaErrorMessage(err) };
  }
}

/* -------------------------------------------------------- video-ads (U7) */

/** Invoer voor {@link buildVideoStorySpec}. */
export interface VideoStorySpecInput {
  pageId: string;
  igUserId?: string | null;
  /** Meta-video-id uit de /advideos-upload. */
  videoId: string;
  /** Publieke URL van het posterframe — verplicht bij video_data. */
  imageUrl: string;
  message: string;
  link: string;
  callToAction: string;
}

/** De `object_story_spec` voor een video-ad (video_data i.p.v. link_data). */
export function buildVideoStorySpec(input: VideoStorySpecInput): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    page_id: input.pageId,
    video_data: {
      video_id: input.videoId,
      image_url: input.imageUrl,
      message: input.message,
      call_to_action: { type: input.callToAction, value: { link: input.link } },
    },
  };
  if (input.igUserId) spec.instagram_user_id = input.igUserId;
  return spec;
}

/** Invoer voor {@link publishVideoAdToMeta}. */
export interface PublishVideoAdInput {
  /** Onze `ads`-rij met `assetId` (video) — de editor is image-only, dus de
   *  copy komt hier rechtstreeks uit copy_blocks (via getCopySuggestion of
   *  handmatig), niet uit een CreativeSpec. */
  adId: string;
  /** Publieke URL van de video in onze eigen Storage. */
  videoUrl: string;
  /** Publieke URL van het posterframe (assets.thumbnailPath). */
  thumbnailUrl: string;
  message: string;
  link: string;
  callToAction?: string;
}

/**
 * Wacht tot Meta de geüploade video verwerkt heeft (advideos is asynchroon);
 * een adcreative op een onverwerkte video faalt. Injecteerbare sleep voor
 * tests.
 */
async function waitForVideoReady(
  videoId: string,
  opts: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 10;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    const res = await withMetaRetry(() =>
      meta.request<{ status?: { video_status?: string } }>(`/${videoId}`, {
        query: { fields: "status" },
      }),
    );
    if (res.status?.video_status === "ready") return true;
    if (res.status?.video_status === "error") return false;
    await sleep(3000);
  }
  return false;
}

/**
 * Publiceer een video-asset als GEPAUZEERDE video-ad (U7):
 * video-URL → POST /act/advideos (file_url — Meta haalt de video zelf uit
 * onze publieke Storage, geen multipart nodig) → wachten op verwerking →
 * adcreative met video_data → ad PAUSED. Zelfde stapsgewijze vastlegging en
 * foutafhandeling als de beeldketen; fouten landen vertaald op de ad-rij.
 */
export async function publishVideoAdToMeta(input: PublishVideoAdInput): Promise<PushResult> {
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) {
    return { ok: false, error: "META_PAGE_ID is niet ingesteld (zie .env.example)." };
  }
  const igUserId = process.env.IG_USER_ID ?? null;

  const [ad] = await db.select().from(ads).where(eq(ads.id, input.adId)).limit(1);
  if (!ad) return { ok: false, error: "Advertentie niet gevonden in het CRM." };
  if (!ad.assetId) {
    return { ok: false, error: "Deze advertentie heeft geen video-asset — beeld-ads gaan via de creative-keten." };
  }
  const [adSet] = await db.select().from(adSets).where(eq(adSets.id, ad.adSetId)).limit(1);
  if (!adSet?.metaId) {
    return {
      ok: false,
      error: "De advertentieset staat nog niet in Meta. Zet eerst de advertentieset in Meta.",
    };
  }

  try {
    // Stap 1 — video registreren; imageHash-kolom hergebruiken we als
    // opslagplek voor het Meta-video-id zodat de keten hervatbaar blijft.
    let videoId = ad.imageHash;
    if (!videoId) {
      const uploaded = await withMetaRetry(() =>
        meta.request<{ id?: string }>(`/${adAccountPath()}/advideos`, {
          method: "POST",
          body: { file_url: input.videoUrl },
          timeoutMs: 60_000,
        }),
      );
      if (!uploaded.id) throw new MetaError(200, uploaded, "Meta gaf geen video-id terug");
      videoId = uploaded.id;
      await db.update(ads).set({ imageHash: videoId }).where(eq(ads.id, ad.id));
    }

    if (!(await waitForVideoReady(videoId))) {
      return {
        ok: false,
        error: "Meta is de video nog aan het verwerken. Probeer het over een paar minuten opnieuw — de upload blijft bewaard.",
      };
    }

    // Stap 2 — adcreative met video_data.
    let metaCreativeId = ad.metaCreativeId;
    if (!metaCreativeId) {
      const creative = await withMetaRetry(() =>
        meta.adCreatives.create({
          name: ad.name,
          object_story_spec: buildVideoStorySpec({
            pageId,
            igUserId,
            videoId,
            imageUrl: input.thumbnailUrl,
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
    return { ok: true, metaId: metaAdId };
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
  if (!ad.specId) {
    return { ok: false, error: "Deze advertentie is een video-ad — publiceer hem via de videoketen." };
  }

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
