import { and, asc, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Barcode } from "@/components/barcode";
import { PrintButton } from "@/components/print-button";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labels printen" };

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export default async function PrintLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const idsParam = get("ids");
  const collection = get("collection");
  const category = get("category");
  const q = get("q");
  const copies = num(sp.copies, 1, 1, 50);
  // Label size in mm — defaults suit a Brother QL-800 62 mm roll.
  const w = num(sp.w, 62, 20, 200);
  const h = num(sp.h, 30, 15, 200);

  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const rows = await db.query.products.findMany({
    where: and(
      isNotNull(products.barcode),
      ids.length ? inArray(products.id, ids) : eq(products.isActive, true),
      collection ? eq(products.collection, collection) : undefined,
      category ? eq(products.category, category) : undefined,
      q
        ? or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.barcode, `%${q}%`))
        : undefined,
    ),
    orderBy: [asc(products.collection), asc(products.category), asc(products.name)],
    limit: 1000,
  });

  // One label per copy.
  const labels = rows.flatMap((p) => Array.from({ length: copies }, () => p));

  // Roll-printer page setup: each label is its own page, no margins.
  const pageCss = `
    @page { size: ${w}mm ${h}mm; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff; }
      .no-print { display: none !important; }
      .label-sheet { display: block; }
      .label {
        width: ${w}mm; height: ${h}mm;
        page-break-after: always; break-after: page;
        border: 0 !important; box-shadow: none !important;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        overflow: hidden; padding: 1.5mm;
      }
      .label:last-child { page-break-after: auto; }
    }
  `;

  const filterDesc = [
    collection && `collectie ${collection}`,
    category && `categorie ${category}`,
    q && `zoek "${q}"`,
    ids.length && `${ids.length} geselecteerd`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <main className="mx-auto max-w-3xl px-4 py-8 print:p-0">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/products" className="text-sm text-muted hover:underline">
              ← Terug naar producten
            </Link>
            <h1 className="mt-1 text-lg font-semibold">
              Labels printen — {rows.length} {rows.length === 1 ? "product" : "producten"}
              {copies > 1 ? ` × ${copies}` : ""}
              {filterDesc ? <span className="text-muted"> ({filterDesc})</span> : null}
            </h1>
          </div>
          <PrintButton label="Printen" />
        </div>

        <form className="no-print mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-surface p-3 text-sm">
          {ids.length ? <input type="hidden" name="ids" value={ids.join(",")} /> : null}
          {collection ? <input type="hidden" name="collection" value={collection} /> : null}
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Breedte (mm)</span>
            <input name="w" type="number" defaultValue={w} min={20} max={200}
              className="w-24 rounded-md border bg-background px-2 py-1.5 outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Hoogte (mm)</span>
            <input name="h" type="number" defaultValue={h} min={15} max={200}
              className="w-24 rounded-md border bg-background px-2 py-1.5 outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Aantal per product</span>
            <input name="copies" type="number" defaultValue={copies} min={1} max={50}
              className="w-24 rounded-md border bg-background px-2 py-1.5 outline-none" />
          </label>
          <button className="rounded-md border bg-background px-3 py-1.5 font-medium hover:bg-surface">
            Toepassen
          </button>
          <p className="basis-full text-xs text-muted">
            Stel in het printvenster het juiste papier-/rolformaat in (Brother QL-800: bv. 62 mm doorlopende rol).
            Producten zonder barcode worden overgeslagen.
          </p>
        </form>

        {rows.length === 0 ? (
          <p className="no-print rounded-lg border border-dashed bg-surface px-6 py-12 text-center text-sm text-muted">
            Geen producten met een barcode gevonden voor deze selectie.
          </p>
        ) : (
          <div className="label-sheet flex flex-wrap gap-3 print:block print:gap-0">
            {labels.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className="label flex flex-col items-center justify-center rounded-lg border bg-white p-3 text-center text-black print:rounded-none print:border-0"
                style={{ width: `${w}mm`, minHeight: `${h}mm` }}
              >
                <p className="text-[7px] font-semibold uppercase tracking-[0.25em] text-gray-500">
                  {COMPANY.wordmark1} {COMPANY.wordmark2}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold leading-tight">{p.name}</p>
                <p className="text-[8px] text-gray-500">
                  {[p.sku, p.category].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-1 flex justify-center">
                  <Barcode value={p.barcode!} height={28} width={1.2} fontSize={9} />
                </div>
                {p.priceEur && (
                  <p className="text-[10px] font-bold leading-none">
                    {formatEUR(Number(p.priceEur) * (1 + (p.vatRate ?? 21) / 100))}
                    {p.unit ? <span className="font-normal text-gray-500"> / {p.unit}</span> : null}
                    <span className="font-normal text-gray-500"> incl. BTW</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
