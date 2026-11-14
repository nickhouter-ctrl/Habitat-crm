/**
 * Live advertentiecijfers rechtstreeks uit de Meta Insights-API, voor de
 * pagina Marketing → Advertenties live. Geen opslag: elke paginaweergave
 * vraagt Meta opnieuw (Meta zelf loopt een paar minuten achter).
 */
import "server-only";

import { adAccountPath, meta as metaClient } from "./client";

/** Zelfde client, maar zonder te wachten bij een hoge benutting (zie getLiveStatsCached). */
const meta = {
  request: <T>(path: string, init: Parameters<typeof metaClient.request>[1] = {}) =>
    metaClient.request<T>(path, { ...init, noWait: true }),
};
import { leadCount } from "./weekly-report";

export const PERIODS = {
  today: "Vandaag",
  yesterday: "Gisteren",
  last_7d: "Laatste 7 dagen",
  this_month: "Deze maand",
  maximum: "Sinds de start",
} as const;
export type Period = keyof typeof PERIODS;

export function parsePeriod(v: string | undefined): Period {
  return v && v in PERIODS ? (v as Period) : "last_7d";
}

type Action = { action_type: string; value: string };
type Row = {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  publisher_platform?: string;
  reach?: string;
  impressions?: string;
  inline_link_clicks?: string;
  spend?: string;
  actions?: Action[];
};

export type Metrics = { reach: number; impressions: number; clicks: number; leads: number; spend: number };

export function toMetrics(r: Row): Metrics {
  return {
    reach: Number(r.reach ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.inline_link_clicks ?? 0),
    leads: leadCount(r.actions),
    spend: Number(r.spend ?? 0),
  };
}

const FIELDS = "reach,impressions,inline_link_clicks,spend,actions";

/** YYYY-MM-DD in de tijdzone van het advertentieaccount (Europe/Amsterdam). */
function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
}

/**
 * Meta's `last_7d` telt vandaag níet mee (7 volle dagen vóór vandaag) — voor een
 * live-pagina verwarrend. Daarom "laatste 7 dagen" = vandaag + 6 dagen terug.
 */
export function periodQuery(period: Period, now = new Date()): Record<string, string> {
  if (period === "last_7d") {
    const since = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { time_range: JSON.stringify({ since: ymd(since), until: ymd(now) }) };
  }
  return { date_preset: period };
}

async function insights(period: Period, extra: Record<string, string>): Promise<Row[]> {
  const res = await meta.request<{ data?: Row[] }>(`/${adAccountPath()}/insights`, {
    query: { ...periodQuery(period), limit: 100, ...extra },
  });
  return res.data ?? [];
}

/** Datumbereik (YYYY-MM-DD, `until` exclusief) voor pagina-insights per periode. */
export function periodRange(period: Period, now = new Date()): { since: string; until: string } {
  const day = 24 * 60 * 60 * 1000;
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getTime() + day));
  switch (period) {
    case "today":
      return { since: today, until: tomorrow };
    case "yesterday":
      return { since: ymd(new Date(now.getTime() - day)), until: today };
    case "last_7d":
      return { since: ymd(new Date(now.getTime() - 6 * day)), until: tomorrow };
    case "this_month":
      return { since: `${today.slice(0, 8)}01`, until: tomorrow };
    default:
      // Meta staat maximaal ±90 dagen per pagina-insights-call toe.
      return { since: ymd(new Date(now.getTime() - 89 * day)), until: tomorrow };
  }
}

export type AdExtras = {
  frequency: number;
  linkCtr: number;
  cpc: number;
  cpm: number;
  landingPageViews: number;
  engagements: number;
};

export type FacebookStats = {
  followers: number | null;
  /** Som over de periode; null als Meta de metric niet gaf. */
  reached: number | null;
  views: number | null;
  engagements: number | null;
  newFollows: number | null;
};

export type InstagramPost = {
  id: string;
  permalink: string;
  image: string | null;
  caption: string;
  timestamp: string;
  likes: number;
  comments: number;
  kind: string;
};

export type InstagramStats = {
  followers: number | null;
  follows: number | null;
  posts: number | null;
  recent: InstagramPost[];
};

type IgMedia = {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  children?: { data?: { media_url?: string; media_type?: string; thumbnail_url?: string }[] };
};

type FbPost = {
  full_picture?: string;
  attachments?: { data?: { media?: { image?: { src?: string } }; subattachments?: { data?: { media?: { image?: { src?: string } } }[] } }[] };
};

/** Alle beelden van een Facebook-post (carrouselkaarten, anders de hoofdfoto). */
export function postImageList(p: FbPost): string[] {
  const att = p.attachments?.data?.[0];
  const kids = (att?.subattachments?.data ?? []).map((d) => d.media?.image?.src).filter(Boolean) as string[];
  if (kids.length) return kids;
  const one = att?.media?.image?.src ?? p.full_picture;
  return one ? [one] : [];
}

