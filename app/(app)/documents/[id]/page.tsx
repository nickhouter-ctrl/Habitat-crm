import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { documents, holdedSyncMap } from "@/lib/db/schema";
import { lineNet, lineTax } from "@/lib/documents";
import { labelForCategory } from "@/lib/products";
import { formatDate, formatEUR } from "@/lib/utils";
import {
  createDeliveryNoteFromDocument,
  createInvoiceFromEstimate,
  deleteDocument,
  sendDocument,
  setDocumentStatus,
} from "../actions";
import { documentKindMeta, documentStatusMeta } from "../../_meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { docNumber: true, kind: true, title: true },
  });
  return {
    title: doc ? `${documentKindMeta[doc.kind]} ${doc.docNumber ?? ""}`.trim() : "Document",
  };
}

const STATUS_OPTIONS = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: { columns: { id: true, name: true, email: true } },
      company: { columns: { id: true, name: true } },
      deal: { columns: { id: true, title: true } },
      property: { columns: { id: true, title: true } },
    },
  });
  if (!doc) notFound();

  const holdedMap = await db.query.holdedSyncMap.findFirst({
    where: and(eq(holdedSyncMap.entityType, "document"), eq(holdedSyncMap.localId, id)),
  });

  const items = doc.items ?? [];
  const partyName = doc.contact?.name ?? doc.company?.name ?? null;
  const kindLabel = documentKindMeta[doc.kind];

  const changeStatus = setDocumentStatus.bind(null, id);
  const removeDoc = deleteDocument.bind(null, id);
  const send = sendDocument.bind(null, id);
  const makeInvoice = createInvoiceFromEstimate.bind(null, id);
  const makeDeliveryNote = createDeliveryNoteFromDocument.bind(null, id);

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const publicUrl = doc.acceptToken ? `${proto}://${host}/offerte/${doc.acceptToken}` : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {kindLabel} {doc.docNumber ?? ""}
            <Badge tone={documentStatusMeta[doc.status].tone}>
              {documentStatusMeta[doc.status].label}
            </Badge>
          </span>
        }
        subtitle={doc.title ?? (partyName ? `Voor ${partyName}` : undefined)}
        actions={
          <>
            <Link href={doc.kind === "invoice" ? "/invoices" : "/quotes"} className="text-sm text-muted hover:underline">
              ← Terug
            </Link>
            <a
              href={`/documents/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              PDF
            </a>
            <LinkButton href={`/documents/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Klant</dt>
                <dd>
                  {doc.contact ? (
                    <Link href={`/contacts/${doc.contact.id}`} className="hover:underline">
                      {doc.contact.name}
                    </Link>
                  ) : (
                    partyName ?? "—"
                  )}
                </dd>
                <dt className="text-muted">Deal</dt>
                <dd>
                  {doc.deal ? (
                    <Link href={`/deals/${doc.deal.id}`} className="hover:underline">
                      {doc.deal.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Pand</dt>
                <dd>
                  {doc.property ? (
                    <Link href={`/properties/${doc.property.id}`} className="hover:underline">
                      {doc.property.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Datum</dt>
                <dd>{formatDate(doc.issueDate)}</dd>
                <dt className="text-muted">Vervaldatum</dt>
                <dd>{formatDate(doc.dueDate)}</dd>
                <dt className="text-muted">Betaald</dt>
                <dd className="tabular-nums">{formatEUR(doc.paidEur)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versturen & status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <form action={send}>
                <Button type="submit" size="sm">
                  {doc.sentAt ? "Opnieuw versturen" : "Versturen naar klant"}
                </Button>
              </form>

              {doc.sentAt && (
                <div className="space-y-1.5 rounded-md bg-background px-3 py-2">
                  <p className="text-muted">
                    Verstuurd op <span className="text-foreground">{formatDate(doc.sentAt)}</span>
                  </p>
                  {publicUrl && (
                    <p className="break-all">
                      Klant-link:{" "}
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {publicUrl}
                      </a>
                    </p>
                  )}
                  {doc.acceptedAt ? (
                    <p className="font-medium text-success">
                      ✓ Geaccepteerd door klant op {formatDate(doc.acceptedAt)}
                    </p>
                  ) : doc.rejectedAt ? (
                    <p className="text-danger">
                      Afgewezen op {formatDate(doc.rejectedAt)}
                      {doc.rejectReason ? ` — ${doc.rejectReason}` : ""}
                    </p>
                  ) : (
                    <p className="text-muted">Nog geen reactie van de klant.</p>
                  )}
                </div>
              )}

              {doc.kind === "estimate" && doc.acceptedAt && (
                <form action={makeInvoice}>
                  <Button type="submit" size="sm" variant="secondary">
                    → Maak factuur van deze offerte
                  </Button>
                </form>
              )}
              {doc.kind !== "deliverynote" && (
                <form action={makeDeliveryNote}>
                  <Button type="submit" size="sm" variant="secondary">
                    → Maak pakbon
                  </Button>
                </form>
              )}

              <form action={changeStatus} className="flex items-center gap-2 pt-1">
                <Select name="status" defaultValue={doc.status} className="flex-1">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {documentStatusMeta[s].label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" variant="secondary">
                  Status bijwerken
                </Button>
              </form>
              <form action={changeStatus}>
                <input type="hidden" name="status" value="paid" />
                <Button type="submit" size="sm" variant="ghost">
                  Markeer betaald
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Holded</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {holdedMap || doc.holdedId ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-muted">Holded-id</dt>
                  <dd className="font-mono text-xs">{holdedMap?.holdedId ?? doc.holdedId}</dd>
                  <dt className="text-muted">Laatste sync</dt>
                  <dd>{formatDate(holdedMap?.lastSyncedAt)}</dd>
                </dl>
              ) : (
                <p className="text-muted">
                  Nog niet naar Holded gepusht. (Komt zodra de Holded-koppeling actief is.)
                </p>
              )}
            </CardContent>
          </Card>

          <form action={removeDoc}>
            <button
              type="submit"
              className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
            >
              {kindLabel} verwijderen
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Regels</CardTitle>
            </CardHeader>
            {items.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen regels.</p>
              </CardContent>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <Th>Omschrijving</Th>
                      <Th>Categorie</Th>
                      <Th className="text-right">Aantal</Th>
                      <Th className="text-right">Prijs</Th>
                      <Th className="text-right">BTW%</Th>
                      <Th className="text-right">Netto</Th>
                      <Th className="text-right">BTW</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {items.map((it, i) => (
                      <Tr key={i}>
                        <Td>
                          <span className="font-medium">{it.name}</span>
                          {it.description && (
                            <span className="block text-xs text-muted">{it.description}</span>
                          )}
                        </Td>
                        <Td className="text-muted">{labelForCategory(it.category)}</Td>
                        <Td className="text-right tabular-nums">{it.units}</Td>
                        <Td className="text-right tabular-nums">{formatEUR(it.price)}</Td>
                        <Td className="text-right tabular-nums">{it.taxRate ?? 0}%</Td>
                        <Td className="text-right tabular-nums">{formatEUR(lineNet(it))}</Td>
                        <Td className="text-right tabular-nums text-muted">
                          {formatEUR(lineTax(it))}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                <div className="border-t px-5 py-4">
                  <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Subtotaal</span>
                      <span className="tabular-nums">{formatEUR(doc.subtotalEur)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">BTW</span>
                      <span className="tabular-nums">{formatEUR(doc.taxEur)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 text-base font-semibold">
                      <span>Totaal</span>
                      <span className="tabular-nums">{formatEUR(doc.totalEur)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>

          {doc.notes && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Notities</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{doc.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
