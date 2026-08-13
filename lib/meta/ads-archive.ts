/**
 * Concurrentiemonitor — fase 5 (brief §8b). Geen scraping: de DSA verplicht
 * Meta om elke EU-advertentie ±12 maanden publiek te archiveren, inclusief
 * bereik. Deze module leest dat officiële `ads_archive`-endpoint.
 *
 * Spelregels (brief, "Verboden en toegestaan"):
 *  - `ad_snapshot_url` wordt als VERWIJZING opgeslagen — we downloaden nooit
 *    beelden of video's van concurrenten naar onze Storage.
 *  - Tekstvelden (bodies/titles) zijn feitelijke onderzoeksdata uit de API en
 *    worden bewaard, maar nooit hergebruikt in eigen creatives.
 *  - Het signaal dat telt is LOOPTIJD: niemand laat een verliesgevende
 *    advertentie zestig dagen staan.
 *
 * Token: aparte developer-app met identiteitsverificatie; verloopt ±60 dagen.
 * {@link fetchArchiveTokenExpiry} + {@link tokenExpiryWarning} maken daar een
 * zichtbare waarschuwing van in plaats van een stille storing.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { competitorAds, competitors, type Competitor } from "@/lib/db/schema";

const GRAPH_BASE = "https://graph.facebook.com";
const MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------- typen */

/** Eén advertentie uit het `ads_archive`-endpoint (alleen gebruikte velden). */
export interface ArchiveAd {
  id: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  languages?: string[];
  eu_total_reach?: number;
  age_country_gender_reach_breakdown?: unknown;
}

/** Rij-vorm voor upsert in `competitor_ads` (zonder first/last_seen — dat
 *  beslist de upsert: nieuw = beide nu, bestaand = alleen last_seen). */
export interface MappedArchiveAd {
  competitorId: string;
  metaAdArchiveId: string;
  deliveryStart: Date | null;
  deliveryStop: Date | null;
  bodies: string[] | null;
  titles: string[] | null;
  languages: string[];
  platforms: string[];
  euTotalReach: number | null;
  reachBreakdown: unknown;
  snapshotUrl: string | null;
  daysRunning: number | null;
}

/** Minimale ad-vorm die de dashboard-aggregatie nodig heeft. */
export interface CompetitorAdLike {
  metaAdArchiveId: string;
  deliveryStart: Date | null;
  deliveryStop: Date | null;
  daysRunning: number | null;
  languages: string[] | null;
  platforms: string[] | null;
  euTotalReach: number | null;
  bodies: string[] | null;
  titles: string[] | null;
  snapshotUrl: string | null;
}

/* ------------------------------------------------------------ pure helpers */

/**
 * Looptijd in dagen — dé proxy voor winstgevendheid van buitenaf. Lopende
 * advertenties tellen tot `now`; een advertentie van vandaag telt als 1 dag.
 */
export function daysRunning(start: Date | null, stop: Date | null, now: Date): number | null {
  if (!start) return null;
  const end = stop ?? now;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Archief-advertentie → onze rij-vorm (puur, testbaar). */
export function mapArchiveAd(competitorId: string, ad: ArchiveAd, now: Date): MappedArchiveAd {
  const deliveryStart = parseDate(ad.ad_delivery_start_time);
  const deliveryStop = parseDate(ad.ad_delivery_stop_time);
  return {
    competitorId,
    metaAdArchiveId: ad.id,
    deliveryStart,
    deliveryStop,
    bodies: ad.ad_creative_bodies ?? null,
    titles: ad.ad_creative_link_titles ?? null,
    languages: ad.languages ?? [],
    platforms: ad.publisher_platforms ?? [],
    euTotalReach: typeof ad.eu_total_reach === "number" ? ad.eu_total_reach : null,
    reachBreakdown: ad.age_country_gender_reach_breakdown ?? null,
    snapshotUrl: ad.ad_snapshot_url ?? null,
    daysRunning: daysRunning(deliveryStart, deliveryStop, now),
  };
}

/**
 * NL-waarschuwing als het archief-token binnen 14 dagen verloopt (of al
 * verlopen is) — de verloopwaarschuwing uit de brief, i.p.v. stille storing.
 */
export function tokenExpiryWarning(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;
  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft < 0) {
    return "Het Ad Library-token is verlopen: de wekelijkse concurrentie-sync staat stil. Vernieuw META_ADS_ARCHIVE_TOKEN (developer-app → token genereren).";
  }
  if (daysLeft <= 14) {
    return `Het Ad Library-token verloopt over ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"}. Vernieuw META_ADS_ARCHIVE_TOKEN op tijd (developer-app → token genereren).`;
  }
  return null;
}

/** Dashboard-samenvatting per concurrent (brief §8b, "Bereken en toon"). */
export interface CompetitorSummary {
  /** Advertenties ≥ 30 dagen, langste eerst — de kern van het dashboard. */
  longRunners: CompetitorAdLike[];
  /** Aantal advertenties per taal (een ad kan meerdere talen hebben). */
  languageSplit: Record<string, number>;
  /** Aantal advertenties per platform. */
  platformSplit: Record<string, number>;
  /** Nieuwe advertenties per maand (laatste 6 maanden, oplopend). */
  inflowByMonth: Array<{ month: string; count: number }>;
  /** Som van eu_total_reach — ruwe indicatie van budget. */
  totalReach: number;
}

