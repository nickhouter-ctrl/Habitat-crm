/**
 * Facetten en de nachtelijke herbouw van `facet_performance` (brief §8).
 *
 * Het idee: elke creative heeft eigenschappen (facetten). Door prestaties
 * naar die facetten terug te rekenen zie je niet alleen wélke advertentie
 * werkte, maar waarom. De tien facetten: template, palette, format, locale,
 * copy_angle, product_category, asset_source, has_price_badge,
 * headline_length_bucket en audience_segment (§8c — zonder die laatste klopt
 * de rangorde niet).
 *
 * `facetsForSpec` is puur en getest; `rebuildFacetPerformance` doet de
 * database-join (90 dagen ad_metrics_daily → ads → specs → facetten) en
 * schrijft de tabel opnieuw. `getEditorSuggestion` leest er de best
 * presterende combinatie uit voor de voorinvulling in de editor — altijd
 * overschrijfbaar, nooit afgedwongen.
 */
import { eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  adMetricsDaily,
  ads,
  adSets,
  assets,
  creativeSpecs,
  facetPerformance,
  products,
} from "@/lib/db/schema";

import {
  empiricalBayesCpl,
  meetsVerdictThreshold,
  wilsonLowerBound,
} from "./stats";

/* ------------------------------------------------------------------ facetten */

/** Kop-lengteklassen voor het facet `headline_length_bucket`. */
export function headlineLengthBucket(length: number): "kort" | "middel" | "lang" {
  if (length <= 35) return "kort";
  if (length <= 60) return "middel";
  return "lang";
}

/** Alles wat nodig is om de facetten van één advertentie te bepalen. */
export interface FacetSource {
  template: string;
  palette: string;
  format: string;
  locale: string;
  copyAngle: string | null;
  productCategory: string | null;
  assetSource: string | null;
  badge: string | null;
  headline: string | null;
  audienceSegment: string | null;
}

export interface FacetValue {
  facet: string;
  value: string;
}

/**
 * De facetwaarden van één spec, in vaste volgorde. Onbekende (null) waarden
 * worden overgeslagen — een "null"-rij zou de rangorde vervuilen.
 */
export function facetsForSpec(source: FacetSource): FacetValue[] {
  const out: FacetValue[] = [];
  const push = (facet: string, value: string | null | undefined) => {
    if (value != null && value !== "") out.push({ facet, value });
  };
  push("template", source.template);
  push("palette", source.palette);
  push("format", source.format);
  push("locale", source.locale);
  push("copy_angle", source.copyAngle);
  push("product_category", source.productCategory);
  push("asset_source", source.assetSource);
  push("has_price_badge", source.badge ? "ja" : "nee");
  push("headline_length_bucket", source.headline ? headlineLengthBucket(source.headline.length) : null);
  push("audience_segment", source.audienceSegment);
  return out;
}

/* ------------------------------------------------------------------ rebuild */

export interface RebuildResult {
  facetRows: number;
  adsSeen: number;
  metricDays: number;
  accountCplEur: number | null;
}

/**
 * Herbouw `facet_performance` uit de laatste 90 dagen (brief §8):
 * ad_metrics_daily → ads → creative_specs (+ ad_sets, products, assets) →
 * aggregatie per facetwaarde → Wilson/EB/drempels → tabel vervangen.
 */
