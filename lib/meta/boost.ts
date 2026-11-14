/**
 * Automatisch adverteren van nieuwe pagina-posts ("boosten").
 *
 * Elke post die op de Facebook-pagina verschijnt (en via Zernio ook op
 * Instagram) wordt — nadat Nick 'm in het CRM heeft goedgekeurd en gepost —
 * als advertentie toegevoegd aan de vaste advertentieset
 * `META_BOOST_ADSET_ID` (campagne "Bekendheid & volgers"). Omdat het een
 * bestaande paginapost is, gebruikt Meta op Instagram automatisch het eigen
 * account @habitatonejavea; de geblokkeerde portfolio-koppeling is daarvoor
 * niet nodig, en nieuwe creatives op basis van een bestaande post mogen ook
 * vanuit een app in ontwikkelingsmodus.
 *
 * Advertenties ouder dan {@link BOOST_MAX_AGE_DAYS} dagen worden gepauzeerd,
 * zodat het (vaste dag-)budget naar verse content gaat.
 *
 * Doorschuiven naar de klantencampagne (`META_CUSTOMERS_ADSET_ID`): heeft die
 * al {@link PROMOTE_INTERVAL_DAYS} dagen geen nieuwe advertentie gekregen, dan
 * gaat de best scorende post uit de bekendheidscampagne (laatste 7 dagen,
 * genoeg weergaven, hoogste klik+interactie-ratio) erin; de vorige
 * klantenadvertentie gaat dan op pauze. Zo draait de klantencampagne steeds op
 * bewezen content en verschilt hij van de bekendheidscampagne.
 */
import "server-only";

import { adAccountPath, meta } from "./client";

/** Hoe ver terug we nieuwe posts oppakken (ruimer dan de cron-interval). */
export const BOOST_LOOKBACK_DAYS = 7;
/** Na zoveel dagen draaien gaat een geboostte post uit. */
export const BOOST_MAX_AGE_DAYS = 21;

