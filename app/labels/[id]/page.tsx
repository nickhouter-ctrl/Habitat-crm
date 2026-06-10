import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Barcode } from "@/components/barcode";
import { PrintButton } from "@/components/print-button";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Label" };

export default async function ProductLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-8 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/products/${id}/edit`} className="text-sm text-muted hover:underline">
          ← Terug naar product
        </Link>
        <PrintButton />
      </div>

      {/* The label itself */}
      <div className="mx-auto w-72 rounded-lg border bg-surface p-4 text-center text-foreground print:w-full print:border-0 print:bg-white print:p-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {COMPANY.wordmark1} {COMPANY.wordmark2}
        </p>
        <p className="mt-2 text-sm font-medium leading-tight">{product.name}</p>
        {(product.sku || product.category) && (
          <p className="mt-0.5 text-xs text-muted">
            {[product.sku, product.category].filter(Boolean).join(" · ")}
          </p>
        )}
        {product.barcode ? (
          <div className="mt-3 flex justify-center">
            <Barcode value={product.barcode} height={45} width={1.7} fontSize={12} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-danger">Geen barcode — genereer er eerst één.</p>
        )}
        {product.priceEur && (
          <p className="mt-2 text-base font-semibold">
            {formatEUR(Number(product.priceEur) * (1 + (product.vatRate ?? 21) / 100))}
            {product.unit ? <span className="text-xs font-normal text-muted"> / {product.unit}</span> : null}
            <span className="text-xs font-normal text-muted"> incl. BTW</span>
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted print:hidden">
        Tip: in het printvenster &quot;Marges: geen&quot; en het juiste papierformaat kiezen voor
        labelvellen.
      </p>
    </main>
  );
}