/** Beelden van een Instagram-post; bij een carrousel alle kaarten, bij video de thumbnail. */
export function mediaImages(m: IgMedia): string[] {
  const pick = (x: { media_url?: string; media_type?: string; thumbnail_url?: string }) =>
    x.media_type === "VIDEO" ? (x.thumbnail_url ?? null) : (x.media_url ?? null);
  const kids = (m.children?.data ?? []).map(pick).filter(Boolean) as string[];
  if (kids.length) return kids;
  const one = pick(m);
  return one ? [one] : [];
}

export type AdPreview = {
  images: string[];
  caption: string;
  likes: number;
  comments: number;
  permalink: string | null;
  cta: string | null;
};

export type AdCard = Metrics & {
  id: string;
  name: string;
  campaign: string;
  status: string;
  previewLink: string | null;
  preview: AdPreview | null;
  /** Totaal sinds de start (los van de gekozen periode). */
  lifetime: Metrics & { start: string | null; stop: string | null };
};

const ACTIVE_STATES = new Set(["ACTIVE", "PENDING_REVIEW", "IN_PROCESS"]);

/** Splits advertenties in lopend en eerder (gepauzeerd/gestopt/afgekeurd). */
export function splitAds<T extends { status: string }>(ads: T[]): { active: T[]; past: T[] } {
  return { active: ads.filter((a) => ACTIVE_STATES.has(a.status)), past: ads.filter((a) => !ACTIVE_STATES.has(a.status)) };
}

export type LiveStats = {
  total: Metrics;
  activeAds: AdCard[];
  pastAds: AdCard[];
  extras: AdExtras;
  facebook: FacebookStats;
  instagram: InstagramStats;
  campaigns: (Metrics & { id: string; name: string; status: string; dailyBudget: number | null })[];
  ads: (Metrics & { id: string; name: string; campaign: string; status: string })[];
  platforms: (Metrics & { platform: string })[];
};

const actionValue = (actions: Action[] | undefined, type: string) =>
  Number(actions?.find((a) => a.action_type === type)?.value ?? 0);