/** Aggregatie voor het dashboard (puur, testbaar). */
export function summarizeCompetitorAds(rows: CompetitorAdLike[], now: Date): CompetitorSummary {
  const longRunners = rows
    .filter((r) => (r.daysRunning ?? 0) >= 30)
    .sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0));

  const languageSplit: Record<string, number> = {};
  const platformSplit: Record<string, number> = {};
  for (const row of rows) {
    for (const lang of row.languages ?? []) {
      languageSplit[lang] = (languageSplit[lang] ?? 0) + 1;
    }
    for (const platform of row.platforms ?? []) {
      platformSplit[platform] = (platformSplit[platform] ?? 0) + 1;
    }
  }

  const months: Array<{ month: string; count: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      count: 0,
    });
  }
  for (const row of rows) {
    if (!row.deliveryStart) continue;
    const key = `${row.deliveryStart.getUTCFullYear()}-${String(row.deliveryStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((m) => m.month === key);
    if (bucket) bucket.count++;
  }

  return {
    longRunners,
    languageSplit,
    platformSplit,
    inflowByMonth: months,
    totalReach: rows.reduce((sum, r) => sum + (r.euTotalReach ?? 0), 0),
  };
}

/* -------------------------------------------------------------- API-toegang */

function archiveToken(): string {
  const token = process.env.META_ADS_ARCHIVE_TOKEN;
  if (!token) {
    throw new Error("META_ADS_ARCHIVE_TOKEN is niet ingesteld (zie .env.example).");
  }
  return token;
}

async function archiveGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${process.env.META_GRAPH_VERSION ?? "v23.0"}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${archiveToken()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Ad Library API: ${msg}`);
  }
  return data as T;
}

const ARCHIVE_FIELDS = [
  "id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_snapshot_url",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "languages",
  "eu_total_reach",
  "age_country_gender_reach_breakdown",
].join(",");

/** Alle archief-advertenties van één pagina (ES-bereik, gepagineerd). */
export async function fetchArchiveAds(metaPageId: string): Promise<ArchiveAd[]> {
  const all: ArchiveAd[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await archiveGet<{
      data?: ArchiveAd[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/ads_archive", {
      ad_reached_countries: JSON.stringify(["ES"]),
      search_page_ids: JSON.stringify([metaPageId]),
      ad_active_status: "ALL",
      fields: ARCHIVE_FIELDS,
      limit: "100",
      ...(after ? { after } : {}),
    });
    all.push(...(res.data ?? []));
    after = res.paging?.cursors?.after;
    if (!res.paging?.next || !after) break;
  }
  return all;
}

/** Verloopdatum van het archief-token via /debug_token (null = onbekend). */
export async function fetchArchiveTokenExpiry(): Promise<Date | null> {
  try {
    const res = await archiveGet<{ data?: { expires_at?: number } }>("/debug_token", {
      input_token: archiveToken(),
    });
    const ts = res.data?.expires_at;
    // 0 = een token zonder vervaldatum (bv. langlevend systeemtoken).
    return ts && ts > 0 ? new Date(ts * 1000) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- sync */

/** Uitkomst van één wekelijkse pull. */
export interface CompetitorSyncResult {
  competitors: number;
  newAds: number;
  updatedAds: number;
  /** NL-fouten per concurrent — zichtbaar in de respons, geen stille storing. */
  errors: string[];
  /** Verloopwaarschuwing voor het token, als die er is. */
  tokenWarning: string | null;
}

/**
 * Wekelijkse pull (brief §8b): per concurrent het archief ophalen en
 * upserten. Nieuwe advertenties worden gemarkeerd (first_seen = nu); een
 * advertentie die stopt krijgt `delivery_stop` en VERDWIJNT NIET — ook als
 * het archief hem later niet meer teruggeeft blijft de rij staan.
 */
export async function runCompetitorSync(now = new Date()): Promise<CompetitorSyncResult> {
  const result: CompetitorSyncResult = {
    competitors: 0,
    newAds: 0,
    updatedAds: 0,
    errors: [],
    tokenWarning: tokenExpiryWarning(await fetchArchiveTokenExpiry(), now),
  };

  const allCompetitors: Competitor[] = await db.select().from(competitors);
  for (const competitor of allCompetitors) {
    try {
      const archiveAds = await fetchArchiveAds(competitor.metaPageId);
      const existing = await db
        .select({ id: competitorAds.id, metaAdArchiveId: competitorAds.metaAdArchiveId })
        .from(competitorAds)
        .where(eq(competitorAds.competitorId, competitor.id));
      const existingByArchiveId = new Map(existing.map((r) => [r.metaAdArchiveId, r.id]));

      for (const ad of archiveAds) {
        const mapped = mapArchiveAd(competitor.id, ad, now);
        const existingId = existingByArchiveId.get(ad.id);
        if (existingId) {
          // Bestaand: status/teksten/bereik verversen + last_seen bijwerken.
          await db
            .update(competitorAds)
            .set({
              deliveryStart: mapped.deliveryStart,
              deliveryStop: mapped.deliveryStop,
              bodies: mapped.bodies,
              titles: mapped.titles,
              languages: mapped.languages,
              platforms: mapped.platforms,
              euTotalReach: mapped.euTotalReach,
              reachBreakdown: mapped.reachBreakdown,
              snapshotUrl: mapped.snapshotUrl,
              daysRunning: mapped.daysRunning,
              lastSeen: now,
            })
            .where(eq(competitorAds.id, existingId));
          result.updatedAds++;
        } else {
          await db.insert(competitorAds).values({
            ...mapped,
            reachBreakdown: mapped.reachBreakdown ?? null,
            firstSeen: now,
            lastSeen: now,
          });
          result.newAds++;
        }
      }
      result.competitors++;
    } catch (err) {
      result.errors.push(
        `${competitor.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
