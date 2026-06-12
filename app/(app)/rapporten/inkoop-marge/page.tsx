import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
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
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Inkoop-aandacht" };
export const dynamic = "force-dynamic";

// Drempel: onder deze verkoopmarge is de inkoop relatief te duur. Omdat de
// verkoopprijs marktbepaald is, betekent een lage marge dat de kostprijs te hoog
// is → onderhandelen of stoppen met inkopen.
const WARN_PCT = 40;
const URGENT_PCT = 25;

export default async function InkoopMargePage() {
  const rows = await db
    .select({
      sku: products.sku,
      name: products.name,
      category: products.category,
      collection: products.collection,
      stockQty: products.stockQty,
      purchase: products.purchaseCostEur,
      cost: products.costEur,
      price: products.priceEur,
      margin: sql<number>`round((${products.priceEur} - ${products.costEur}) / ${products.priceEur} * 100)`,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        isNotNull(products.costEur),
        gt(products.priceEur, "0"),
        sql`(${products.priceEur} - ${products.costEur}) / ${products.priceEur} < ${WARN_PCT / 100}`,
      ),
    )
    .orderBy(asc(sql`(${products.priceEur} - ${products.costEur}) / ${products.priceEur}`));

  const urgent = rows.filter((r) => Number(r.margin) < URGENT_PCT);
  // Voorraadwaarde-risico: hoeveel kapitaal staat er in deze krappe producten.
  const stockValue = rows.reduce(
    (s, r) => s + Number(r.cost ?? 0) * Math.max(0, Number(r.stockQty ?? 0)),
    0,
  );

  return (
    <>
      <PageHeader
        title="Inkoop-aandacht"
        subtitle="Producten met een krappe verkoopmarge — de inkoopprijs is hoog t.o.v. de marktprijs. Onderhandel een betere deal of overweeg te stoppen met inkopen."
        actions={
          <LinkButton href="/rapporten" variant="secondary">
            ← Rapporten
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={`Marge onder ${WARN_PCT}%`} value={rows.length} hint="producten met krappe marge" tone="warning" />
        <StatTile label={`Marge onder ${URGENT_PCT}%`} value={urgent.length} hint="urgent — actie nodig" tone="danger" />
        <StatTile label="Voorraadwaarde hierin" value={formatEUR(stockValue)} hint="kapitaal in krappe producten · kostprijs" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Krappe marge — inkoop te duur</CardTitle>
          <span className="text-xs text-muted">oplopende marge · verkoopprijs ex BTW</span>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title="Niets te zien ✓" description={`Geen actieve producten met marge onder ${WARN_PCT}%.`} />
          </CardContent>
        ) : (
          <Table wrapperClassName="max-h-[70vh] overflow-y-auto">
            <THead>
              <tr>
                <Th>Product</Th>
                <Th>Categorie</Th>
                <Th className="text-right">Voorraad</Th>
                <Th className="text-right">Inkoop</Th>
                <Th className="text-right">Kostprijs</Th>
                <Th className="text-right">Verkoop</Th>
                <Th className="text-right">Marge</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const m = Number(r.margin);
                return (
                  <Tr key={r.sku ?? r.name}>
                    <Td>
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="font-mono text-xs text-muted">{r.sku}</span>
                    </Td>
                    <Td className="text-muted">{r.category ?? r.collection ?? "—"}</Td>
                    <Td className="text-right tabular-nums text-muted">
                      {r.stockQty != null ? Number(r.stockQty) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums text-muted">
                      {r.purchase != null ? formatEUR(r.purchase) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{formatEUR(r.cost)}</Td>
                    <Td className="text-right tabular-nums">{formatEUR(r.price)}</Td>
                    <Td className="text-right">
                      <Badge tone={m < URGENT_PCT ? "danger" : "warning"}>{m}%</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
