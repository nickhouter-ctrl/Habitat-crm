// Google Business Profile — Performance (Business Profile Performance API).
// Toont profiel-interacties: gesprekken, routes, websiteklikken, chats,
// afspraken en vertoningen (Zoeken/Maps).
// Auth: dezelfde OAuth-credentials als Search Console / Analytics
// (refresh-token), met de extra scope business.manage.

const LOCATION = process.env.GBP_LOCATION_ID; // numeriek location-id, evt. met "locations/" prefix
const CLIENT_ID = process.env.SC_CLIENT_ID;
const CLIENT_SECRET = process.env.SC_CLIENT_SECRET;
const REFRESH = process.env.SC_REFRESH_TOKEN;

export function gbpConfigured(): boolean {
  return Boolean(LOCATION && CLIENT_ID && CLIENT_SECRET && REFRESH);
}

export type GbpTotals = {
  interactions: number; // calls + website + directions + conversations + bookings
  calls: number;
  websiteClicks: number;
  directions: number;
  conversations: number;
  bookings: number;
  impressionsSearch: number; // desktop + mobile (Zoeken)
  impressionsMaps: number; // desktop + mobile (Maps)
};
export type GbpRow = { label: string; value: number };
export type GbpData = {
  range: { start: string; end: string };
  totals: GbpTotals | null;
  prev: GbpTotals | null;
  trend: GbpRow[]; // interacties per dag (huidige periode)
};

const METRICS = [
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
] as const;
type Metric = (typeof METRICS)[number];

const INTERACTION_METRICS: Metric[] = [
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
];

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

type ApiDate = { year: number; month: number; day: number };
type DatedValue = { date?: ApiDate; value?: string };
type ApiResponse = {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric?: Metric;
      timeSeries?: { datedValues?: DatedValue[] };
    }[];
  }[];
};

const keyOf = (d?: ApiDate) =>
  d ? d.year * 10000 + d.month * 100 + d.day : 0;
const fmtDay = (k: number) => `${k % 100}/${Math.floor(k / 100) % 100}`; // "15/6"

function locationPath(): string {
  const raw = (LOCATION as string).trim();
  const id = raw.replace(/^locations\//, "");
  return `locations/${id}`;
}

export async function getBusinessProfileData(): Promise<GbpData> {
  const token = await accessToken();

  // GBP-data loopt ~2-3 dagen achter. Vraag 60 dagen op t/m gisteren en
  // splits client-side in huidige 30 dagen + vorige 30 dagen.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 59);
  const mid = new Date(end);
  mid.setUTCDate(mid.getUTCDate() - 29); // grens huidige periode

  const p = new URLSearchParams();
  for (const m of METRICS) p.append("dailyMetrics", m);
  p.set("dailyRange.startDate.year", String(start.getUTCFullYear()));
  p.set("dailyRange.startDate.month", String(start.getUTCMonth() + 1));
  p.set("dailyRange.startDate.day", String(start.getUTCDate()));
  p.set("dailyRange.endDate.year", String(end.getUTCFullYear()));
  p.set("dailyRange.endDate.month", String(end.getUTCMonth() + 1));
  p.set("dailyRange.endDate.day", String(end.getUTCDate()));

  const url = `https://businessprofileperformance.googleapis.com/v1/${locationPath()}:fetchMultiDailyMetricsTimeSeries?${p.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 403) {
    throw new Error(
      "Geen toegang (403) — het OAuth-token mist mogelijk de business.manage-scope, of de Business Profile Performance API heeft nog quota 0 (vraag GBP API-toegang aan).",
    );
  }
  if (res.status === 404) {
    throw new Error("Locatie niet gevonden (404) — controleer GBP_LOCATION_ID.");
  }
  if (!res.ok) throw new Error(`GBP-query mislukt (${res.status})`);

  const json = (await res.json()) as ApiResponse;

  // metric -> Map<dateKey, value>
  const series = new Map<Metric, Map<number, number>>();
  for (const m of METRICS) series.set(m, new Map());
  for (const multi of json.multiDailyMetricTimeSeries ?? []) {
    for (const dm of multi.dailyMetricTimeSeries ?? []) {
      const metric = dm.dailyMetric;
      if (!metric || !series.has(metric)) continue;
      const map = series.get(metric)!;
      for (const dv of dm.timeSeries?.datedValues ?? []) {
        map.set(keyOf(dv.date), Number(dv.value ?? 0));
      }
    }
  }

  const midKey = keyOf({
    year: mid.getUTCFullYear(),
    month: mid.getUTCMonth() + 1,
    day: mid.getUTCDate(),
  });
  const sum = (m: Metric, current: boolean) => {
    let acc = 0;
    for (const [k, v] of series.get(m)!) {
      if (current ? k >= midKey : k < midKey) acc += v;
    }
    return acc;
  };

  const build = (current: boolean): GbpTotals => {
    const calls = sum("CALL_CLICKS", current);
    const websiteClicks = sum("WEBSITE_CLICKS", current);
    const directions = sum("BUSINESS_DIRECTION_REQUESTS", current);
    const conversations = sum("BUSINESS_CONVERSATIONS", current);
    const bookings = sum("BUSINESS_BOOKINGS", current);
    const impressionsSearch =
      sum("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", current) +
      sum("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", current);
    const impressionsMaps =
      sum("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", current) +
      sum("BUSINESS_IMPRESSIONS_MOBILE_MAPS", current);
    return {
      interactions: calls + websiteClicks + directions + conversations + bookings,
      calls,
      websiteClicks,
      directions,
      conversations,
      bookings,
      impressionsSearch,
      impressionsMaps,
    };
  };

  // trend: interacties per dag in de huidige periode
  const dayTotals = new Map<number, number>();
  for (const m of INTERACTION_METRICS) {
    for (const [k, v] of series.get(m)!) {
      if (k >= midKey) dayTotals.set(k, (dayTotals.get(k) ?? 0) + v);
    }
  }
  const trend: GbpRow[] = [...dayTotals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => ({ label: fmtDay(k), value: v }));

  const cur = build(true);
  const prev = build(false);
  const empty = (t: GbpTotals) =>
    t.interactions === 0 && t.impressionsSearch === 0 && t.impressionsMaps === 0;

  return {
    range: { start: "30 dagen geleden", end: "gisteren" },
    totals: empty(cur) ? null : cur,
    prev: empty(prev) ? null : prev,
    trend,
  };
}
