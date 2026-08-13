/**
 * Editor voor een nieuwe creative (brief §7): /marketing/creatives/new.
 * Met ?assetId= komt het beeld uit de bibliotheek voorgeselecteerd; met
 * ?from= wordt een bestaande spec gedupliceerd ("Dupliceer en pas aan", §3.5).
 */
import { desc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/ui";
import {
  CreativeEditor,
  type EditorAsset,
  type EditorInitial,
  type EditorProduct,
} from "@/components/marketing/creatives/creative-editor";
import type { CopyBlockRow } from "@/components/marketing/creatives/prefill";
import type { TemplateName } from "@/lib/creatives/templates";
import type { FormatName, PaletteName } from "@/lib/creatives/tokens";
import { db } from "@/lib/db";
import { assets, copyBlocks, creativeSpecs, products } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";

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

  const [assetRows, productRows, blockRows] = await Promise.all([
    db
      .select({
        id: assets.id,
        storagePath: assets.storagePath,
        sourceRef: assets.sourceRef,
        productId: assets.productId,
      })
      .from(assets)
      .orderBy(desc(assets.createdAt))
      .limit(80),
    db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        nameI18n: products.nameI18n,
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
  ]);

  const editorAssets: EditorAsset[] = assetRows.map((a) => ({
    id: a.id,
    url: safeUrl(a.storagePath),
    label: a.sourceRef ?? "Beeld zonder naam",
    productId: a.productId,
  }));
  const editorProducts: EditorProduct[] = productRows;

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
    // Beeld hoort bij een product? Vul het product alvast in.
    const linked = editorAssets.find((a) => a.id === assetIdParam);
    if (linked?.productId) initial.productId = linked.productId;
  }

  return (
    <>
      <PageHeader
        title={fromId ? "Dupliceer en pas aan" : "Nieuwe creative"}
        subtitle={
          fromId
            ? "Een lopende advertentie wijzig je niet — je maakt een kopie en past die aan (anders gaat de leerfase verloren)."
            : "Kies beeld, sjabloon en teksten; de preview toont exact wat er naar Meta gaat."
        }
      />
      <CreativeEditor
        assets={editorAssets}
        products={editorProducts}
        copyBlocks={blockRows as CopyBlockRow[]}
        initial={initial}
      />
    </>
  );
}
