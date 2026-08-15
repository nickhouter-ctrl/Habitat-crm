/**
 * AI-carrouselbouwer: /marketing/creatives/carousel. Kies 2–10 beelden, laat
 * de AI de verhaalvolgorde en alle teksten schrijven, en maak de kaartjes als
 * conceptset aan. Formaat staat vast op 1080×1080 — dat toont Meta voor
 * carrouselkaartjes op alle plekken.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { PageHeader } from "@/components/ui";
import { CarouselBuilder } from "@/components/marketing/creatives/carousel-builder";
import type { PickerAsset } from "@/components/marketing/creatives/asset-picker-modal";
import { TEMPLATES, TEMPLATE_NAMES, type CopyLimits, type TemplateName } from "@/lib/creatives/templates";
import { PALETTE_NAMES } from "@/lib/creatives/tokens";
import { db } from "@/lib/db";
import { assets, products } from "@/lib/db/schema";
import { aiCreativeCopyConfigured } from "@/lib/marketing/ai-copy";
import { marketingStorage } from "@/lib/marketing/storage";
import { subcategoryForFamily } from "@/lib/marketing/taxonomy";

export const metadata = { title: "Carrousel met AI" };

function safeUrl(path: string): string | null {
  try {
    return marketingStorage().publicUrl(path);
  } catch {
    return null;
  }
}

export default async function CarouselBuilderPage() {
  const [assetRows, igAgg] = await Promise.all([
    db
      .select({
        id: assets.id,
        storagePath: assets.storagePath,
        sourceRef: assets.sourceRef,
        productId: assets.productId,
        source: assets.source,
        tags: assets.tags,
        igReach: sql<string | null>`${assets.igMetrics} ->> 'reach'`,
        productName: products.name,
        productFamily: products.category,
      })
      .from(assets)
      .leftJoin(products, eq(products.id, assets.productId))
      .where(eq(assets.mediaType, "image"))
      .orderBy(desc(assets.createdAt))
      .limit(500),
    db
      .select({
        avgReach: sql<string | null>`avg((${assets.igMetrics} ->> 'reach')::numeric)`,
      })
      .from(assets)
      .where(and(sql`${assets.igMetrics} ->> 'reach' is not null`)),
  ]);

  const avgReach = igAgg[0]?.avgReach ? Number(igAgg[0].avgReach) : null;

  const pickerAssets: PickerAsset[] = assetRows.map((a) => ({
    id: a.id,
    url: safeUrl(a.storagePath),
    label: a.productName ?? a.sourceRef ?? "Beeld zonder naam",
    productId: a.productId,
    category: a.productFamily ? subcategoryForFamily(a.productFamily) : null,
    source: a.source,
    tags: a.tags ?? [],
    organicStrong: avgReach != null && a.igReach != null && Number(a.igReach) > avgReach,
  }));

  const limitsByTemplate = Object.fromEntries(
    TEMPLATE_NAMES.map((name) => [name, TEMPLATES[name].limits["1080x1080"]]),
  ) as Record<TemplateName, CopyLimits>;

  return (
    <>
      <PageHeader
        title="Carrousel met AI"
        subtitle="Kies je beelden — de AI bepaalt de sterkste verhaalvolgorde en schrijft per kaartje teksten die op elkaar doorlopen."
      />
      <CarouselBuilder
        assets={pickerAssets}
        templates={TEMPLATE_NAMES.map((name) => ({ name, label: TEMPLATES[name].label }))}
        palettes={[...PALETTE_NAMES]}
        limitsByTemplate={limitsByTemplate}
        aiEnabled={aiCreativeCopyConfigured()}
      />
    </>
  );
}
