/**
 * Live advertentiecijfers rechtstreeks uit de Meta Insights-API, voor de
 * pagina Marketing → Advertenties live. Geen opslag: elke paginaweergave
 * vraagt Meta opnieuw (Meta zelf loopt een paar minuten achter).
 */
import "server-only";

import { adAccountPath, meta } from "./client";
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

const PREVIEW_TTL_MS = 60 * 60 * 1000;
const previewCache = new Map<string, { src: string; until: number }>();

export type ActiveAd = Metrics & {
  id: string;
  name: string;
  campaign: string;
  status: string;
  thumbnail: string | null;
  previewLink: string | null;
  instagramUrl: string | null;
  /** iframe-src van Meta's eigen voorvertoning. */
  instagramPreview: string | null;
  facebookPreview: string | null;
};

export type LiveStats = {
  total: Metrics;
  activeAds: ActiveAd[];
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
        creative?: { thumbnail_url?: string; image_url?: string; instagram_permalink_url?: string };
      }[];
    }>(`/${adAccountPath()}/ads`, {
      query: {
        fields: "id,name,effective_status,preview_shareable_link,campaign{name},creative{thumbnail_url,image_url,instagram_permalink_url}",
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
  const previewSrc = async (adId: string, format: string): Promise<string | null> => {
    const key = `${adId}:${format}`;
    const hit = previewCache.get(key);
    if (hit && hit.until > Date.now()) return hit.src;
    try {
      const res = await meta.request<{ data?: { body?: string }[] }>(`/${adId}/previews`, { query: { ad_format: format } });
      const m = res.data?.[0]?.body?.match(/src="([^"]+)"/);
      const src = m ? m[1].replace(/&amp;/g, "&") : null;
      // Meta geeft elke call een nieuwe ondertekende URL; cachen voorkomt dat de
      // iframes bij elke auto-refresh (30 s) opnieuw laden.
      if (src) previewCache.set(key, { src, until: Date.now() + PREVIEW_TTL_MS });
      return src;
    } catch {
      return null;
    }
  };
  const activeAds: ActiveAd[] = await Promise.all(
    (adMeta.data ?? [])
      .filter((a) => a.effective_status === "ACTIVE" || a.effective_status === "PENDING_REVIEW" || a.effective_status === "IN_PROCESS")
      .slice(0, 8)
      .map(async (a) => {
        const [instagramPreview, facebookPreview] = await Promise.all([
          previewSrc(a.id, "INSTAGRAM_STANDARD"),
          previewSrc(a.id, "MOBILE_FEED_STANDARD"),
        ]);
        return {
          id: a.id,
          name: a.name,
          campaign: a.campaign?.name ?? "",
          status: a.effective_status,
          thumbnail: a.creative?.image_url ?? a.creative?.thumbnail_url ?? null,
          previewLink: a.preview_shareable_link ?? null,
          instagramUrl: a.creative?.instagram_permalink_url ?? null,
          instagramPreview,
          facebookPreview,
          ...toMetrics(adInsight.get(a.id) ?? {}),
        };
      }),
  );

  return {
    total: toMetrics(totalRows[0] ?? {}),
    activeAds,
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