async function getFacebook(period: Period): Promise<FacebookStats> {
  const pageId = process.env.META_PAGE_ID;
  const empty: FacebookStats = { followers: null, reached: null, views: null, engagements: null, newFollows: null };
  if (!pageId) return empty;
  try {
    const { access_token: pageToken } = await meta.request<{ access_token?: string }>(`/${pageId}`, {
      query: { fields: "access_token" },
    });
    if (!pageToken) return empty;
    const base = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/${pageId}`;
    const get = async (path: string) => {
      const r = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${pageToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      return r.ok ? r.json() : null;
    };
    const { since, until } = periodRange(period);
    const metrics = "page_total_media_view_unique,page_media_view,page_post_engagements,page_daily_follows_unique";
    const [page, ins] = await Promise.all([
      get(`?fields=followers_count`),
      get(`/insights?${new URLSearchParams({ metric: metrics, period: "day", since, until })}`),
    ]);
    const sum = (name: string): number | null => {
      const m = (ins?.data as { name: string; values?: { value?: number }[] }[] | undefined)?.find((d) => d.name === name);
      return m ? (m.values ?? []).reduce((n, v) => n + (typeof v.value === "number" ? v.value : 0), 0) : null;
    };
    return {
      followers: typeof page?.followers_count === "number" ? page.followers_count : null,
      reached: sum("page_total_media_view_unique"),
      views: sum("page_media_view"),
      engagements: sum("page_post_engagements"),
      newFollows: sum("page_daily_follows_unique"),
    };
  } catch {
    return empty;
  }
}

async function getInstagram(): Promise<InstagramStats> {
  const igId = process.env.META_IG_ACCOUNT_ID;
  const empty: InstagramStats = { followers: null, follows: null, posts: null, recent: [] };
  if (!igId) return empty;
  try {
    const [profile, media] = await Promise.all([
      meta.request<{ followers_count?: number; follows_count?: number; media_count?: number }>(`/${igId}`, {
        query: { fields: "followers_count,follows_count,media_count" },
      }),
      meta.request<{
        data?: {
          id: string;
          caption?: string;
          media_type: string;
          media_url?: string;
          thumbnail_url?: string;
          permalink: string;
          timestamp: string;
          like_count?: number;
          comments_count?: number;
        }[];
      }>(`/${igId}/media`, {
        query: { fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count", limit: 6 },
      }),
    ]);
    return {
      followers: profile.followers_count ?? null,
      follows: profile.follows_count ?? null,
      posts: profile.media_count ?? null,
      recent: (media.data ?? []).map((m) => ({
        id: m.id,
        permalink: m.permalink,
        image: m.media_type === "VIDEO" ? (m.thumbnail_url ?? null) : (m.media_url ?? null),
        caption: (m.caption ?? "").split("\n")[0].slice(0, 90),
        timestamp: m.timestamp,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        kind: m.media_type,
      })),
    };
  } catch {
    return empty;
  }
}

export async function getLiveStats(period: Period): Promise<LiveStats> {
  const [totalRows, campaignRows, adRows, platformRows, campaignMeta, adMeta, facebook, instagram] = await Promise.all([
    insights(period, { fields: `${FIELDS},frequency,inline_link_click_ctr,cpc,cpm` }),
    insights(period, { level: "campaign", fields: `campaign_id,campaign_name,${FIELDS}` }),
    insights(period, { level: "ad", fields: `ad_id,ad_name,campaign_name,${FIELDS}` }),
    insights(period, { fields: FIELDS, breakdowns: "publisher_platform" }),
    meta.request<{ data?: { id: string; name: string; effective_status: string; adsets?: { data?: { daily_budget?: string }[] } }[] }>(
      `/${adAccountPath()}/campaigns`,
      { query: { fields: "id,name,effective_status,adsets{daily_budget}", limit: 50 } },
    ),
    meta.request<{
      data?: {
        id: string;
        name: string;
        effective_status: string;
        preview_shareable_link?: string;
        campaign?: { name?: string };
        creative?: { thumbnail_url?: string; image_url?: string; effective_instagram_media_id?: string; call_to_action_type?: string; object_story_id?: string };
      }[];
    }>(`/${adAccountPath()}/ads`, {
      query: {
        fields: "id,name,effective_status,preview_shareable_link,campaign{name},creative{thumbnail_url,image_url,effective_instagram_media_id,call_to_action_type,object_story_id}",
        limit: 200,
      },
    }),
    getFacebook(period),
    getInstagram(),
  ]);

  const insightByCampaign = new Map(campaignRows.map((r) => [r.campaign_id, r]));
  const adStatus = new Map((adMeta.data ?? []).map((a) => [a.id, a.effective_status]));

  const campaigns = (campaignMeta.data ?? [])
    .filter((c) => c.effective_status === "ACTIVE" || insightByCampaign.has(c.id))
    .map((c) => {
      const budgets = (c.adsets?.data ?? []).map((a) => Number(a.daily_budget ?? 0)).filter((b) => b > 0);
      return {
        id: c.id,
        name: c.name,
        status: c.effective_status,
        dailyBudget: budgets.length ? budgets.reduce((a, b) => a + b, 0) / 100 : null,
        ...toMetrics(insightByCampaign.get(c.id) ?? {}),
      };
    });

  const t = (totalRows[0] ?? {}) as Row & { frequency?: string; inline_link_click_ctr?: string; cpc?: string; cpm?: string };
  const extras: AdExtras = {
    frequency: Number(t.frequency ?? 0),
    linkCtr: Number(t.inline_link_click_ctr ?? 0),
    cpc: Number(t.cpc ?? 0),
    cpm: Number(t.cpm ?? 0),
    landingPageViews: actionValue(t.actions, "landing_page_view"),
    engagements: actionValue(t.actions, "post_engagement"),
  };

  const adInsight = new Map(adRows.map((r) => [r.ad_id, r]));
  const allAds = (adMeta.data ?? []).slice(0, 30);

  // Totalen per advertentie sinds de start + de echte Instagram-post erachter.
  const [lifetimeRows, mediaById] = await Promise.all([
    meta
      .request<{ data?: (Row & { date_start?: string; date_stop?: string })[] }>(`/${adAccountPath()}/insights`, {
        query: { level: "ad", date_preset: "maximum", fields: `ad_id,${FIELDS}`, limit: 100 },
      })
      .then((r) => r.data ?? [])
      .catch(() => []),
    (async () => {
      const ids = [...new Set(allAds.map((a) => a.creative?.effective_instagram_media_id).filter(Boolean))] as string[];
      if (!ids.length) return {} as Record<string, IgMedia>;
      // Per post opvragen: het `ids`-batchveld is in nieuwere Graph-versies afgeschaft.
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const m = await meta.request<IgMedia>(`/${id}`, {
              query: {
                fields: "media_type,media_url,thumbnail_url,caption,like_count,comments_count,permalink,children{media_url,media_type,thumbnail_url}",
              },
            });
            return [id, m] as const;
          } catch {
            return null;
          }
        }),
      );
      return Object.fromEntries(entries.filter(Boolean) as (readonly [string, IgMedia])[]);
    })(),
  ]);
  const lifetimeById = new Map(lifetimeRows.map((r) => [r.ad_id, r]));

  // Instagram geeft voor de advertentie-kopie vaak maar één beeld; de
  // Facebook-post erachter heeft alle carrouselkaarten.
  const postImages = new Map<string, string[]>();
  const storyIds = [...new Set(allAds.map((a) => a.creative?.object_story_id).filter(Boolean))] as string[];
  const pageId = process.env.META_PAGE_ID;
  if (storyIds.length && pageId) {
    try {
      const { access_token: pageToken } = await meta.request<{ access_token?: string }>(`/${pageId}`, {
        query: { fields: "access_token" },
      });
      if (pageToken) {
        // Eén call per post: het `ids`-batchveld weigert Meta voor paginatokens.
        await Promise.all(
          storyIds.map(async (id) => {
            const r = await fetch(
              `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/${id}?` +
                new URLSearchParams({ fields: "full_picture,attachments{media{image{src}},subattachments{media{image{src}}}}" }),
              { headers: { authorization: `Bearer ${pageToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) },
            );
            if (r.ok) postImages.set(id, postImageList((await r.json()) as FbPost));
          }),
        );
      }
    } catch {
      // voorvertoning valt terug op het Instagram-beeld
    }
  }

  const cards: AdCard[] = allAds.map((a) => {
    const media = a.creative?.effective_instagram_media_id ? mediaById[a.creative.effective_instagram_media_id] : undefined;
    const fbImages = a.creative?.object_story_id ? (postImages.get(a.creative.object_story_id) ?? []) : [];
    const life = lifetimeById.get(a.id);
    return {
      id: a.id,
      name: a.name,
      campaign: a.campaign?.name ?? "",
      status: a.effective_status,
      previewLink: a.preview_shareable_link ?? null,
      preview: (() => {
        const igImages = media ? mediaImages(media) : [];
        const creativeImage = a.creative?.image_url ?? a.creative?.thumbnail_url;
        const images = fbImages.length > igImages.length ? fbImages : igImages.length ? igImages : creativeImage ? [creativeImage] : [];
        if (!images.length) return null;
        return {
          images,
          caption: media?.caption ?? "",
          likes: media?.like_count ?? 0,
          comments: media?.comments_count ?? 0,
          permalink: media?.permalink ?? null,
          cta: a.creative?.call_to_action_type ?? null,
        };
      })(),
      lifetime: { ...toMetrics(life ?? {}), start: life?.date_start ?? null, stop: life?.date_stop ?? null },
      ...toMetrics(adInsight.get(a.id) ?? {}),
    };
  });
  const { active: activeAds, past: pastAds } = splitAds(cards);

  return {
    total: toMetrics(totalRows[0] ?? {}),
    activeAds,
    pastAds,
    extras,
    facebook,
    instagram,
    campaigns,
    ads: adRows
      .map((r) => ({
        id: r.ad_id ?? "",
        name: r.ad_name ?? "",
        campaign: r.campaign_name ?? "",
        status: adStatus.get(r.ad_id ?? "") ?? "",
        ...toMetrics(r),
      }))
      .sort((a, b) => b.impressions - a.impressions),
    platforms: platformRows
      .map((r) => ({ platform: r.publisher_platform ?? "?", ...toMetrics(r) }))
      .sort((a, b) => b.impressions - a.impressions),
  };
}

