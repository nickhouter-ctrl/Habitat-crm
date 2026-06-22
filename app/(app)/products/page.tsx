import { and, asc, eq, ilike, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";
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
import { products } from "@/lib/db/schema";
import {
  getReservedStockByProduct,
  getUnassignedDirectionSales,
  resolveKitStocks,
  type KitComponent,
} from "@/lib/stock";
import { cn, formatEUR } from "@/lib/utils";
import { getProductCollections } from "../_options";
import { Gs1ExcelDownload } from "./gs1-download";

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
  // Voorraad-weergave: standaard alleen op voorraad; 'te-bestellen' = niet op
  // voorraad (incl. order_only samples); 'alle' = geen voorraadfilter. Bij een
  // zoekopdracht laten we alles zien.
  const view =
    params.view === "te-bestellen" || params.view === "alle" ? params.view : "op-voorraad";
  // Sets/kits hebben geen eigen voorraad (die volgt uit de componenten), dus
  // tellen we ze bij 'op voorraad' altijd mee en sluiten we ze uit van 'te
  // bestellen' — anders zouden de deur-sets nergens zichtbaar zijn.
  const stockFilter =
    q || view === "alle"
      ? undefined
      : view === "te-bestellen"
        ? sql`(coalesce(${products.stockQty}, 0) <= 0 and ${products.components} is null)`
        : sql`(coalesce(${products.stockQty}, 0) > 0 or ${products.components} is not null)`;

  const allCollections = await getProductCollections();
  const collection = allCollections.includes(collectionParam) ? collectionParam : "";

  const rows = await db.query.products.findMany({
    where: and(
      // Gearchiveerde producten (bv. losse set-onderdelen) nooit in de lijst tonen.
      eq(products.isActive, true),
      stockFilter,
      collection ? eq(products.collection, collection) : undefined,
      noBarcode ? and(isNull(products.barcode), eq(products.isActive, true)) : undefined,
      noPhoto ? and(isNull(products.imageUrl), eq(products.isActive, true)) : undefined,
      lowStock
        ? and(
            eq(products.isActive, true),
            ne(products.availability, "order_only"),
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
      stockCostValue: sql<string>`coalesce(sum(case when ${products.availability} <> 'order_only' then coalesce(${products.costEur},0) * coalesce(${products.stockQty},0) else 0 end), 0)`,
      stockSaleValue: sql<string>`coalesce(sum(case when ${products.availability} <> 'order_only' then coalesce(${products.priceEur},0) * coalesce(${products.stockQty},0) else 0 end), 0)`,
      noPhoto: sql<number>`count(case when ${products.isActive} = true and ${products.imageUrl} is null then 1 end)::int`,
    })
    .from(products);

  // Totale brutomarge op de huidige voorraad (verkoopwaarde − kostprijs-waarde).
  const totalMargin = Number(agg.stockSaleValue) - Number(agg.stockCostValue);
  const totalMarginPct =
    Number(agg.stockSaleValue) > 0
      ? Math.round((totalMargin / Number(agg.stockSaleValue)) * 100)
      : null;

  // Producten die nu onderweg/besteld zijn (open inkooporders).
  const onOrderRows = (await db.execute(sql`
    select
      (item->>'productId')::uuid as product_id,
      sum((item->>'units')::numeric) as qty,
      max(po.expected_date) as next_date,
      string_agg(distinct po.supplier, ', ') as suppliers
    from purchase_orders po,
      jsonb_array_elements(case when jsonb_typeof(po.items) = 'array' then po.items else '[]'::jsonb end) as item
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

  // Gereserveerde stuks per product (uit geaccepteerde, nog niet afgeboekte offertes).
  const reservedByProduct = await getReservedStockByProduct();

  // Set-producten (met uitvoeringen): verkocht zónder gekozen draairichting → melding.
  const variantSetIds = rows
    .filter((r) => Array.isArray(r.additionalSizes) && (r.additionalSizes as unknown[]).length >= 2)
    .map((r) => r.id);
  const unassignedDirByProduct = await getUnassignedDirectionSales(variantSetIds);

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
    if (view !== "op-voorraad") sp.set("view", view);
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
                  <Gs1ExcelDownload />
                  <LinkButton href="/products/pdf" variant="primary" target="_blank">
                    📄 PDF-overzicht
                  </LinkButton>
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Producten (totaal)" value={agg.n} />
        <StatTile label="Voorraadwaarde (kostprijs)" value={formatEUR(agg.stockCostValue)} hint="kostprijs × voorraad" />
        <StatTile label="Voorraadwaarde (verkoop)" value={formatEUR(agg.stockSaleValue)} hint="verkoopprijs × voorraad" />
        <StatTile
          label="Totale marge (voorraad)"
          value={formatEUR(totalMargin)}
          hint={totalMarginPct != null ? `${totalMarginPct}% · verkoop − kostprijs` : "verkoop − kostprijs"}
        />
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md bg-surface p-0.5">
            {([
              ["op-voorraad", "Op voorraad"],
              ["te-bestellen", "Te bestellen"],
              ["alle", "Alle"],
            ] as const).map(([v, label]) => (
              <Link
                key={v}
                href={buildHref({ view: v === "op-voorraad" ? undefined : v })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  view === v
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <form className="relative max-w-xs flex-1 sm:flex-none" action="/products">
            {collection && <input type="hidden" name="collection" value={collection} />}
            {view !== "op-voorraad" && <input type="hidden" name="view" value={view} />}
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Zoek op naam, categorie of SKU…" className="w-64 pl-8" />
          </form>
        </div>
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
                    <Th className="text-right" title="Inkoopprijs leverancier (ex. overhead)">Inkoop</Th>
                    <Th className="text-right" title="Kostprijs incl. landed-cost (Allpack + Teresa + vracht + douane)">Kostprijs</Th>
                    <Th className="text-right" title="Marge € en % — % is tegelijk de maximale korting voor break-even">Marge / max. korting</Th>
                    <Th>Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {items.map((p) => {
                    const price = Number(p.priceEur ?? 0);
                    const m2 =
                      p.widthMm && p.heightMm
                        ? (Number(p.widthMm) * Number(p.heightMm)) / 1_000_000
                        : null;
                    const pricePerM2 = m2 && m2 > 0 && price > 0 ? price / m2 : null;
                    const kitComponents = (p.components as KitComponent[] | null) ?? null;
                    const isKit = !!kitComponents && kitComponents.length > 0;
                    // Set/variant-product (meerdere uitvoeringen): voorraad = eigen veld
                    // (= totaal van de varianten), niet de kit-berekening van losse onderdelen.
                    const variantArr =
                      (p.additionalSizes as Array<{ stockQty?: number | null }> | null) ?? [];
                    const isVariantSet = variantArr.length >= 2;
                    const stock =
                      isVariantSet || !isKit
                        ? p.stockQty != null
                          ? Number(p.stockQty)
                          : null
                        : (kitStocks.get(p.sku ?? "") ?? 0);
                    const sizeRows = (
                      (p.additionalSizes as Array<{
                        sku: string;
                        label: string;
                        priceEur?: number | null;
                        purchaseEur?: number | null;
                        costEur?: number | null;
                        stockQty?: number | null;
                      }> | null) ?? []
                    ).filter((s) => s.sku || s.label);
                    const hasGrid = sizeRows.length >= 2;
                    const single = sizeRows.length === 1 ? sizeRows[0] : null;
                    const dispPrice = single?.priceEur ?? (p.priceEur != null ? Number(p.priceEur) : null);
                    const dispPurchase =
                      single?.purchaseEur ?? (p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null);
                    const dispCost = single?.costEur ?? (p.costEur != null ? Number(p.costEur) : null);
                    const dispStock = single ? (single.stockQty ?? 0) : stock;
                    const dispMargin = dispPrice != null && dispCost != null ? dispPrice - dispCost : null;
                    const dispMarginPct =
                      dispMargin != null && dispPrice ? Math.round((dispMargin / dispPrice) * 100) : null;
                    // De maat die overeenkomt met de hoofdafmeting (breedte×hoogte) erft de
                    // voorraad/prijs/kostprijs van het hoofdproduct als die op de maat zelf
                    // ontbreken — anders staat de voorraad (bv. 208) nergens bij een maat.
                    const parentDims =
                      p.widthMm && p.heightMm
                        ? [Number(p.widthMm), Number(p.heightMm)].sort((a, b) => a - b).join("x")
                        : null;
                    const sizeRowsDisp = sizeRows.map((s) => {
                      const nums = (s.label.match(/\d+/g) ?? [])
                        .map(Number)
                        .sort((a, b) => a - b)
                        .join("x");
                      if (parentDims == null || nums !== parentDims) return s;
                      return {
                        ...s,
                        stockQty: s.stockQty ?? stock,
                        priceEur: s.priceEur ?? (p.priceEur != null ? Number(p.priceEur) : null),
                        purchaseEur:
                          s.purchaseEur ?? (p.purchaseCostEur != null ? Number(p.purchaseCostEur) : null),
                        costEur: s.costEur ?? (p.costEur != null ? Number(p.costEur) : null),
                      };
                    });
                    return (
                      <Fragment key={p.id}>
                      <Tr>
                        <Td className="font-medium">
                          <div className="flex items-center gap-2.5">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 shrink-0 rounded border border-border object-cover"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-border text-[9px] text-muted">
                                {p.isActive ? "geen" : "—"}
                              </span>
                            )}
                            <span className="min-w-0">
                              <Link href={`/products/${p.id}/edit`} className="hover:underline">
                                {p.name}
                              </Link>
                              {p.subcategory && (
                                <span className="block text-xs text-muted">{p.subcategory}</span>
                              )}
                            </span>
                          </div>
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
                        <Td className="align-top text-muted">
                          <span className="font-mono">{p.sku ?? "—"}</span>
                        </Td>
                        <Td
                          className={cn(
                            "align-top text-right tabular-nums",
                            dispStock != null && dispStock <= 0 && "font-medium text-danger",
                          )}
                        >
                          {dispStock != null ? dispStock.toLocaleString("nl-NL") : "—"}
                          {(() => {
                            const reserved = reservedByProduct.get(p.id) ?? 0;
                            if (reserved <= 0) return null;
                            const free = (dispStock ?? 0) - reserved;
                            return (
                              <span
                                className="block text-[10px] font-normal text-warning"
                                title="Gereserveerd in geaccepteerde offertes · vrij = fysiek − gereserveerd"
                              >
                                {reserved.toLocaleString("nl-NL")} geres. ·{" "}
                                <span className={cn(free < 0 && "font-semibold text-danger")}>
                                  {free.toLocaleString("nl-NL")} vrij
                                </span>
                              </span>
                            );
                          })()}
                          {(() => {
                            const open = unassignedDirByProduct.get(p.id) ?? 0;
                            if (open <= 0) return null;
                            return (
                              <span
                                className="mt-0.5 block text-[10px] font-medium text-amber-600"
                                title="Het totaal klopt; voor deze verkochte stuks moet nog gekozen worden welke draairichting verkocht is."
                              >
                                ⚠ {open.toLocaleString("nl-NL")} verkocht · draairichting nog kiezen
                              </span>
                            );
                          })()}
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
                        <Td className="text-right tabular-nums">
                          {hasGrid ? (
                            <span className="text-muted/40">·</span>
                          ) : (
                            <>
                              {dispPrice != null ? formatEUR(dispPrice) : "—"}
                              {!single && pricePerM2 != null && (
                                <span className="block text-xs text-muted">{formatEUR(pricePerM2)}/m²</span>
                              )}
                            </>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums text-muted">{p.vatRate}%</Td>
                        <Td className="text-right tabular-nums text-muted">
                          {hasGrid ? <span className="text-muted/40">·</span> : dispPurchase != null ? formatEUR(dispPurchase) : "—"}
                        </Td>
                        <Td className="text-right tabular-nums text-muted">
                          {hasGrid ? <span className="text-muted/40">·</span> : dispCost != null ? formatEUR(dispCost) : "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {hasGrid ? (
                            <span className="text-muted/40">·</span>
                          ) : dispMargin != null ? (
                            <>
                              <span>{formatEUR(dispMargin)}</span>
                              {dispMarginPct != null && (
                                <span className={cn(
                                  "ml-1 text-xs",
                                  dispMarginPct < 0 ? "text-danger" : dispMarginPct < 15 ? "text-warning" : "text-muted",
                                )}>
                                  ({dispMarginPct}%)
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>
                          {p.isActive ? (
                            <Badge tone="success">Actief</Badge>
                          ) : (
                            <Badge tone="neutral">Inactief</Badge>
                          )}
                        </Td>
                      </Tr>
                      {hasGrid && (
                        <Tr>
                          <Td colSpan={13} className="p-0">
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
                              {sizeRowsDisp.map((s, i) => {
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
          ))}
        </div>
      )}
    </>
  );
}