export async function rebuildFacetPerformance(): Promise<RebuildResult> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);

  const rows = await db
    .select({
      adId: adMetricsDaily.adId,
      impressions: adMetricsDaily.impressions,
      clicks: adMetricsDaily.clicks,
      spend: adMetricsDaily.spend,
      leads: adMetricsDaily.leads,
      template: creativeSpecs.template,
      palette: creativeSpecs.palette,
      format: creativeSpecs.format,
      locale: creativeSpecs.locale,
      copyAngle: creativeSpecs.copyAngle,
      badge: sql<string | null>`${creativeSpecs.copy} ->> 'badge'`,
      headline: sql<string | null>`${creativeSpecs.copy} ->> 'headline'`,
      productCategory: products.category,
      assetSource: assets.source,
      audienceSegment: adSets.audienceSegment,
    })
    .from(adMetricsDaily)
    .innerJoin(ads, eq(ads.id, adMetricsDaily.adId))
    .innerJoin(creativeSpecs, eq(creativeSpecs.id, ads.specId))
    .leftJoin(adSets, eq(adSets.id, ads.adSetId))
    .leftJoin(products, eq(products.id, creativeSpecs.productId))
    .leftJoin(assets, eq(assets.id, creativeSpecs.assetId))
    .where(gte(adMetricsDaily.date, sinceDate));

  interface Bucket {
    impressions: number;
    clicks: number;
    spend: number;
    leads: number;
    adIds: Set<string>;
    adDays: number;
  }
  const buckets = new Map<string, Bucket>();
  let totalSpend = 0;
  let totalLeads = 0;
  const adsSeen = new Set<string>();

  for (const row of rows) {
    adsSeen.add(row.adId);
    const spend = Number(row.spend ?? 0);
    totalSpend += spend;
    totalLeads += row.leads ?? 0;
    const facets = facetsForSpec(row);
    for (const { facet, value } of facets) {
      const key = `${facet}\u0000${value}`; // \u0000 kan niet in een facetwaarde voorkomen
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { impressions: 0, clicks: 0, spend: 0, leads: 0, adIds: new Set(), adDays: 0 };
        buckets.set(key, bucket);
      }
      bucket.impressions += row.impressions ?? 0;
      bucket.clicks += row.clicks ?? 0;
      bucket.spend += spend;
      bucket.leads += row.leads ?? 0;
      bucket.adIds.add(row.adId);
      bucket.adDays += 1; // één metricrij = één advertentie-dag
    }
  }

  const accountCpl = totalLeads > 0 ? totalSpend / totalLeads : null;

  const values = [...buckets.entries()].map(([key, b]) => {
    const [facet, value] = key.split("\u0000");
    return {
      facet,
      value,
      impressions: b.impressions,
      clicks: b.clicks,
      spend: b.spend.toFixed(2),
      leads: b.leads,
      adCount: b.adIds.size,
      adDays: b.adDays,
      ctrWilsonLower: wilsonLowerBound(b.clicks, b.impressions).toFixed(6),
      cplEbEur:
        accountCpl != null ? empiricalBayesCpl(b.spend, b.leads, accountCpl).toFixed(2) : null,
      meetsThreshold: meetsVerdictThreshold(b.impressions, b.adDays),
      computedAt: new Date(),
    };
  });

  // Nachtelijke herbouw: de tabel is volledig afgeleid, dus vervangen in één
  // transactie — lezers zien nooit een half-gevulde tabel.
  await db.transaction(async (tx) => {
    await tx.delete(facetPerformance);
    if (values.length > 0) await tx.insert(facetPerformance).values(values);
  });

  return {
    facetRows: values.length,
    adsSeen: adsSeen.size,
    metricDays: rows.length,
    accountCplEur: accountCpl,
  };
}

/* -------------------------------------------------------- editor-suggestie */

export interface EditorSuggestion {
  template?: string;
  palette?: string;
  copyAngle?: string;
  /** De reden in gewone taal — de gebruiker mag altijd afwijken. */
  reason: string;
}

/**
 * Best presterende combinatie voor de voorinvulling in de editor (brief §8):
 * per facet (sjabloon, palet, invalshoek) de waarde met de hoogste Wilson
 * lower bound, alléén boven de oordeeldrempel. Geeft null zonder bruikbare
 * data — dan houdt de editor zijn gewone defaults.
 */
export async function getEditorSuggestion(): Promise<EditorSuggestion | null> {
  const rows = await db
    .select()
    .from(facetPerformance)
    .where(eq(facetPerformance.meetsThreshold, true));
  if (rows.length === 0) return null;

  const bestFor = (facet: string) =>
    rows
      .filter((r) => r.facet === facet)
      .sort((a, b) => Number(b.ctrWilsonLower ?? 0) - Number(a.ctrWilsonLower ?? 0))[0];

  const template = bestFor("template");
  const palette = bestFor("palette");
  const angle = bestFor("copy_angle");
  if (!template && !palette && !angle) return null;

  const parts: string[] = [];
  const pct = (v: string | null) => `${(Number(v ?? 0) * 100).toFixed(1).replace(".", ",")}%`;
  if (template) {
    parts.push(
      `sjabloon '${template.value}' haalt een CTR van minstens ${pct(template.ctrWilsonLower)} (${template.adCount} advertenties, ${template.adDays} advertentie-dagen)`,
    );
  }
  if (palette) parts.push(`palet '${palette.value}' scoort het best`);
  if (angle) parts.push(`invalshoek '${angle.value}' werkt het best`);

  return {
    template: template?.value,
    palette: palette?.value,
    copyAngle: angle?.value,
    reason: `Voorgeselecteerd op basis van 90 dagen advertentiedata: ${parts.join("; ")}. Altijd overschrijfbaar.`,
  };
}
