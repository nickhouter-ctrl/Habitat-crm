/**
 * Editor voor een nieuwe creative (brief §7): /marketing/creatives/new.
 * Met ?assetId= komt het beeld uit de bibliotheek voorgeselecteerd; met
 * ?from= wordt een bestaande spec gedupliceerd ("Dupliceer en pas aan", §3.5).
 * De leerlaag (§8) levert de voorselectie van sjabloon/palet/invalshoek —
 * altijd overschrijfbaar, met de reden in gewone taal erbij. Categorieën
 * volgen de menutaxonomie (lib/marketing/taxonomy.ts), niet de families uit
 * `products.category`.
 */
import { desc, eq, sql } from "drizzle-orm";

import { PageHeader } from "@/components/ui";
import {
  CreativeEditor,
  type EditorAsset,
  type EditorInitial,
} from "@/components/marketing/creatives/creative-editor";
import type { TemplateName } from "@/lib/creatives/templates";
import type { FormatName, PaletteName } from "@/lib/creatives/tokens";
import { db } from "@/lib/db";
import { assets, copyBlocks, creativeSpecs, products } from "@/lib/db/schema";
import { aiCreativeCopyConfigured } from "@/lib/marketing/ai-copy";
import type { CopyBlockLike } from "@/lib/marketing/copy-suggest";
import { getEditorSuggestion } from "@/lib/marketing/facets";
import { marketingStorage } from "@/lib/marketing/storage";
import { subcategoryForFamily } from "@/lib/marketing/taxonomy";

export const metadata = { title: "Nieuwe creative" };

function safeUrl(path: string): string | null {
  try {
    return marketingStorage().publicUrl(path);
  } catch {
    return null;
  }
}

export default async function NewCreativePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const assetIdParam = typeof params.assetId === "string" ? params.assetId : "";
  const fromId = typeof params.from === "string" ? params.from : "";

  const [assetRows, productRows, blockRows, igAgg, suggestion] = await Promise.all([
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
      .orderBy(desc(assets.createdAt))
      .limit(500),
    db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        priceFromEur: products.priceFromEur,
        specs: products.specs,
      })
      .from(products)
      .orderBy(products.name),
    db
      .select({
        angle: copyBlocks.angle,
        locale: copyBlocks.locale,
        role: copyBlocks.role,
        text: copyBlocks.text,
        productId: copyBlocks.productId,
        pattern: copyBlocks.pattern,
      })
      .from(copyBlocks),
    db
      .select({
        avgReach: sql<string | null>`avg((${assets.igMetrics} ->> 'reach')::numeric)`,
      })
      .from(assets)
      .where(sql`${assets.igMetrics} ->> 'reach' is not null`),
    getEditorSuggestion().catch(() => null),
  ]);

  // Drempel voor het IG-signaal: bovengemiddeld organisch bereik (§8 — hint, geen bewijs).
  const avgReach = igAgg[0]?.avgReach ? Number(igAgg[0].avgReach) : null;

  const editorAssets: EditorAsset[] = assetRows.map((a) => ({
    id: a.id,
    url: safeUrl(a.storagePath),
    label: a.productName ?? a.sourceRef ?? "Beeld zonder naam",
    productId: a.productId,
    category: a.productFamily ? subcategoryForFamily(a.productFamily) : null,
    source: a.source,
    tags: a.tags ?? [],
    organicStrong:
      avgReach != null && a.igReach != null && Number(a.igReach) > avgReach,
  }));

  // Dupliceren: bestaande spec als beginstand, mét verwijzing naar het origineel.
  let initial: EditorInitial = { assetId: assetIdParam || undefined };
  if (fromId) {
    const [from] = await db
      .select()
      .from(creativeSpecs)
      .where(eq(creativeSpecs.id, fromId))
      .limit(1);
    if (from) {
      initial = {
        assetId: from.assetId,
        productId: from.productId,
        template: from.template as TemplateName,
        palette: from.palette as PaletteName,
        format: from.format as FormatName,
        locale: from.locale,
        copyAngle: from.copyAngle,
        copy: from.copy ?? undefined,
        parentId: from.id,
      };
    }
  } else if (assetIdParam) {
    // Beeld hoort bij een product? Vul product én categorie alvast in.
    const linked = editorAssets.find((a) => a.id === assetIdParam);
    if (linked?.productId) {
      initial.productId = linked.productId;
      initial.category = linked.category;
    }
  }

  return (
    <>
      <PageHeader
        title={fromId ? "Dupliceer en pas aan" : "Nieuwe creative"}
        subtitle={
          fromId
            ? "Een lopende advertentie wijzig je niet — je maakt een kopie en past die aan (anders gaat de leerfase verloren)."
            : "Kies beeld(en), sjabloon en teksten; de preview toont exact wat er naar Meta gaat."
        }
      />
      <CreativeEditor
        assets={editorAssets}
        products={productRows}
        copyBlocks={blockRows as CopyBlockLike[]}
        initial={initial}
        suggestion={fromId ? null : suggestion}
        aiEnabled={aiCreativeCopyConfigured()}
      />
    </>
  );
}