export type PagePost = { id: string; created_time: string; is_eligible_for_promotion?: boolean };
export type BoostAd = {
  id: string;
  created_time: string;
  status: string;
  /** `pageId_postId` waar de advertentie op draait. */
  objectStoryId: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** Welke posts nog geen advertentie hebben en recent genoeg zijn. */
export function postsToBoost(posts: PagePost[], ads: BoostAd[], now: Date): PagePost[] {
  const boosted = new Set(ads.map((a) => a.objectStoryId).filter(Boolean));
  const since = now.getTime() - BOOST_LOOKBACK_DAYS * DAY;
  return posts
    .filter((p) => p.is_eligible_for_promotion !== false)
    .filter((p) => new Date(p.created_time).getTime() >= since)
    .filter((p) => !boosted.has(p.id))
    .sort((a, b) => a.created_time.localeCompare(b.created_time));
}

/** Welke actieve advertenties oud genoeg zijn om te pauzeren. */
export function adsToPause(ads: BoostAd[], now: Date): BoostAd[] {
  const cutoff = now.getTime() - BOOST_MAX_AGE_DAYS * DAY;
  return ads.filter((a) => a.status === "ACTIVE" && new Date(a.created_time).getTime() < cutoff);
}

/** Om de zoveel dagen krijgt de klantencampagne een (bewezen) nieuwe post. */
export const PROMOTE_INTERVAL_DAYS = 7;
/** Minimaal aantal weergaven voordat een post als "bewezen" telt. */
export const PROMOTE_MIN_IMPRESSIONS = 300;

export type AdPerf = { adId: string; objectStoryId: string | null; impressions: number; clicks: number; engagements: number };

/** Score = (klikken + interacties) per weergave; kliks tellen dubbel want dat is het doel. */
export function promoteScore(p: AdPerf): number {
  return p.impressions ? (2 * p.clicks + p.engagements) / p.impressions : 0;
}

/**
 * Welke bekendheidspost naar de klantencampagne mag, of null als dat (nog)
 * niet hoeft: er draait daar al een advertentie van < interval oud, of er is
 * geen post met genoeg data die er nog niet in zat.
 */
export function pickPromotion(perf: AdPerf[], customerAds: BoostAd[], now: Date): AdPerf | null {
  const recent = customerAds.some(
    (a) => a.status === "ACTIVE" && now.getTime() - new Date(a.created_time).getTime() < PROMOTE_INTERVAL_DAYS * DAY,
  );
  if (recent) return null;
  const used = new Set(customerAds.map((a) => a.objectStoryId).filter(Boolean));
  const candidates = perf
    .filter((p) => p.objectStoryId && !used.has(p.objectStoryId) && p.impressions >= PROMOTE_MIN_IMPRESSIONS)
    .sort((a, b) => promoteScore(b) - promoteScore(a));
  return candidates[0] ?? null;
}

type Paged<T> = { data?: T[] };

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is niet ingesteld`);
  return v;
}

export type BoostResult = {
  ok: boolean;
  boosted: string[];
  paused: string[];
  promoted: string | null;
  errors: string[];
};

export async function runMetaBoost(now = new Date()): Promise<BoostResult> {
  const result: BoostResult = { ok: true, boosted: [], paused: [], promoted: null, errors: [] };
  const adSetId = process.env.META_BOOST_ADSET_ID;
  if (!adSetId) return { ...result, errors: ["META_BOOST_ADSET_ID ontbreekt — niets gedaan"] };
  const pageId = env("META_PAGE_ID");

  // Paginaposts lezen vereist een paginatoken; die halen we met het systeemgebruiker-token op.
  const { access_token: pageToken } = await meta.request<{ access_token?: string }>(`/${pageId}`, {
    query: { fields: "access_token" },
  });
  if (!pageToken) throw new Error("Kon geen paginatoken ophalen");

  const postsRes = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/${pageId}/published_posts?` +
      new URLSearchParams({ fields: "id,created_time,is_eligible_for_promotion", limit: "25" }),
    { headers: { authorization: `Bearer ${pageToken}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) },
  );
  if (!postsRes.ok) throw new Error(`Posts ophalen mislukt: ${postsRes.status} ${await postsRes.text()}`);
  const posts = ((await postsRes.json()) as Paged<PagePost>).data ?? [];

  const adsRaw = await meta.request<
    Paged<{ id: string; created_time: string; status: string; creative?: { object_story_id?: string } }>
  >(`/${adSetId}/ads`, { query: { fields: "id,created_time,status,creative{object_story_id}", limit: 200 } });
  const ads: BoostAd[] = (adsRaw.data ?? []).map((a) => ({
    id: a.id,
    created_time: a.created_time,
    status: a.status,
    objectStoryId: a.creative?.object_story_id ?? null,
  }));

  for (const post of postsToBoost(posts, ads, now)) {
    try {
      await createPostAd(post.id, adSetId, `Post ${post.created_time.slice(0, 10)}`);
      result.boosted.push(post.id);
    } catch (e) {
      result.ok = false;
      result.errors.push(`${post.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const ad of adsToPause(ads, now)) {
    try {
      await meta.request(`/${ad.id}`, { method: "POST", body: { status: "PAUSED" } });
      result.paused.push(ad.id);
    } catch (e) {
      result.ok = false;
      result.errors.push(`pauzeren ${ad.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const customersAdSetId = process.env.META_CUSTOMERS_ADSET_ID;
  if (customersAdSetId) {
    try {
      const [perfRaw, customerRaw] = await Promise.all([
        meta.request<Paged<{ ad_id: string; impressions?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[] }>>(
          `/${adSetId}/insights`,
          { query: { level: "ad", date_preset: "last_7d", fields: "ad_id,impressions,inline_link_clicks,actions", limit: 100 } },
        ),
        meta.request<Paged<{ id: string; created_time: string; status: string; creative?: { object_story_id?: string } }>>(
          `/${customersAdSetId}/ads`,
          { query: { fields: "id,created_time,status,creative{object_story_id}", limit: 100 } },
        ),
      ]);
      const storyByAd = new Map(ads.map((a) => [a.id, a.objectStoryId]));
      const perf: AdPerf[] = (perfRaw.data ?? []).map((r) => ({
        adId: r.ad_id,
        objectStoryId: storyByAd.get(r.ad_id) ?? null,
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.inline_link_clicks ?? 0),
        engagements: Number(r.actions?.find((a) => a.action_type === "post_engagement")?.value ?? 0),
      }));
      const customerAds: BoostAd[] = (customerRaw.data ?? []).map((a) => ({
        id: a.id,
        created_time: a.created_time,
        status: a.status,
        objectStoryId: a.creative?.object_story_id ?? null,
      }));
      const pick = pickPromotion(perf, customerAds, now);
      if (pick?.objectStoryId) {
        await createPostAd(pick.objectStoryId, customersAdSetId, `Doorgeschoven ${now.toISOString().slice(0, 10)}`);
        result.promoted = pick.objectStoryId;
        for (const old of customerAds.filter((a) => a.status === "ACTIVE")) {
          await meta.request(`/${old.id}`, { method: "POST", body: { status: "PAUSED" } });
          result.paused.push(old.id);
        }
      }
    } catch (e) {
      result.ok = false;
      result.errors.push(`doorschuiven: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** Maak een actieve advertentie op een bestaande paginapost, met pixel-tracking. */
async function createPostAd(objectStoryId: string, adSetId: string, name: string): Promise<void> {
  const creative = await meta.adCreatives.create({
    name: `Post ${objectStoryId.split("_")[1] ?? objectStoryId}`,
    object_story_id: objectStoryId,
  });
  const pixelId = process.env.META_PIXEL_ID;
  await meta.request(`/${adAccountPath()}/ads`, {
    method: "POST",
    body: {
      name,
      adset_id: adSetId,
      creative: { creative_id: creative.id },
      status: "ACTIVE",
      ...(pixelId ? { tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }] } : {}),
    },
  });
}