/* ------------------------------------------------------------------ cache */

/** Hoe lang opgehaalde cijfers gedeeld worden tussen alle kijkers/tabbladen. */
export const LIVE_CACHE_MS = 60_000;

const liveCache = new Map<Period, { at: number; data: LiveStats }>();
const inflight = new Map<Period, Promise<LiveStats>>();

export type CachedLiveStats = { data: LiveStats | null; fetchedAt: number | null; error: string | null };

/**
 * Live-cijfers met een gedeelde cache van een minuut: alle open tabbladen en
 * gebruikers delen één ophaalronde, zodat we Meta's limiet per advertentie-
 * account niet raken. Weigert Meta (limiet/storing), dan de laatst bekende
 * cijfers mét foutmelding in plaats van een hangende pagina.
 */
export async function getLiveStatsCached(period: Period): Promise<CachedLiveStats> {
  const hit = liveCache.get(period);
  if (hit && Date.now() - hit.at < LIVE_CACHE_MS) return { data: hit.data, fetchedAt: hit.at, error: null };
  let p = inflight.get(period);
  if (!p) {
    p = getLiveStats(period).finally(() => inflight.delete(period));
    inflight.set(period, p);
  }
  try {
    const data = await p;
    const at = Date.now();
    liveCache.set(period, { at, data });
    return { data, fetchedAt: at, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: hit?.data ?? null, fetchedAt: hit?.at ?? null, error: msg };
  }
}
