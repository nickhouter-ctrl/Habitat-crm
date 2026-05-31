import { desc, eq, inArray } from "drizzle-orm";
import { Trash2 } from "lucide-react";

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
import { documentKindMeta, documentStatusMeta } from "./_meta";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { RowLink, StopLink } from "@/components/row-link";
import { deleteDocument } from "./documents/actions";

type Kind =
  | "estimate"
  | "invoice"
  | "proforma"
  | "creditnote"
  | "salesreceipt"
  | "deliverynote";

export async function DocumentsList({
  kind,
  title,
  subtitle,
  newLabel,
}: {
  kind: Kind | Kind[];
  title: string;
  subtitle: string;
  newLabel: string;
}) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const primaryKind = kinds[0];
  const showKindColumn = kinds.length > 1;

  const rows = await db.query.documents.findMany({
    where: kinds.length === 1 ? eq(documents.kind, primaryKind) : inArray(documents.kind, kinds),
    orderBy: [desc(documents.issueDate), desc(documents.createdAt)],
    limit: 300,
    with: {
      contact: { columns: { id: true, name: true } },
      company: { columns: { id: true, name: true } },
    },
  });

  const sign = (k: Kind) => (k === "creditnote" ? -1 : 1);
  const totalEx = rows.reduce((s, d) => s + sign(d.kind) * Number(d.subtotalEur ?? 0), 0);
  const totalIncl = rows.reduce((s, d) => s + sign(d.kind) * Number(d.totalEur ?? 0), 0);
  const paid = rows.reduce((s, d) => s + sign(d.kind) * Number(d.paidEur ?? 0), 0);
  const outstanding = rows
    .filter((d) => d.kind !== "creditnote" && d.status !== "paid" && d.status !== "void")
    .reduce((s, d) => s + (Number(d.totalEur ?? 0) - Number(d.paidEur ?? 0)), 0);

  const newHref = `/documents/new?kind=${primaryKind}`;

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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Aantal" value={rows.length} />
        <StatTile label="Totaal ex. BTW" value={formatEUR(totalEx)} hint={showKindColumn ? "fact. − creditnota's" : undefined} />
        <StatTile label="Totaal incl. BTW" value={formatEUR(totalIncl)} hint="met BTW" />
        <StatTile label="Betaald" value={formatEUR(paid)} hint="incl. BTW" />
        <StatTile label="Openstaand" value={formatEUR(outstanding)} hint="incl. BTW" />
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
                {showKindColumn && <Th>Type</Th>}
                <Th>Klant</Th>
                <Th>Status</Th>
                <Th>Datum</Th>
                <Th>Vervaldatum</Th>
                <Th className="text-right">Subtotaal</Th>
                <Th className="text-right">Totaal</Th>
                <Th className="text-right">Betaald</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((d) => {
                const partyName = d.contact?.name ?? d.company?.name ?? "—";
                return (
                  <RowLink key={d.id} href={`/documents/${d.id}`}>
                    <Td className="font-medium">
                      {d.docNumber ?? "(geen nr.)"}
                      {d.title && (
                        <span className="block text-xs text-muted">{d.title}</span>
                      )}
                    </Td>
                    {showKindColumn && (
                      <Td>
                        <Badge tone={d.kind === "creditnote" ? "warning" : "neutral"}>
                          {documentKindMeta[d.kind]}
                        </Badge>
                      </Td>
                    )}
                    <Td>
                      {d.contact ? (
                        <StopLink href={`/contacts/${d.contact.id}`} className="hover:underline">
                          {partyName}
                        </StopLink>
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
                    <Td className="text-right">
                      {(d.kind === "estimate" || d.status === "draft") && (
                        <form action={deleteDocument.bind(null, d.id)}>
                          <ConfirmSubmit
                            message={`${documentKindMeta[d.kind]} ${d.docNumber ?? ""} definitief verwijderen?`}
                            className="rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </ConfirmSubmit>
                        </form>
                      )}
                    </Td>
                  </RowLink>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
