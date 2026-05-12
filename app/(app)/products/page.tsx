import { and, asc, eq, ilike, or } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
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

  const allCollections = await getProductCollections();
  const collection = allCollections.includes(collectionParam) ? collectionParam : "";

  const rows = await db.query.products.findMany({
    where: and(
      collection ? eq(products.collection, collection) : undefined,
      q
        ? or(
            ilike(products.name, `%${q}%`),
            ilike(products.category, `%${q}%`),
            ilike(products.sku, `%${q}%`),
          )
        : undefined,
    ),
    orderBy: [asc(products.category), asc(products.name)],
    limit: 1000,
  });

  // Group by category for the display.
  const groups = new Map<string, typeof rows>();
  for (const p of rows) {
    const key = p.category?.trim() || "Zonder categorie";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const tabHref = (col: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (col) sp.set("collection", col);
    const s = sp.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <>
      <PageHeader
        title="Producten"
        subtitle={`${rows.length} ${rows.length === 1 ? "product" : "producten"}${
          collection ? ` in ${collection}` : ""
        }${q ? ` voor "${q}"` : ""}`}
        actions={
          <>
            <LinkButton
              href={`/labels/print${(() => {
                const sp = new URLSearchParams();
                if (collection) sp.set("collection", collection);
                if (q) sp.set("q", q);
                const s = sp.toString();
                return s ? `?${s}` : "";
              })()}`}
              variant="secondary"
            >
              Labels printen
            </LinkButton>
            <LinkButton href="/products/new">Nieuw product</LinkButton>
          </>
        }
      />

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
                    <Th>SKU</Th>
                    <Th className="text-right">Voorraad</Th>
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
                    const marginPct = margin != null && cost > 0 ? Math.round((margin / cost) * 100) : null;
                    const stock = p.stockQty != null ? Number(p.stockQty) : null;
                    return (
                      <Tr key={p.id}>
                        <Td className="font-medium">
                          <Link href={`/products/${p.id}/edit`} className="hover:underline">
                            {p.name}
                          </Link>
                          {p.subcategory && (
                            <span className="block text-xs text-muted">{p.subcategory}</span>
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
