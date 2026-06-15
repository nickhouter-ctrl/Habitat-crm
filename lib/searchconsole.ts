// Search Console-data ophalen voor het SEO-dashboard.
// Auth: OAuth refresh-token (read-only) via env-variabelen. Alleen fetch.

const SITE = process.env.SC_SITE_URL;
const CLIENT_ID = process.env.SC_CLIENT_ID;
const CLIENT_SECRET = process.env.SC_CLIENT_SECRET;
const REFRESH = process.env.SC_REFRESH_TOKEN;

export function scConfigured(): boolean {
  return Boolean(SITE && CLIENT_ID && CLIENT_SECRET && REFRESH);
}

export type ScRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
export type ScTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type ScTrend = { label: string; clicks: number; impressions: number };
export type SeoData = {
  range: { start: string; end: string };
  totals: ScTotals | null;
  prev: ScTotals | null;
  trend: ScTrend[];
  queries: ScRow[];
  pages: ScRow[];
  opportunities: ScRow[];
  countries: ScRow[];
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

async function query(token: string, body: Record<string, unknown>): Promise<ScRow[]> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    SITE as string,
  )}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Search Console-query mislukt (${res.status})`);
  const json = (await res.json()) as { rows?: ScRow[] };
  return json.rows ?? [];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

function toTotals(rows: ScRow[]): ScTotals | null {
  const r = rows[0];
  if (!r) return null;
  return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

export async function getSeoData(): Promise<SeoData> {
  const token = await accessToken();
  // SC-data loopt ~3 dagen achter; laatste 28 dagen + de 28 dagen ervoor.
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 27 * 86_400_000);
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - 27 * 86_400_000);
  const cur = { startDate: ymd(start), endDate: ymd(end) };
  const prevR = { startDate: ymd(prevStart), endDate: ymd(prevEnd) };

  const [totals, prev, trendRows, queries, pages, countries] = await Promise.all([
    query(token, { ...cur, dimensions: [], rowLimit: 1 }),
    query(token, { ...prevR, dimensions: [], rowLimit: 1 }),
    query(token, { ...cur, dimensions: ["date"], rowLimit: 60 }),
    query(token, { ...cur, dimensions: ["query"], rowLimit: 100 }),
    query(token, { ...cur, dimensions: ["page"], rowLimit: 25 }),
    query(token, { ...cur, dimensions: ["country"], rowLimit: 10 }),
  ]);

  const opportunities = queries
    .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  return {
    range: { start: ymd(start), end: ymd(end) },
    totals: toTotals(totals),
    prev: toTotals(prev),
    trend: trendRows
      .sort((a, b) => (a.keys?.[0] ?? "").localeCompare(b.keys?.[0] ?? ""))
      .map((r) => ({ label: fmtDay(r.keys?.[0] ?? ""), clicks: r.clicks, impressions: r.impressions })),
    queries: queries.slice(0, 15),
    pages: pages.slice(0, 15),
    opportunities,
    countries,
  };
}
