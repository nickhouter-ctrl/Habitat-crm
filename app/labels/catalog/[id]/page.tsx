import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Barcode } from "@/components/barcode";
import { PrintButton } from "@/components/print-button";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { catalogCollections, catalogProducts, catalogVariants } from "@/lib/db/schema";
import { displaySku } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sample-label" };

export default async function CatalogLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const [v] = await db
    .select({
      sku: catalogVariants.sku,
      legacySku: catalogVariants.legacySku,
      color: catalogVariants.colorNameEn,
      productName: catalogProducts.nameEn,
      collectionName: catalogCollections.nameEn,
    })
    .from(catalogVariants)
    .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
    .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
    .where(eq(catalogVariants.id, id))
    .limit(1);

  if (!v) notFound();
  const sku = displaySku(v);

  return (
    <main className="mx-auto max-w-md px-4 py-8 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/samplecatalogus/${id}`} className="text-sm text-muted hover:underline">
          ← Terug naar sample
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto w-72 rounded-lg border bg-surface p-4 text-center text-foreground print:w-full print:border-0 print:bg-white print:p-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {COMPANY.wordmark1} {COMPANY.wordmark2}
        </p>
        <p className="mt-2 text-sm font-medium leading-tight">{v.productName}</p>
        <p className="mt-0.5 text-xs text-muted">
          {[v.collectionName, v.color].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 flex justify-center">
          <Barcode value={sku} height={45} width={1.7} fontSize={12} />
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted print:hidden">
        Tip: in het printvenster &quot;Marges: geen&quot; kiezen voor labelvellen.
      </p>
    </main>
  );
}
