import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

import { createReorderPurchaseOrder } from "../actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Bijbestellen") };
}

export default async function ReorderPage() {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const low = await db.query.products.findMany({
    where: and(
      eq(products.isActive, true),
      isNotNull(products.stockMin),
      sql`coalesce(${products.stockQty}, 0) < ${products.stockMin}`,
    ),
    columns: {
      id: true,
      name: true,
      sku: true,
      stockQty: true,
      stockMin: true,
      collection: true,
      category: true,
      purchaseCostEur: true,
      costEur: true,
    },
    orderBy: asc(products.name),
  });

  // Groeperen per collectie (val terug op categorie, dan "Overig") — ≈ leverancier.
  const groups = new Map<string, { label: string; key: string; items: typeof low }>();
  for (const p of low) {
    const label = p.collection?.trim() || p.category?.trim() || "Overig";
    const key = p.collection?.trim() || p.category?.trim() || "__overig__";
    const g = groups.get(key) ?? { label, key, items: [] as typeof low };
    g.items.push(p);
    groups.set(key, g);
  }
  const groupList = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));

  const fmt = (v: string | null | undefined) =>
    Number(v ?? 0).toLocaleString(uiDateLocale, { maximumFractionDigits: 2 });
  const suggest = (p: (typeof low)[number]) =>
    Math.max(1, Math.ceil(Number(p.stockMin) - Number(p.stockQty ?? 0)));

  return (
    <>
      <PageHeader
        title={uiT("Bijbestellen")}
        subtitle={uiT(low.length === 1 ? "{n} product onder de voorraaddrempel" : "{n} producten onder de voorraaddrempel", { n: low.length })}
        actions={
          <LinkButton href="/inkooporders" variant="ghost">
            {uiT("← Inkooporders")} </LinkButton>
        }
      />

      {groupList.length === 0 ? (
        <EmptyState
          title={uiT("Niets bij te bestellen")}
          description={uiT("Alle actieve producten zitten boven hun voorraaddrempel.")}
        />
      ) : (
        <div className="space-y-5">
          {groupList.map((g) => (
            <Card key={g.key}>
              <CardHeader>
                <CardTitle>
                  {g.label}{" "}
                  <span className="text-xs font-normal text-muted">
                    ({g.items.length} {uiT(g.items.length === 1 ? "product" : "producten")})
                  </span>
                </CardTitle>
                <form action={createReorderPurchaseOrder.bind(null, g.key)}>
                  <SubmitButton variant="secondary" size="sm" pendingLabel={uiT("Aanmaken…")}>
                    {uiT("Concept-inkooporder maken")} </SubmitButton>
                </form>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <Th>{uiT("Product")}</Th>
                    <Th>SKU</Th>
                    <Th className="text-right">{uiT("Voorraad")}</Th>
                    <Th className="text-right">{uiT("Drempel")}</Th>
                    <Th className="text-right">{uiT("Voorstel")}</Th>
                  </tr>
                </THead>
                <TBody>
                  {g.items.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <Td className="font-medium">{p.name}</Td>
                      <Td className="text-muted">{p.sku ?? "—"}</Td>
                      <Td className="text-right tabular-nums text-danger">{fmt(p.stockQty)}</Td>
                      <Td className="text-right tabular-nums text-muted">{fmt(p.stockMin)}</Td>
                      <Td className="text-right tabular-nums font-medium">+{suggest(p)}</Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
