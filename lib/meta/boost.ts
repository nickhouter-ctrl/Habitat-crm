/**
 * Automatisch adverteren van nieuwe pagina-posts ("boosten").
 *
 * Elke post die op de Facebook-pagina verschijnt (en via Zernio ook op
 * Instagram) wordt — nadat Nick 'm in het CRM heeft goedgekeurd en gepost —
 * als advertentie toegevoegd aan de klantencampagne
 * (`META_CUSTOMERS_ADSET_ID`, "Klanten – showroom Jávea"). Omdat het een
 * bestaande paginapost is, gebruikt Meta op Instagram automatisch het eigen
 * account @habitatonejavea.
 *
 * Er draait steeds maar één post tegelijk: komt er een nieuwe post bij, dan
 * gaan de andere advertenties in die set op pauze. De bekendheidscampagne
 * wordt niet meer gebruikt — die leverde veel bereik maar nauwelijks klikken
 * (nov 2026: 9 klikken voor € 26,76 tegen 254 in de klantencampagne).
 */
import "server-only";

import { adAccountPath, meta } from "./client";

/** Hoe ver terug we nieuwe posts oppakken (ruimer dan de cron-interval). */
export const BOOST_LOOKBACK_DAYS = 7;

export type PagePost = { id: string; created_time: string; is_eligible_for_promotion?: boolean };
export type BoostAd = {
  id: string;
  created_time: string;
  status: string;
  /** `pageId_postId` waar de advertentie op draait. */
  objectStoryId: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * De nieuwste post die nog nooit in deze set is geadverteerd en recent genoeg
 * is, of null. Oudere ongeboostte posts slaan we over: er draait er maar één.
 */
export function postToBoost(posts: PagePost[], ads: BoostAd[], now: Date): PagePost | null {
  const boosted = new Set(ads.map((a) => a.objectStoryId).filter(Boolean));
  const since = now.getTime() - BOOST_LOOKBACK_DAYS * DAY;
  const candidates = posts
    .filter((p) => p.is_eligible_for_promotion !== false)
    .filter((p) => new Date(p.created_time).getTime() >= since)
    .sort((a, b) => b.created_time.localeCompare(a.created_time));
  const newest = candidates[0];
  return newest && !boosted.has(newest.id) ? newest : null;
}

/**
 * Een advertentie die Nick zelf heeft gekozen (naam begint met "Gekozen:")
 * blijft staan: zolang die actief is, boost de cron niets automatisch.
 */
export const CHOSEN_PREFIX = "Gekozen:";
export function hasChosenAd(ads: { status: string; name?: string | null }[]): boolean {
  return ads.some((a) => a.status === "ACTIVE" && (a.name ?? "").startsWith(CHOSEN_PREFIX));
}

/** Welke actieve advertenties uit moeten zodra `keepAdId` draait. */
export function adsToPause(ads: BoostAd[], keepAdId: string): BoostAd[] {
  return ads.filter((a) => a.status === "ACTIVE" && a.id !== keepAdId);
}

type Paged<T> = { data?: T[] };

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is niet ingesteld`);
  return v;
}

export type BoostResult = {
  ok: boolean;
  boosted: string | null;
  paused: string[];
  errors: string[];
};

export async function runMetaBoost(now = new Date()): Promise<BoostResult> {
  const result: BoostResult = { ok: true, boosted: null, paused: [], errors: [] };
  const adSetId = process.env.META_CUSTOMERS_ADSET_ID;
  if (!adSetId) return { ...result, errors: ["META_CUSTOMERS_ADSET_ID ontbreekt — niets gedaan"] };
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
    Paged<{ id: string; name?: string; created_time: string; status: string; creative?: { object_story_id?: string } }>
  >(`/${adSetId}/ads`, { query: { fields: "id,name,created_time,status,creative{object_story_id}", limit: 200 } });
  if (hasChosenAd(adsRaw.data ?? [])) return result;
  const ads: BoostAd[] = (adsRaw.data ?? []).map((a) => ({
    id: a.id,
    created_time: a.created_time,
    status: a.status,
    objectStoryId: a.creative?.object_story_id ?? null,
  }));

  const post = postToBoost(posts, ads, now);
  if (!post) return result;

  let newAdId: string;
  try {
    newAdId = await createPostAd(post.id, adSetId, `Post ${post.created_time.slice(0, 10)}`);
    result.boosted = post.id;
  } catch (e) {
    return { ...result, ok: false, errors: [`${post.id}: ${e instanceof Error ? e.message : String(e)}`] };
  }

  for (const ad of adsToPause(ads, newAdId)) {
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

/** Maak een actieve advertentie op een bestaande paginapost, met pixel-tracking. */
async function createPostAd(objectStoryId: string, adSetId: string, name: string): Promise<string> {
  const creative = await meta.adCreatives.create({
    name: `Post ${objectStoryId.split("_")[1] ?? objectStoryId}`,
    object_story_id: objectStoryId,
  });
  const pixelId = process.env.META_PIXEL_ID;
  const ad = await meta.request<{ id: string }>(`/${adAccountPath()}/ads`, {
    method: "POST",
    body: {
      name,
      adset_id: adSetId,
      creative: { creative_id: creative.id },
      status: "ACTIVE",
      ...(pixelId ? { tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }] } : {}),
    },
  });
  return ad.id;
}
