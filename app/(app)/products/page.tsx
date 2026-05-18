import { and, asc, eq, ilike, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";

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
import { products } from "@/lib/db/schema";
import { resolveKitStocks, type KitComponent } from "@/lib/stock";
import { cn, formatEUR } from "@/lib/utils";
import { getProductCollections } from "../_options";

export const metadata = { title: "Producten" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const collectionParam =
    typeof params.collection === "string" ? params.collection.trim() : "";
  const noBarcode = params.nobarcode === "1";
  const lowStock = params.lowstock === "1";
  const noPhoto = params.nofoto === "1";
  const sort = typeof params.sort === "string" ? params.sort : "";
  const sortByOnderweg = sort === "onderweg";

  const allCollections = await getProductCollections();
  const collection = allCollections.includes(collectionParam) ? collectionParam : "";

  const rows = await db.query.products.findMany({
    where: and(
      collection ? eq(products.collection, collection) : undefined,
      noBarcode ? and(isNull(products.barcode), eq(products.isActive, true)) : undefined,
      noPhoto ? and(isNull(products.imageUrl), eq(products.isActive, true)) : undefined,
      lowStock
        ? and(
            eq(products.isActive, true),
            isNotNull(products.stockMin),
            lt(sql<number>`coalesce(${products.stockQty}, 0)`, sql<number>`${products.stockMin}`),
          )
        : undefined,
      q
        ? or(
            ilike(products.name, `%${q}%`),
            ilike(products.category, `%${q}%`),
            ilike(products.sku, `%${q}%`),
            ilike(products.description, `%${q}%`),
          )
        : undefined,
    ),
    orderBy: [asc(products.category), asc(products.name)],
    limit: 1000,
  });

  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      stockCostValue: sql<string>`coalesce(sum(coalesce(${products.costEur},0) * coalesce(${products.stockQty},0)), 0)`,
      stockSaleValue: sql<string>`coalesce(sum(coalesce(${products.priceEur},0) * coalesce(${products.stockQty},0)), 0)`,
      noPhoto: sql<number>`count(case when ${products.isActive} = true and ${products.imageUrl} is null then 1 end)::int`,
    })
    .from(products);

  // Producten die nu onderweg/besteld zijn (open inkooporders).
  const onOrderRows = (await db.execute(sql`
    select
      (item->>'productId')::uuid as product_id,
      sum((item->>'units')::numeric) as qty,
      max(po.expected_date) as next_date,
      string_agg(distinct po.supplier, ', ') as suppliers
    from purchase_orders po,
      jsonb_array_elements(po.items) as item
    where po.status in ('ordered', 'in_transit')
      and item->>'productId' is not null
    group by product_id
  `)) as unknown as { product_id: string; qty: string; next_date: string | null; suppliers: string }[];
  const onOrderByProduct = new Map(
    (Array.isArray(onOrderRows) ? onOrderRows : (onOrderRows as { rows?: any[] }).rows ?? []).map(
      (r: any) => [r.product_id as string, { qty: Number(r.qty || 0), nextDate: r.next_date as string | null, suppliers: r.suppliers as string }],
    ),
  );


  // Bereken effectieve voorraad voor kit-producten (sets met components-array).
  const kitStocks = await resolveKitStocks(
    rows.map((r) => ({ sku: r.sku, components: r.components as KitComponent[] | null })),
  );

  // Group by category for the display (skip when sorting flat by onderweg).
  const groups = new Map<string, typeof rows>();
  if (sortByOnderweg) {
    // Eén platte lijst, gesorteerd op aantal onderweg (desc), dan op naam.
    const sorted = [...rows].sort((a, b) => {
      const qa = onOrderByProduct.get(a.id)?.qty ?? 0;
      const qb = onOrderByProduct.get(b.id)?.qty ?? 0;
      if (qb !== qa) return qb - qa;
      return a.name.localeCompare(b.name);
    });
    groups.set("Op aantal onderweg", sorted);
  } else {
    for (const p of rows) {
      const key = p.category?.trim() || "Zonder categorie";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
  }

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (collection) sp.set("collection", collection);
    if (sort) sp.set("sort", sort);
    if (noBarcode) sp.set("nobarcode", "1");
    if (lowStock) sp.set("lowstock", "1");
    if (noPhoto) sp.set("nofoto", "1");
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `/products?${s}` : "/products";
  };
  const tabHref = (col: string) => buildHref({ collection: col || undefined });
  const onderwegHref = sortByOnderweg ? buildHref({ sort: undefined }) : buildHref({ sort: "onderweg" });

  return (
    <>
      <PageHeader
        title="Producten"
        subtitle={`${rows.length} ${rows.length === 1 ? "product" : "producten"}${
          noBarcode ? " zonder barcode" : ""
        }${noPhoto ? " zonder foto" : ""}${lowStock ? " onder voorraaddrempel" : ""}${collection ? ` in ${collection}` : ""}${q ? ` voor "${q}"` : ""}`}
        actions={
          <>
            {(() => {
              const sp = new URLSearchParams();
              if (collection) sp.set("collection", collection);
              if (q) sp.set("q", q);
              const qs = sp.toString() ? `?${sp.toString()}` : "";
              return (
                <>
                  <a href={`/products/export${qs}`} className={buttonClass({ variant: "secondary" })} download>
                    Excel downloaden
                  </a>
                  <a
                    href="/api/products/barcodes-csv"
                    className={buttonClass({ variant: "secondary" })}
                    download
                    title="Exporteer alle producten met barcode (GS1) als CSV voor MijnGS1-portal import"
                  >
                    GS1 CSV
                  </a>
                  <LinkButton href={`/print-labels${qs}`} variant="secondary">
                    Labels printen
                  </LinkButton>
                </>
              );
            })()}
            <LinkButton href="/products/new">Nieuw product</LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Producten (totaal)" value={agg.n} />
        <StatTile label="Voorraadwaarde (kostprijs)" value={formatEUR(agg.stockCostValue)} hint="kostprijs × voorraad" />
        <StatTile label="Voorraadwaarde (verkoop)" value={formatEUR(agg.stockSaleValue)} hint="verkoopprijs × voorraad" />
        <Link href="/products?nofoto=1" className="block">
          <StatTile label="Zonder foto" value={agg.noPhoto} hint="actieve producten · ontbreekt op de site" />
        </Link>
      </div>


      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          <Link
            href={tabHref("")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              !collection
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            Alle
          </Link>
          {allCollections.map((col) => (
            <Link
              key={col}
              href={tabHref(col)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                collection === col
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {col}
            </Link>
          ))}
        </div>
        <form className="relative max-w-xs flex-1 sm:flex-none" action="/products">
          {collection && <input type="hidden" name="collection" value={collection} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Zoek op naam, categorie of SKU…" className="w-64 pl-8" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "Geen producten gevonden" : "Nog geen producten"}
          description={
            q
              ? "Pas je zoekopdracht aan."
              : "Voeg producten/materialen toe — bv. een categorie 'Magic Stone' met daaronder de varianten. Later worden ze gesynct vanuit Holded."
          }
          action={<LinkButton href="/products/new">Nieuw product</LinkButton>}
        />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([category, items]) => (
            <Card key={category} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b bg-background/60 px-4 py-2.5">
                <h2 className="text-sm font-semibold">{category}</h2>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <Table>
                <THead>
                  <tr>
                    <Th>Naam</Th>
                    <Th>Site</Th>
                    <Th>Omschrijving</Th>
                    <Th>SKU</Th>
                    <Th className="text-right">Voorraad</Th>
                    <Th className="text-right">
                      <Link
                        href={onderwegHref}
                        className={cn(
                          "inline-flex items-center gap-0.5 hover:text-foreground",
                          sortByOnderweg && "text-accent",
                        )}
                        title={sortByOnderweg ? "Klik om sortering uit te zetten" : "Sorteer op aantal onderweg"}
                      >
                        Onderweg {sortByOnderweg ? "↓" : "↕"}
                      </Link>
                    </Th>
                    <Th>Eenh.</Th>
                    <Th className="text-right">Verkoop (ex.)</Th>
                    <Th className="text-right">BTW</Th>
                    <Th className="text-right">Kostprijs</Th>
                    <Th className="text-right">Marge</Th>
                    <Th>Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {items.map((p) => {
                    const price = Number(p.priceEur ?? 0);
                    const cost = Number(p.costEur ?? 0);
                    const margin = price > 0 && cost > 0 ? price - cost : null;
                    const marginPct = margin != null && price > 0 ? Math.round((margin / price) * 100) : null;
                    const kitComponents = (p.components as KitComponent[] | null) ?? null;
                    const isKit = !!kitComponents && kitComponents.length > 0;
                    const stock = isKit
                      ? (kitStocks.get(p.sku ?? "") ?? 0)
                      : p.stockQty != null
                        ? Number(p.stockQty)
                        : null;
                    return (
                      <Tr key={p.id}>
                        <Td className="font-medium">
                          <Link href={`/products/${p.id}/edit`} className="hover:underline">
                            {p.name}
                          </Link>
                          {!p.imageUrl && p.isActive && (
                            <Badge tone="warning" className="ml-2 align-middle text-[10px]">
                              geen foto
                            </Badge>
                          )}
                          {p.subcategory && (
                            <span className="block text-xs text-muted">{p.subcategory}</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-xs">
                          {p.websiteProductId ? (
                            <Badge tone="success" className="text-[10px]">✓ op site</Badge>
                          ) : p.pushToWebsite ? (
                            <Badge tone="info" className="text-[10px]">klaargezet</Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                        <Td className="max-w-[18rem] text-xs text-muted">
                          {p.description ? (
                            <span
                              className="line-clamp-2 whitespace-pre-line"
                              title={p.description}
                            >
                              {p.description}
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td className="text-muted">{p.sku ?? "—"}</Td>
                        <Td
                          className={cn(
                            "text-right tabular-nums",
                            stock != null && stock <= 0 && "font-medium text-danger",
                          )}
                        >
                          {stock != null ? stock.toLocaleString("nl-NL") : "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {(() => {
                            const oo = onOrderByProduct.get(p.id);
                            return oo && oo.qty > 0 ? (
                              <span className="font-medium text-accent">+{oo.qty.toLocaleString("nl-NL")}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            );
                          })()}
                        </Td>
                        <Td className="text-muted">{p.unit ?? "—"}</Td>
                        <Td className="text-right tabular-nums">{p.priceEur ? formatEUR(p.priceEur) : "—"}</Td>
                        <Td className="text-right tabular-nums text-muted">{p.vatRate}%</Td>
                        <Td className="text-right tabular-nums text-muted">{p.costEur ? formatEUR(p.costEur) : "—"}</Td>
                        <Td className="text-right tabular-nums">
                          {margin != null ? `${formatEUR(margin)}${marginPct != null ? ` (${marginPct}%)` : ""}` : "—"}
                        </Td>
                        <Td>
                          {p.isActive ? (
                            <Badge tone="success">Actief</Badge>
                          ) : (
                            <Badge tone="neutral">Inactief</Badge>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
