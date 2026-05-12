import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Textarea,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { activities, deals, documents } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { addDealNote } from "../actions";
import {
  dealStageMeta,
  dealTypeMeta,
  documentKindMeta,
  documentStatusMeta,
} from "../../_meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, id),
    columns: { title: true },
  });
  return { title: deal?.title ?? "Deal" };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, id),
    with: {
      contact: { columns: { id: true, name: true } },
      property: { columns: { id: true, title: true } },
      owner: { columns: { name: true } },
    },
  });
  if (!deal) notFound();

  const [relatedDocs, timeline] = await Promise.all([
    db.query.documents.findMany({
      where: eq(documents.dealId, id),
      orderBy: desc(documents.createdAt),
    }),
    db.query.activities.findMany({
      where: eq(activities.dealId, id),
      orderBy: desc(activities.createdAt),
      limit: 50,
      with: { author: { columns: { name: true } } },
    }),
  ]);

  async function submitNote(formData: FormData) {
    "use server";
    await addDealNote(id, String(formData.get("body") ?? ""));
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {deal.title}
            <Badge tone={dealStageMeta[deal.stage].tone}>
              {dealStageMeta[deal.stage].label}
            </Badge>
          </span>
        }
        subtitle={dealTypeMeta[deal.type]}
        actions={
          <>
            <Link href="/deals" className="text-sm text-muted hover:underline">
              ← Deals
            </Link>
            <LinkButton href={`/deals/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Waarde</dt>
                <dd className="font-medium tabular-nums">{formatEUR(deal.valueEur)}</dd>
                <dt className="text-muted">Kans</dt>
                <dd>{deal.probability}%</dd>
                <dt className="text-muted">Contact</dt>
                <dd>
                  {deal.contact ? (
                    <Link href={`/contacts/${deal.contact.id}`} className="hover:underline">
                      {deal.contact.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Pand</dt>
                <dd>
                  {deal.property ? (
                    <Link href={`/properties/${deal.property.id}`} className="hover:underline">
                      {deal.property.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Eigenaar</dt>
                <dd>{deal.owner?.name ?? "—"}</dd>
                <dt className="text-muted">Verwachte sluiting</dt>
                <dd>{formatDate(deal.expectedCloseDate)}</dd>
                <dt className="text-muted">Gesloten</dt>
                <dd>{formatDate(deal.closedAt)}</dd>
                <dt className="text-muted">Aangemaakt</dt>
                <dd>{formatDate(deal.createdAt)}</dd>
              </dl>
            </CardContent>
          </Card>

          {deal.description && (
            <Card>
              <CardHeader>
                <CardTitle>Omschrijving</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {deal.description}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Offertes & facturen</CardTitle>
              <div className="flex gap-1.5">
                <LinkButton
                  href={`/documents/new?kind=estimate&dealId=${deal.id}${deal.contactId ? `&contactId=${deal.contactId}` : ""}${deal.propertyId ? `&propertyId=${deal.propertyId}` : ""}`}
                  variant="secondary"
                  size="sm"
                >
                  Nieuwe offerte
                </LinkButton>
                <LinkButton
                  href={`/documents/new?kind=invoice&dealId=${deal.id}${deal.contactId ? `&contactId=${deal.contactId}` : ""}`}
                  variant="secondary"
                  size="sm"
                >
                  Nieuwe factuur
                </LinkButton>
              </div>
            </CardHeader>
            {relatedDocs.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen gekoppelde documenten.</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Nr.</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Datum</Th>
                    <Th className="text-right">Totaal</Th>
                  </tr>
                </THead>
                <TBody>
                  {relatedDocs.map((doc) => (
                    <Tr key={doc.id}>
                      <Td className="font-medium">
                        <Link href={`/documents/${doc.id}`} className="hover:underline">
                          {doc.docNumber ?? "(geen nr.)"}
                        </Link>
                      </Td>
                      <Td>{documentKindMeta[doc.kind]}</Td>
                      <Td>
                        <Badge tone={documentStatusMeta[doc.status].tone}>
                          {documentStatusMeta[doc.status].label}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{formatDate(doc.issueDate)}</Td>
                      <Td className="text-right tabular-nums">{formatEUR(doc.totalEur)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tijdlijn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={submitNote} className="space-y-2">
                <Textarea
                  name="body"
                  placeholder="Notitie toevoegen…"
                  required
                  className="min-h-20"
                />
                <Button type="submit" size="sm">
                  Notitie toevoegen
                </Button>
              </form>
              {timeline.length === 0 ? (
                <EmptyState title="Nog geen activiteiten" />
              ) : (
                <ol className="space-y-3">
                  {timeline.map((a) => (
                    <li key={a.id} className="border-l-2 border-border pl-3">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium uppercase tracking-wide">{a.type}</span>
                        <span>·</span>
                        <span>{formatDate(a.createdAt)}</span>
                        {a.author?.name && (
                          <>
                            <span>·</span>
                            <span>{a.author.name}</span>
                          </>
                        )}
                      </div>
                      {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
                      {a.body && <p className="whitespace-pre-wrap text-sm">{a.body}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
