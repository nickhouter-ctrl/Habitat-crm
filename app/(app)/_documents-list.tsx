import { desc, eq } from "drizzle-orm";
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
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { documentStatusMeta } from "./_meta";

type Kind = "estimate" | "invoice" | "proforma" | "creditnote" | "salesreceipt";

export async function DocumentsList({
  kind,
  title,
  subtitle,
  newLabel,
}: {
  kind: Kind;
  title: string;
  subtitle: string;
  newLabel: string;
}) {
  const rows = await db.query.documents.findMany({
    where: eq(documents.kind, kind),
    orderBy: [desc(documents.issueDate), desc(documents.createdAt)],
    limit: 300,
    with: {
      contact: { columns: { id: true, name: true } },
      company: { columns: { id: true, name: true } },
    },
  });

  const total = rows.reduce((s, d) => s + Number(d.totalEur ?? 0), 0);
  const outstanding = rows
    .filter((d) => d.status !== "paid" && d.status !== "void")
    .reduce((s, d) => s + (Number(d.totalEur ?? 0) - Number(d.paidEur ?? 0)), 0);

  const newHref = `/documents/new?kind=${kind}`;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <SyncHoldedButton />
            <LinkButton href={newHref}>{newLabel}</LinkButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Aantal" value={rows.length} />
        <StatTile label="Totaalbedrag" value={formatEUR(total)} />
        <StatTile label="Openstaand" value={formatEUR(outstanding)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`Nog geen ${title.toLowerCase()}`}
          description="Maak er een aan, of synchroniseer met Holded om bestaande documenten op te halen."
          action={<LinkButton href={newHref}>{newLabel}</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Nr.</Th>
                <Th>Klant</Th>
                <Th>Status</Th>
                <Th>Datum</Th>
                <Th>Vervaldatum</Th>
                <Th className="text-right">Subtotaal</Th>
                <Th className="text-right">Totaal</Th>
                <Th className="text-right">Betaald</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((d) => {
                const partyName = d.contact?.name ?? d.company?.name ?? "—";
                return (
                  <Tr key={d.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${d.id}`} className="hover:underline">
                        {d.docNumber ?? "(geen nr.)"}
                      </Link>
                      {d.title && (
                        <span className="block text-xs text-muted">{d.title}</span>
                      )}
                    </Td>
                    <Td>
                      {d.contact ? (
                        <Link href={`/contacts/${d.contact.id}`} className="hover:underline">
                          {partyName}
                        </Link>
                      ) : (
                        <span className="text-muted">{partyName}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={documentStatusMeta[d.status].tone}>
                        {documentStatusMeta[d.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(d.issueDate)}</Td>
                    <Td className="text-muted">{formatDate(d.dueDate)}</Td>
                    <Td className="text-right tabular-nums">{formatEUR(d.subtotalEur)}</Td>
                    <Td className="text-right tabular-nums font-medium">
                      {formatEUR(d.totalEur)}
                    </Td>
                    <Td className="text-right tabular-nums text-muted">
                      {formatEUR(d.paidEur)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
