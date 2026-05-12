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
import { DealsBoard, type BoardDeal } from "@/components/deals-board";
import { db } from "@/lib/db";
import { deals } from "@/lib/db/schema";
import { cn, formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, dealTypeMeta } from "../_meta";

export const metadata = { title: "Deals & projecten" };

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";

  const rows = await db.query.deals.findMany({
    orderBy: desc(deals.updatedAt),
    limit: 500,
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

  const boardDeals: BoardDeal[] = rows.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    stage: d.stage,
    valueEur: d.valueEur,
    probability: d.probability,
    contactName: d.contact?.name ?? null,
  }));

  const toggle = (
    <div className="flex rounded-md border bg-surface p-0.5 text-sm">
      <Link
        href="/deals"
        className={cn(
          "rounded px-2.5 py-1",
          view === "board" ? "bg-accent/10 font-medium text-accent" : "text-muted hover:text-foreground",
        )}
      >
        Bord
      </Link>
      <Link
        href="/deals?view=list"
        className={cn(
          "rounded px-2.5 py-1",
          view === "list" ? "bg-accent/10 font-medium text-accent" : "text-muted hover:text-foreground",
        )}
      >
        Lijst
      </Link>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Deals & projecten"
        subtitle="Sleep een kaart naar de volgende fase om de pipeline bij te werken"
        actions={
          <>
            {toggle}
            <LinkButton href="/deals/new">Nieuwe deal</LinkButton>
          </>
        }
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
          description="Een deal koppelt een klant, een pand en offertes/facturen aan elkaar met een fase en waarde. Bij een nieuwe lead wordt er automatisch een deal aangemaakt."
          action={<LinkButton href="/deals/new">Nieuwe deal</LinkButton>}
        />
      ) : view === "board" ? (
        <DealsBoard deals={boardDeals} />
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
                  <Td className="font-medium">
                    <Link href={`/deals/${d.id}`} className="hover:underline">
                      {d.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">{dealTypeMeta[d.type]}</Td>
                  <Td>
                    <Badge tone={dealStageMeta[d.stage].tone}>{dealStageMeta[d.stage].label}</Badge>
                  </Td>
                  <Td>
                    {d.contact ? (
                      <Link href={`/contacts/${d.contact.id}`} className="hover:underline">
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
