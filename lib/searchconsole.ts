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
export type ScTrend = { label: string; clicks: number; impressions: number; date?: string };
export type SeoData = {
  range: { start: string; end: string };
  granularity: "day" | "single";
  lagDays: number; // hoeveel dagen Search Console achterloopt
  totals: ScTotals | null;
  prev: ScTotals | null;
  trend: ScTrend[];
  queries: ScRow[];
  pages: ScRow[];
  opportunities: ScRow[];
  countries: ScRow[];
  devices: ScRow[];
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

/** Lees Google's eigenlijke foutreden uit de JSON-body (bv. bij 403). */
async function googleErrorReason(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; status?: string } };
    return j.error?.message?.trim() || j.error?.status || "";
  } catch {
    return "";
  }
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
  if (!res.ok) {
    const reason = await googleErrorReason(res);
    // 403 = het gekoppelde Google-account heeft geen toegang tot deze property,
    // of SC_SITE_URL komt niet exact overeen met een geverifieerde property.
    const hint =
      res.status === 403
        ? ` — controleer dat het gekoppelde Google-account toegang heeft tot "${SITE}" in Search Console, en dat SC_SITE_URL exact die property is (bv. "sc-domain:habitat-one.com" voor een domein-property, of "https://www.habitat-one.com/" mét https en trailing slash).`
        : "";
    throw new Error(`Search Console-query mislukt (${res.status})${reason ? `: ${reason}` : ""}${hint}`);
  }
  const json = (await res.json()) as { rows?: ScRow[] };
  return json.rows ?? [];
}

/**
 * Diagnose: geef de properties terug waar het gekoppelde account WÉL toegang toe
 * heeft. Handig om SC_SITE_URL mee te vergelijken bij een 403.
 */
export async function scAccessibleSites(): Promise<{ site: string; level: string }[]> {
  const token = await accessToken();
  const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kon de propertylijst niet ophalen (${res.status})`);
  const json = (await res.json()) as {
    siteEntry?: { siteUrl?: string; permissionLevel?: string }[];
  };
  return (json.siteEntry ?? []).map((s) => ({
    site: s.siteUrl ?? "",
    level: s.permissionLevel ?? "",
  }));
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

const LAG_DAYS = 3; // Search Console-data is doorgaans pas na ~3 dagen volledig.

export type SeoQuery = { days?: number; date?: string };

export async function getSeoData(opts: SeoQuery | number = {}): Promise<SeoData> {
  const q: SeoQuery = typeof opts === "number" ? { days: opts } : opts;
  const token = await accessToken();

  let cur: { startDate: string; endDate: string };
  let prevR: { startDate: string; endDate: string };
  const single = Boolean(q.date);

  if (single) {
    cur = { startDate: q.date as string, endDate: q.date as string };
    const d = new Date(`${q.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const prevDay = ymd(d);
    prevR = { startDate: prevDay, endDate: prevDay };
  } else {
    // SC-data loopt ~3 dagen achter; laatste N dagen + de N dagen ervoor.
    const days = q.days ?? 28;
    const end = new Date(Date.now() - LAG_DAYS * 86_400_000);
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    const prevEnd = new Date(start.getTime() - 86_400_000);
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
    cur = { startDate: ymd(start), endDate: ymd(end) };
    prevR = { startDate: ymd(prevStart), endDate: ymd(prevEnd) };
  }

  const [totals, prev, trendRows, queries, pages, countries, devices] = await Promise.all([
    query(token, { ...cur, dimensions: [], rowLimit: 1 }),
    query(token, { ...prevR, dimensions: [], rowLimit: 1 }),
    query(token, { ...cur, dimensions: ["date"], rowLimit: 100 }),
    query(token, { ...cur, dimensions: ["query"], rowLimit: 200 }),
    query(token, { ...cur, dimensions: ["page"], rowLimit: 100 }),
    query(token, { ...cur, dimensions: ["country"], rowLimit: 20 }),
    query(token, { ...cur, dimensions: ["device"], rowLimit: 5 }),
  ]);

  const opportunities = queries
    .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  return {
    range: { start: cur.startDate, end: cur.endDate },
    granularity: single ? "single" : "day",
    lagDays: LAG_DAYS,
    totals: toTotals(totals),
    prev: toTotals(prev),
    trend: trendRows
      .sort((a, b) => (a.keys?.[0] ?? "").localeCompare(b.keys?.[0] ?? ""))
      .map((r) => ({
        label: fmtDay(r.keys?.[0] ?? ""),
        clicks: r.clicks,
        impressions: r.impressions,
        date: r.keys?.[0] ?? "",
      })),
    queries: queries.slice(0, 50),
    pages: pages.slice(0, 50),
    opportunities,
    countries,
    devices,
  };
}
