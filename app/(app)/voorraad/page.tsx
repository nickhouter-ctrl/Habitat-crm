import { and, asc, eq, ilike, or } from "drizzle-orm";
import { requireModuleRead } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { tekst } from "@/lib/i18n/server";
import { getReservedStockByProduct, resolveKitStocks, type KitComponent } from "@/lib/stock";
import { formatEUR } from "@/lib/utils";
import { Card, EmptyState, Input, LinkButton, PageHeader, Table, THead, TBody, Th, Td, Tr } from "@/components/ui";

export async function generateMetadata() { return { title: (await tekst())("Voorraad") }; }

/** Read-only sales inventory: quantities/prices, never project allocations/costs. */
export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuleRead("voorraad");
  const t = await tekst(), sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const collection = typeof sp.collection === "string" ? sp.collection.slice(0, 100) : "Wandpanelen";
  const rows = await db.select({
    id: products.id, name: products.name, sku: products.sku, category: products.category,
    collection: products.collection, unit: products.unit, stockQty: products.stockQty,
    sampleStockQty: products.sampleStockQty, priceEur: products.priceEur,
    tradePriceEur: products.tradePriceEur, components: products.components,
  }).from(products).where(and(eq(products.isActive, true), collection ? eq(products.collection, collection) : undefined,
    q ? or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.category, `%${q}%`)) : undefined))
    .orderBy(asc(products.category), asc(products.name)).limit(1000);
  const [kits, reserved] = await Promise.all([
    resolveKitStocks(rows.map(r => ({ sku: r.sku, components: r.components as KitComponent[] | null }))),
    getReservedStockByProduct(),
  ]);
  return <div className="space-y-5">
    <PageHeader title={t("Voorraad")} subtitle={t("Producten, beschikbare voorraad en verkoopprijzen.")}
      actions={<LinkButton href="/wederverkopers/prijzen" variant="secondary">{t("Staffels & marges")}</LinkButton>} />
    <form action="/voorraad" className="flex flex-wrap gap-3">
      <Input aria-label={t("Zoek product")} name="q" defaultValue={q} placeholder={t("Zoek product")} className="max-w-sm" />
      <select aria-label={t("Collectie")} name="collection" defaultValue={collection} className="rounded-lg border bg-surface px-3 py-2 text-sm">
        <option value="Wandpanelen">Flexible Stone</option><option value="">{t("Alle producten")}</option>
      </select><button className="rounded-lg border px-4 py-2 text-sm">{t("Filteren")}</button>
    </form>
    {rows.length ? <Card className="overflow-x-auto"><Table><THead><tr>
      <Th>{t("Product")}</Th><Th>{t("SKU")}</Th><Th>{t("Voorraad")}</Th><Th>{t("Beschikbaar")}</Th><Th>{t("Samples")}</Th><Th>{t("Verkoopprijs")}</Th><Th>{t("B2B-prijs")}</Th>
    </tr></THead><TBody>{rows.map(r => {
      const stock = r.sku && kits.has(r.sku) ? kits.get(r.sku)! : Number(r.stockQty ?? 0);
      return <Tr key={r.id}><Td><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.category}</span></Td>
        <Td>{r.sku ?? "—"}</Td><Td>{stock} {r.unit}</Td><Td>{Math.max(0, stock - (reserved.get(r.id) ?? 0))} {r.unit}</Td>
        <Td>{Number(r.sampleStockQty ?? 0)}</Td><Td>{r.priceEur === null ? "—" : formatEUR(r.priceEur)}</Td><Td>{r.tradePriceEur === null ? "—" : formatEUR(r.tradePriceEur)}</Td></Tr>;
    })}</TBody></Table></Card> : <EmptyState title={t("Geen producten gevonden")} description={t("Probeer een ander zoekwoord.")} />}
  </div>;
}
