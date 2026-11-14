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
  errors: string[];
};

export async function runMetaBoost(now = new Date()): Promise<BoostResult> {
  const result: BoostResult = { ok: true, boosted: [], paused: [], errors: [] };
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

  const pixelId = process.env.META_PIXEL_ID;
  for (const post of postsToBoost(posts, ads, now)) {
    try {
      const creative = await meta.adCreatives.create({
        name: `Post ${post.id.split("_")[1] ?? post.id}`,
        object_story_id: post.id,
      });
      await meta.request(`/${adAccountPath()}/ads`, {
        method: "POST",
        body: {
          name: `Post ${post.created_time.slice(0, 10)}`,
          adset_id: adSetId,
          creative: { creative_id: creative.id },
          status: "ACTIVE",
          ...(pixelId
            ? { tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }] }
            : {}),
        },
      });
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
  return result;
}
