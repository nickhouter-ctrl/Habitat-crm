// Google Analytics 4 (GA Data API) ophalen voor het Analytics-dashboard.
// Auth: dezelfde OAuth-credentials als Search Console (refresh-token) met de
// scope analytics.readonly. Lichtgewicht: alleen fetch.

const PROPERTY = process.env.GA_PROPERTY_ID; // numeriek GA4 property-id
const CLIENT_ID = process.env.SC_CLIENT_ID;
const CLIENT_SECRET = process.env.SC_CLIENT_SECRET;
const REFRESH = process.env.SC_REFRESH_TOKEN;

export function gaConfigured(): boolean {
  return Boolean(PROPERTY && CLIENT_ID && CLIENT_SECRET && REFRESH);
}

export type GaTotals = {
  users: number;
  newUsers: number;
  sessions: number;
  views: number;
  avgSessionDuration: number; // seconden
  engagementRate: number;
};
export type GaRow = { label: string; value: number; date?: string };
export type GaLeads = {
  generateLead: number;
  contactClick: number;
  prevGenerateLead: number;
  byMethod: GaRow[]; // niet beschikbaar zonder custom dimension — blijft leeg, gereserveerd
};
export type GaData = {
  range: { start: string; end: string };
  granularity: "day" | "hour"; // "hour" = enkele-dag-weergave (grafiek per uur)
  totals: GaTotals | null;
  prev: GaTotals | null;
  trend: GaRow[];
  topPages: GaRow[];
  landingPages: GaRow[];
  channels: GaRow[];
  sources: GaRow[];
  countries: GaRow[];
  cities: GaRow[];
  newVsReturning: GaRow[];
  devices: GaRow[];
  browsers: GaRow[];
  operatingSystems: GaRow[];
  languages: GaRow[];
  events: GaRow[];
  campaigns: GaRow[];
  byHour: GaRow[];
  leads: GaLeads;
  leadsTrend: GaRow[];
  engagement: { bounceRate: number; engagedSessions: number; viewsPerSession: number };
};
export type GaRealtime = { activeUsers: number; byPage: GaRow[]; byCountry: GaRow[]; byCity: GaRow[] };

type GaReport = {
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
};

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID as string,
      client_secret: CLIENT_SECRET as string,
      refresh_token: REFRESH as string,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OAuth-token mislukt (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Geen access_token ontvangen");
  return json.access_token;
}

async function ga(token: string, method: "runReport" | "runRealtimeReport", body: Record<string, unknown>): Promise<GaReport> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:${method}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (res.status === 403) {
    throw new Error(
      "Geen toegang (403) — het OAuth-token mist mogelijk de analytics.readonly-scope, of de Analytics Data API staat uit.",
    );
  }
  if (!res.ok) throw new Error(`GA4-query mislukt (${res.status})`);
  return (await res.json()) as GaReport;
}

const num = (v?: string) => Number(v ?? 0);

function toRows(rep: GaReport): GaRow[] {
  return (rep.rows ?? []).map((r) => ({
    label: r.dimensionValues?.[0]?.value ?? "",
    value: num(r.metricValues?.[0]?.value),
  }));
}

const TOTAL_METRICS = [
  { name: "totalUsers" },
  { name: "newUsers" },
  { name: "sessions" },
  { name: "screenPageViews" },
  { name: "averageSessionDuration" },
  { name: "engagementRate" },
];

function parseTotals(rep: GaReport): GaTotals | null {
  const m = rep.rows?.[0]?.metricValues;
  if (!m) return null;
  const t: GaTotals = {
    users: num(m[0]?.value),
    newUsers: num(m[1]?.value),
    sessions: num(m[2]?.value),
    views: num(m[3]?.value),
    avgSessionDuration: num(m[4]?.value),
    engagementRate: num(m[5]?.value),
  };
  return t.users === 0 && t.sessions === 0 && t.views === 0 ? null : t;
}

