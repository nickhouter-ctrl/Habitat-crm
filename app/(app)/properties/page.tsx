import { desc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
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
import { properties } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { propertyStatusMeta, propertyTypeMeta } from "../_meta";

export const metadata = { title: "Panden" };

export default async function PropertiesPage() {
  const rows = await db.query.properties.findMany({
    orderBy: desc(properties.updatedAt),
    limit: 200,
    with: {
      ownerContact: { columns: { id: true, name: true } },
      owner: { columns: { name: true } },
    },
  });

  const available = rows.filter((p) => p.status === "available").length;
  const portfolioValue = rows
    .filter((p) => p.status === "available")
    .reduce((sum, p) => sum + Number(p.priceEur ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Panden"
        subtitle="Vastgoed te koop — villa's, appartementen, bouwgrond en renovatieprojecten"
        actions={<LinkButton href="/properties/new">Nieuw pand</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Totaal" value={rows.length} />
        <StatTile label="Beschikbaar" value={available} />
        <StatTile label="Vraagprijs (beschikbaar)" value={formatEUR(portfolioValue)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen panden"
          description="Voeg vastgoed toe dat Habitat One in de verkoop heeft."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Pand</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Locatie</Th>
                <Th className="text-right">Slaapk.</Th>
                <Th className="text-right">m²</Th>
                <Th className="text-right">Vraagprijs</Th>
                <Th>Bijgewerkt</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium">
                    <Link href={`/properties/${p.id}`} className="hover:underline">
                      {p.title}
                    </Link>
                    {p.reference && (
                      <span className="block text-xs text-muted">{p.reference}</span>
                    )}
                  </Td>
                  <Td className="text-muted">{propertyTypeMeta[p.type]}</Td>
                  <Td>
                    <Badge tone={propertyStatusMeta[p.status].tone}>
                      {propertyStatusMeta[p.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{p.location ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{p.bedrooms ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{p.builtSqm ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(p.priceEur)}</Td>
                  <Td className="text-muted">{formatDate(p.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
