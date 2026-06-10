import { and, asc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { Search, QrCode } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import {
  Badge,
  buttonClass,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { catalogCollections, catalogProducts, catalogVariants, products } from "@/lib/db/schema";
import { displaySku } from "@/lib/catalog";
import { cn, formatEUR } from "@/lib/utils";

export const metadata = { title: "Samplecatalogus" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  sample_only: "Alleen sample",
  available: "Leverbaar",
  discontinued: "Vervallen",
};

export default async function SampleCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const collection = typeof params.collection === "string" ? params.collection.trim() : "";
  const onlySample = params.sample === "1";
  const onlyRange = params.range === "1";
  const onlyPriced = params.priced === "1";

  // Scanner / exacte SKU → direct naar de variant.
  if (q) {
    const hit = await db.query.catalogVariants.findFirst({
      where: or(ilike(catalogVariants.sku, q), ilike(catalogVariants.legacySku, q)),
      columns: { id: true },
    });
    if (hit) redirect(`/samplecatalogus/${hit.id}`);
  }

  const collections = await db
    .select()
    .from(catalogCollections)
    .orderBy(asc(catalogCollections.sortOrder), asc(catalogCollections.nameEn));

  const filters = [
    collection ? eq(catalogProducts.collectionId, collection) : undefined,
    onlySample ? eq(catalogVariants.hasSample, true) : undefined,
    onlyRange ? eq(catalogVariants.inRange, true) : undefined,
    onlyPriced ? isNotNull(catalogVariants.salePrice) : undefined,
    q
      ? or(
          ilike(catalogVariants.sku, `%${q}%`),
          ilike(catalogVariants.legacySku, `%${q}%`),
          ilike(catalogVariants.colorNameEn, `%${q}%`),
          ilike(catalogProducts.nameEn, `%${q}%`),
        )
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: catalogVariants.id,
      sku: catalogVariants.sku,
      legacySku: catalogVariants.legacySku,
      color: catalogVariants.colorNameEn,
      imageUrl: catalogVariants.imageUrl,
      hasSample: catalogVariants.hasSample,
      inRange: catalogVariants.inRange,
      salePrice: catalogVariants.salePrice,
      status: catalogVariants.status,
      productName: catalogProducts.nameEn,
      collectionName: catalogCollections.nameEn,
      sizes: sql<number>`(select count(*)::int from catalog_variant_sizes s where s.variant_id = ${catalogVariants.id})`,
      sizesInStock: sql<number>`(select count(*)::int from catalog_variant_sizes s where s.variant_id = ${catalogVariants.id} and s.in_stock)`,
      sizeLabels: sql<string | null>`(select string_agg(s.product_size, '|' order by s.sort_order) from catalog_variant_sizes s where s.variant_id = ${catalogVariants.id})`,
      prodSizes: products.additionalSizes,
      prodStock: products.stockQty,
    })
    .from(catalogVariants)
    .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
    .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
    .leftJoin(products, eq(catalogVariants.existingProductId, products.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(catalogCollections.sortOrder),
      asc(catalogProducts.nameEn),
      asc(catalogVariants.colorNameEn),
    )
    .limit(1000);

  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withSample: sql<number>`count(case when ${catalogVariants.hasSample} then 1 end)::int`,
      inRange: sql<number>`count(case when ${catalogVariants.inRange} then 1 end)::int`,
      priced: sql<number>`count(case when ${catalogVariants.salePrice} is not null then 1 end)::int`,
    })
    .from(catalogVariants);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Samplecatalogus"
        subtitle="Referentiecatalogus — telt niet mee in voorraad. Scan een label of zoek op SKU."
        actions={
          <div className="flex gap-2">
            <LinkButton href="/samplecatalogus/match" variant="secondary">
              Koppelen
            </LinkButton>
            <LinkButton href="/samplecatalogus/beheer">Beheer</LinkButton>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Varianten" value={String(agg?.total ?? 0)} tone="neutral" />
        <StatTile label="Met sample" value={String(agg?.withSample ?? 0)} tone="success" />
        <StatTile label="In assortiment" value={String(agg?.inRange ?? 0)} tone="info" />
        <StatTile label="Prijs bekend" value={String(agg?.priced ?? 0)} tone="warning" />
      </div>

      <Card className="p-4">
        <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
              <QrCode className="h-3.5 w-3.5" /> Scan label of zoek (SKU, kleur, product)
            </label>
            <Input
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Scan of typ een SKU…"
            />
          </div>
          <select
            name="collection"
            defaultValue={collection}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Alle collecties</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass()}>
            <Search className="h-4 w-4" /> Zoek
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <FilterChip param="sample" active={onlySample} q={q} collection={collection}>
            Alleen met sample
          </FilterChip>
          <FilterChip param="range" active={onlyRange} q={q} collection={collection}>
            In assortiment
          </FilterChip>
          <FilterChip param="priced" active={onlyPriced} q={q} collection={collection}>
            Prijs bekend
          </FilterChip>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Niets gevonden"
          description="Pas je zoekopdracht of filters aan, of voeg samples toe via Beheer."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Product · kleur</Th>
                <Th>Collectie</Th>
                <Th>SKU</Th>
                <Th>Maten</Th>
                <Th>Prijs</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const sizeRows = (
                  (r.prodSizes as Array<{
                    sku: string;
                    label: string;
                    priceEur?: number | null;
                    purchaseEur?: number | null;
                    costEur?: number | null;
                    stockQty?: number | null;
                  }> | null) ?? []
                ).filter((s) => s.label);
                return (
                <Fragment key={r.id}>
                <Tr className="hover:bg-muted/40">
                  <Td>
                    <Link href={`/samplecatalogus/${r.id}`} className="flex items-center gap-3">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted" />
                      )}
                      <div>
                        <div className="font-medium">{r.productName}</div>
                        <div className="text-xs text-muted">{r.color}</div>
                      </div>
                    </Link>
                  </Td>
                  <Td className="text-sm text-muted">{r.collectionName}</Td>
                  <Td>
                    <span className="font-mono text-xs">{displaySku(r)}</span>
                  </Td>
                  <Td className="text-sm">
                    <span className="text-muted">{r.sizes} mt</span>
                    {(r.prodStock != null ? Number(r.prodStock) : 0) > 0 ? (
                      <span className="ml-1 text-xs font-medium text-success">
                        · {Number(r.prodStock)} op vrd
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-sm">
                    {r.salePrice ? formatEUR(r.salePrice) : <span className="text-muted">op aanvraag</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.hasSample && <Badge tone="success">Sample</Badge>}
                      {r.inRange && <Badge tone="info">Assortiment</Badge>}
                      {!r.hasSample && !r.inRange && (
                        <Badge tone="neutral">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      )}
                    </div>
                  </Td>
                </Tr>
                {sizeRows.length >= 2 && (
                  <Tr>
                    <Td colSpan={6} className="p-0">
                      <div className="mx-3 mb-2 overflow-hidden rounded-md border border-border/60 bg-muted/15 text-[11px]">
                        <div className="grid grid-cols-[1.2fr_1.4fr_0.7fr_1fr_1fr_1fr_1.1fr] gap-x-2 border-b border-border bg-background/60 px-3 py-1 font-medium text-muted">
                          <span>Afmeting</span>
                          <span>SKU</span>
                          <span className="text-right">Voorraad</span>
                          <span className="text-right">Verkoop</span>
                          <span className="text-right">Inkoop</span>
                          <span className="text-right">Kostprijs</span>
                          <span className="text-right">Marge</span>
                        </div>
                        {sizeRows.map((s, i) => {
                          const st = s.stockQty ?? 0;
                          const v = s.priceEur ?? null;
                          const k = s.costEur ?? null;
                          const mrg = v != null && k != null ? v - k : null;
                          const mrgPct = mrg != null && v ? Math.round((mrg / v) * 100) : null;
                          return (
                            <div
                              key={s.sku || i}
                              className="grid grid-cols-[1.2fr_1.4fr_0.7fr_1fr_1fr_1fr_1.1fr] gap-x-2 border-b border-border/30 px-3 py-1 last:border-b-0"
                            >
                              <span className="tabular-nums">{s.label.replace(/\*/g, "×")}</span>
                              <span className="font-mono text-muted">{s.sku}</span>
                              <span className={cn("text-right tabular-nums", st > 0 ? "text-success" : "text-muted/60")}>
                                {st}
                              </span>
                              <span className="text-right tabular-nums">{v != null ? formatEUR(v) : "—"}</span>
                              <span className="text-right tabular-nums text-muted">{s.purchaseEur != null ? formatEUR(s.purchaseEur) : "—"}</span>
                              <span className="text-right tabular-nums text-muted">{k != null ? formatEUR(k) : "—"}</span>
                              <span className="text-right tabular-nums">
                                {mrg != null ? (
                                  <>
                                    {formatEUR(mrg)}
                                    {mrgPct != null ? <span className="ml-1 text-muted">({mrgPct}%)</span> : null}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </Td>
                  </Tr>
                )}
                </Fragment>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function FilterChip({
  param,
  active,
  q,
  collection,
  children,
}: {
  param: string;
  active: boolean;
  q: string;
  collection: string;
  children: React.ReactNode;
}) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (collection) sp.set("collection", collection);
  if (!active) sp.set(param, "1");
  const href = `/samplecatalogus${sp.toString() ? `?${sp.toString()}` : ""}`;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-muted/50"
      }`}
    >
      {children}
    </Link>
  );
}