function fmtDay(yyyymmdd: string): string {
  // "20260615" -> "15/6"
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${Number(yyyymmdd.slice(6, 8))}/${Number(yyyymmdd.slice(4, 6))}`;
}
const isoDay = (yyyymmdd: string) =>
  yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : yyyymmdd;

// Vorige dag van een datum-spec ("today" -> "yesterday", "2026-06-15" -> "2026-06-14").
function prevDayOf(spec: string): string {
  if (spec === "today") return "yesterday";
  if (spec === "yesterday") return "2daysAgo";
  const d = new Date(`${spec}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function dayLabel(spec: string): string {
  if (spec === "today") return "vandaag";
  if (spec === "yesterday") return "gisteren";
  const [y, m, d] = spec.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

export type GaQuery = { days?: number; date?: string };

export async function getAnalyticsData(opts: GaQuery | number = {}): Promise<GaData> {
  const q: GaQuery = typeof opts === "number" ? { days: opts } : opts;
  const single = Boolean(q.date);
  const days = q.days ?? 28;
  const token = await accessToken();

  // cur = de getoonde periode; prevRange = de even lange periode ervoor (voor vergelijking).
  const cur = single
    ? [{ startDate: q.date as string, endDate: q.date as string }]
    : [{ startDate: `${days}daysAgo`, endDate: "yesterday" }];
  const prevRange = single
    ? [{ startDate: prevDayOf(q.date as string), endDate: prevDayOf(q.date as string) }]
    : [{ startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }];
  // Meerdaags: grafiek per dag t/m vandaag (intraday). Enkele dag: grafiek per uur.
  const trendRange = single ? cur : [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const trendReport = single
    ? {
        dateRanges: trendRange,
        dimensions: [{ name: "hour" }],
        metrics: [{ name: "totalUsers" }],
        orderBys: [{ dimension: { dimensionName: "hour" } }],
      }
    : {
        dateRanges: trendRange,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "totalUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      };

  const top = (dim: string, metric: string, limit = 8) => ({
    dateRanges: cur,
    dimensions: [{ name: dim }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
  });

  // Leads: tel de conversie-events (generate_lead, contact_click) in beide periodes.
  const leadFilter = {
    filter: { fieldName: "eventName", inListFilter: { values: ["generate_lead", "contact_click"] } },
  };
  const leadQuery = (range: typeof cur) => ({
    dateRanges: range,
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: leadFilter,
  });

  const [
    totalsR, prevR, trendR, pagesR, landingR, channelsR, sourcesR,
    countriesR, citiesR, nvrR, devicesR, eventsR, leadsCurR, leadsPrevR,
  ] = await Promise.all([
    ga(token, "runReport", { dateRanges: cur, metrics: TOTAL_METRICS }),
    ga(token, "runReport", { dateRanges: prevRange, metrics: TOTAL_METRICS }),
    ga(token, "runReport", trendReport),
    ga(token, "runReport", top("pagePath", "screenPageViews", 12)),
    ga(token, "runReport", top("landingPage", "sessions", 10)),
    ga(token, "runReport", top("sessionDefaultChannelGroup", "sessions", 8)),
    ga(token, "runReport", top("sessionSourceMedium", "sessions", 8)),
    ga(token, "runReport", top("country", "totalUsers", 12)),
    ga(token, "runReport", top("city", "totalUsers", 10)),
    ga(token, "runReport", { dateRanges: cur, dimensions: [{ name: "newVsReturning" }], metrics: [{ name: "totalUsers" }] }),
    ga(token, "runReport", top("deviceCategory", "totalUsers", 5)),
    ga(token, "runReport", top("eventName", "eventCount", 12)),
    ga(token, "runReport", leadQuery(cur)),
    ga(token, "runReport", leadQuery(prevRange)),
  ]);

  const leadCount = (rep: GaReport, name: string) =>
    num((rep.rows ?? []).find((r) => r.dimensionValues?.[0]?.value === name)?.metricValues?.[0]?.value);

  // Tweede batch: engagement, leads-per-dag, campagnes, uur-activiteit, tech, taal.
  const [engR, leadsTrendR, campaignsR, hourR, browserR, osR, langR] = await Promise.all([
    ga(token, "runReport", {
      dateRanges: cur,
      metrics: [{ name: "bounceRate" }, { name: "engagedSessions" }, { name: "screenPageViewsPerSession" }],
    }),
    ga(token, "runReport", {
      dateRanges: cur,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "generate_lead" } } },
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    ga(token, "runReport", top("sessionCampaignName", "sessions", 8)),
    ga(token, "runReport", {
      dateRanges: cur,
      dimensions: [{ name: "hour" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "hour" } }],
    }),
    ga(token, "runReport", top("browser", "totalUsers", 6)),
    ga(token, "runReport", top("operatingSystem", "totalUsers", 6)),
    ga(token, "runReport", top("language", "totalUsers", 8)),
  ]);

  const engM = engR.rows?.[0]?.metricValues;

  return {
    range: single
      ? { start: dayLabel(q.date as string), end: dayLabel(q.date as string) }
      : { start: `${days} dagen geleden`, end: "vandaag" },
    granularity: single ? "hour" : "day",
    totals: parseTotals(totalsR),
    prev: parseTotals(prevR),
    trend: (trendR.rows ?? []).map((r) => {
      const v = r.dimensionValues?.[0]?.value ?? "";
      return single
        ? { label: `${Number(v)}u`, value: num(r.metricValues?.[0]?.value) }
        : { label: fmtDay(v), value: num(r.metricValues?.[0]?.value), date: isoDay(v) };
    }),
    topPages: toRows(pagesR),
    landingPages: toRows(landingR),
    channels: toRows(channelsR),
    sources: toRows(sourcesR),
    countries: toRows(countriesR),
    cities: toRows(citiesR),
    newVsReturning: toRows(nvrR),
    devices: toRows(devicesR),
    browsers: toRows(browserR),
    operatingSystems: toRows(osR),
    languages: toRows(langR),
    events: toRows(eventsR),
    campaigns: toRows(campaignsR),
    byHour: (hourR.rows ?? []).map((r) => ({
      label: `${Number(r.dimensionValues?.[0]?.value ?? 0)}u`,
      value: num(r.metricValues?.[0]?.value),
    })),
    leads: {
      generateLead: leadCount(leadsCurR, "generate_lead"),
      contactClick: leadCount(leadsCurR, "contact_click"),
      prevGenerateLead: leadCount(leadsPrevR, "generate_lead"),
      byMethod: [],
    },
    leadsTrend: (leadsTrendR.rows ?? []).map((r) => ({
      label: fmtDay(r.dimensionValues?.[0]?.value ?? ""),
      value: num(r.metricValues?.[0]?.value),
    })),
    engagement: {
      bounceRate: num(engM?.[0]?.value),
      engagedSessions: num(engM?.[1]?.value),
      viewsPerSession: num(engM?.[2]?.value),
    },
  };
}

export async function getRealtime(): Promise<GaRealtime> {
  const token = await accessToken();
  const [totalRep, pagesRep, countriesRep, citiesRep] = await Promise.all([
    ga(token, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] }),
    ga(token, "runRealtimeReport", {
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
    }),
    ga(token, "runRealtimeReport", {
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
    }),
    ga(token, "runRealtimeReport", {
      dimensions: [{ name: "city" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
    }),
  ]);
  return {
    activeUsers: num(totalRep.rows?.[0]?.metricValues?.[0]?.value),
    byPage: toRows(pagesRep),
    byCountry: toRows(countriesRep),
    byCity: toRows(citiesRep),
  };
}
