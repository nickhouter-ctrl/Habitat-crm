import { desc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
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
import { deals } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, dealTypeMeta } from "../_meta";

export const metadata = { title: "Deals & projecten" };

export default async function DealsPage() {
  const rows = await db.query.deals.findMany({
    orderBy: desc(deals.updatedAt),
    limit: 200,
    with: {
      contact: { columns: { id: true, name: true } },
      property: { columns: { id: true, title: true } },
      owner: { columns: { name: true } },
    },
  });

  const isOpen = (stage: string) => stage !== "won" && stage !== "lost";
  const openValue = rows
    .filter((d) => isOpen(d.stage))
    .reduce((sum, d) => sum + Number(d.valueEur ?? 0), 0);
  const wonValue = rows
    .filter((d) => d.stage === "won")
    .reduce((sum, d) => sum + Number(d.valueEur ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Deals & projecten"
        subtitle="Renovaties, nieuwbouw, materiaallevering en verkoop"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Totaal" value={rows.length} />
        <StatTile label="Open" value={rows.filter((d) => isOpen(d.stage)).length} />
        <StatTile label="Pijplijnwaarde" value={formatEUR(openValue)} />
        <StatTile label="Gewonnen (waarde)" value={formatEUR(wonValue)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen deals"
          description="Deals koppelen contacten, panden en documenten aan elkaar met een fase en waarde."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Deal</Th>
                <Th>Type</Th>
                <Th>Fase</Th>
                <Th>Contact</Th>
                <Th>Pand</Th>
                <Th className="text-right">Waarde</Th>
                <Th>Verwachte sluiting</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium">{d.title}</Td>
                  <Td className="text-muted">{dealTypeMeta[d.type]}</Td>
                  <Td>
                    <Badge tone={dealStageMeta[d.stage].tone}>
                      {dealStageMeta[d.stage].label}
                    </Badge>
                  </Td>
                  <Td>
                    {d.contact ? (
                      <Link
                        href={`/contacts/${d.contact.id}`}
                        className="hover:underline"
                      >
                        {d.contact.name}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-muted">{d.property?.title ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(d.valueEur)}</Td>
                  <Td className="text-muted">{formatDate(d.expectedCloseDate)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
