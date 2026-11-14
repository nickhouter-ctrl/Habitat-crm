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

export type LiveStats = {
  total: Metrics;
  campaigns: (Metrics & { id: string; name: string; status: string; dailyBudget: number | null })[];
  ads: (Metrics & { id: string; name: string; campaign: string; status: string })[];
  platforms: (Metrics & { platform: string })[];
  followers: number | null;
};

export async function getLiveStats(period: Period): Promise<LiveStats> {
  const [totalRows, campaignRows, adRows, platformRows, campaignMeta, adMeta] = await Promise.all([
    insights(period, { fields: FIELDS }),
    insights(period, { level: "campaign", fields: `campaign_id,campaign_name,${FIELDS}` }),
    insights(period, { level: "ad", fields: `ad_id,ad_name,campaign_name,${FIELDS}` }),
    insights(period, { fields: FIELDS, breakdowns: "publisher_platform" }),
    meta.request<{ data?: { id: string; name: string; effective_status: string; adsets?: { data?: { daily_budget?: string }[] } }[] }>(
      `/${adAccountPath()}/campaigns`,
      { query: { fields: "id,name,effective_status,adsets{daily_budget}", limit: 50 } },
    ),
    meta.request<{ data?: { id: string; effective_status: string }[] }>(`/${adAccountPath()}/ads`, {
      query: { fields: "id,effective_status", limit: 200 },
    }),
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

  let followers: number | null = null;
  const igId = process.env.META_IG_ACCOUNT_ID;
  if (igId) {
    try {
      followers =
        (await meta.request<{ followers_count?: number }>(`/${igId}`, { query: { fields: "followers_count" } }))
          .followers_count ?? null;
    } catch {
      followers = null;
    }
  }

  return {
    total: toMetrics(totalRows[0] ?? {}),
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
    followers,
  };
}
