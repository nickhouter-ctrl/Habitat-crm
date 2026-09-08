import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
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
import { brands, productVariants, products } from "@/lib/db/schema";

export const metadata = { title: "Merken" };

export default async function MerkenPage() {
  const rijen = await db
    .select({
      id: brands.id,
      name: brands.name,
      logoUrl: brands.logoUrl,
      skuPrefix: brands.skuPrefix,
      dealerDiscountPct: brands.dealerDiscountPct,
      tradeDiscountPct: brands.tradeDiscountPct,
      isActive: brands.isActive,
      producten: sql<number>`(select count(*)::int from ${products} p where p.brand_id = ${brands.id})`,
      uitvoeringen: sql<number>`(select count(*)::int from ${productVariants} v where v.brand_id = ${brands.id})`,
    })
    .from(brands)
    .orderBy(asc(brands.sortOrder), asc(brands.name));

  return (
    <>
      <PageHeader
        title="Merken"
        subtitle="Logo, dealerkorting en brochures per merk — de import gebruikt deze gegevens"
        actions={
          <LinkButton href="/merken/new" variant="primary">
            Nieuw merk
          </LinkButton>
        }
      />

      {rijen.length === 0 ? (
        <EmptyState
          title="Nog geen merken"
          description="Leg een merk vast met zijn logo en dealerkorting; daarna kun je er producten aan koppelen."
          action={<LinkButton href="/merken/new">Nieuw merk</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Merk</Th>
                <Th>Code</Th>
                <Th className="text-right">Inkoopkorting</Th>
                <Th className="text-right">Aannemerskorting</Th>
                <Th className="text-right">Producten</Th>
                <Th className="text-right">Uitvoeringen</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rijen.map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium">
                    <Link href={`/merken/${m.id}`} className="flex items-center gap-2.5 hover:underline">
                      {m.logoUrl ? (
                        // Geen next/image: merklogo's zijn vaak SVG, en die
                        // gaat niet door de optimalisatie heen.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.logoUrl} alt="" className="h-5 w-auto max-w-24 object-contain" />
                      ) : null}
                      {m.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{m.skuPrefix ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {m.dealerDiscountPct ? `${Number(m.dealerDiscountPct)}%` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {m.tradeDiscountPct ? (
                      `${Number(m.tradeDiscountPct)}%`
                    ) : (
                      <span className="text-xs text-muted">geen</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{m.producten}</Td>
                  <Td className="text-right tabular-nums text-muted">{m.uitvoeringen}</Td>
                  <Td>{!m.isActive && <Badge tone="neutral">inactief</Badge>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
