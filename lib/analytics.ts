// Google Analytics 4 (GA Data API) ophalen voor het Analytics-dashboard.
// Auth: dezelfde OAuth-credentials als Search Console (refresh-token), maar het
// token moet óók de scope analytics.readonly hebben. Lichtgewicht: alleen fetch.

const PROPERTY = process.env.GA_PROPERTY_ID; // numeriek GA4 property-id (bv. 123456789)
const CLIENT_ID = process.env.SC_CLIENT_ID;
const CLIENT_SECRET = process.env.SC_CLIENT_SECRET;
const REFRESH = process.env.SC_REFRESH_TOKEN;

export function gaConfigured(): boolean {
  return Boolean(PROPERTY && CLIENT_ID && CLIENT_SECRET && REFRESH);
}

export type GaTotals = {
  users: number;
  sessions: number;
  views: number;
  engagementRate: number;
};
export type GaRow = { label: string; value: number };
export type GaData = {
  range: { start: string; end: string };
  totals: GaTotals | null;
  topPages: GaRow[];
  channels: GaRow[];
  countries: GaRow[];
};

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

async function runReport(token: string, body: Record<string, unknown>): Promise<GaReport> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (res.status === 403) {
    throw new Error(
      "Geen toegang (403) — waarschijnlijk mist het OAuth-token de analytics.readonly-scope. Opnieuw inloggen met de Analytics-scope erbij.",
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

export async function getAnalyticsData(): Promise<GaData> {
  const token = await accessToken();
  const dateRanges = [{ startDate: "28daysAgo", endDate: "yesterday" }]; // GA4 is near-realtime

  const [totalsRep, pagesRep, channelsRep, countriesRep] = await Promise.all([
    runReport(token, {
      dateRanges,
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
      ],
    }),
    runReport(token, {
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),
    runReport(token, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    runReport(token, {
      dateRanges,
      dimensions: [{ name: "country" }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 10,
    }),
  ]);

  const t = totalsRep.rows?.[0]?.metricValues;
  const totals: GaTotals | null = t
    ? {
        users: num(t[0]?.value),
        sessions: num(t[1]?.value),
        views: num(t[2]?.value),
        engagementRate: num(t[3]?.value),
      }
    : null;

  return {
    range: { start: "28 dagen geleden", end: "gisteren" },
    totals: totals && totals.users === 0 && totals.sessions === 0 ? null : totals,
    topPages: toRows(pagesRep),
    channels: toRows(channelsRep),
    countries: toRows(countriesRep),
  };
}

async function runRealtime(token: string, body: Record<string, unknown>): Promise<GaReport> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runRealtimeReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`GA4-realtime mislukt (${res.status})`);
  return (await res.json()) as GaReport;
}

export type GaRealtime = { activeUsers: number; byPage: GaRow[]; byCountry: GaRow[] };

export async function getRealtime(): Promise<GaRealtime> {
  const token = await accessToken();
  const [totalRep, pagesRep, countriesRep] = await Promise.all([
    runRealtime(token, { metrics: [{ name: "activeUsers" }] }),
    runRealtime(token, {
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
    }),
    runRealtime(token, {
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
    }),
  ]);
  return {
    activeUsers: num(totalRep.rows?.[0]?.metricValues?.[0]?.value),
    byPage: toRows(pagesRep),
    byCountry: toRows(countriesRep),
  };
}
