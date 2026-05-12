import { and, desc, eq } from "drizzle-orm";
import { Mail, MapPin, Phone } from "lucide-react";
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
  Th,
  THead,
  Textarea,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  activities,
  contacts,
  deals,
  documents,
  holdedSyncMap,
} from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { addContactNote } from "../actions";
import {
  contactTypeMeta,
  dealStageMeta,
  documentKindMeta,
  documentStatusMeta,
  languageMeta,
  leadStageMeta,
} from "../../_meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    columns: { name: true },
  });
  return { title: contact?.name ?? "Contact" };
}

function InfoRow({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted" />
      <span>{children}</span>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    with: {
      owner: { columns: { name: true, email: true } },
      company: { columns: { id: true, name: true } },
    },
  });
  if (!contact) notFound();

  const [relatedDeals, relatedDocs, timeline, holdedMap] = await Promise.all([
    db.query.deals.findMany({
      where: eq(deals.contactId, id),
      orderBy: desc(deals.updatedAt),
    }),
    db.query.documents.findMany({
      where: eq(documents.contactId, id),
      orderBy: desc(documents.createdAt),
    }),
    db.query.activities.findMany({
      where: eq(activities.contactId, id),
      orderBy: desc(activities.createdAt),
      limit: 50,
      with: { author: { columns: { name: true } } },
    }),
    db.query.holdedSyncMap.findFirst({
      where: and(
        eq(holdedSyncMap.entityType, "contact"),
        eq(holdedSyncMap.localId, id),
      ),
    }),
  ]);

  async function submitNote(formData: FormData) {
    "use server";
    await addContactNote(id, String(formData.get("body") ?? ""));
  }

  const addressParts = [
    contact.addressLine,
    [contact.postalCode, contact.city].filter(Boolean).join(" "),
    contact.province,
    contact.country,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {contact.name}
            {contact.type === "lead" ? (
              <Badge tone={leadStageMeta[contact.stage].tone}>
                {leadStageMeta[contact.stage].label}
              </Badge>
            ) : (
              <Badge tone={contactTypeMeta[contact.type].tone}>
                {contactTypeMeta[contact.type].label}
              </Badge>
            )}
          </span>
        }
        subtitle={
          <>
            {contact.jobTitle ? `${contact.jobTitle} · ` : ""}
            {contact.company ? (
              <Link href={`/contacts?q=${encodeURIComponent(contact.company.name)}`}>
                {contact.company.name}
              </Link>
            ) : (
              "Geen bedrijf"
            )}
          </>
        }
        actions={
          <Link href="/contacts" className="text-sm text-muted hover:underline">
            ← Contacten
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {contact.email ? (
                <InfoRow icon={Mail}>
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </InfoRow>
              ) : null}
              {contact.mobile || contact.phone ? (
                <InfoRow icon={Phone}>
                  {contact.mobile ?? contact.phone}
                  {contact.mobile && contact.phone ? ` · ${contact.phone}` : ""}
                </InfoRow>
              ) : null}
              {addressParts.length > 0 && (
                <InfoRow icon={MapPin}>{addressParts.join(", ")}</InfoRow>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-sm">
                <dt className="text-muted">Eigenaar</dt>
                <dd>{contact.owner?.name ?? "—"}</dd>
                <dt className="text-muted">Taal</dt>
                <dd>
                  {contact.preferredLanguage
                    ? languageMeta[contact.preferredLanguage]
                    : "—"}
                </dd>
                <dt className="text-muted">Bron</dt>
                <dd>{contact.source ?? "—"}</dd>
                <dt className="text-muted">Laatste contact</dt>
                <dd>{formatDate(contact.lastContactedAt)}</dd>
                <dt className="text-muted">Aangemaakt</dt>
                <dd>{formatDate(contact.createdAt)}</dd>
              </dl>
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {contact.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {contact.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notitie</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {contact.notes}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Holded</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {holdedMap ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-muted">Holded-id</dt>
                  <dd className="font-mono text-xs">{holdedMap.holdedId}</dd>
                  <dt className="text-muted">Laatste sync</dt>
                  <dd>{formatDate(holdedMap.lastSyncedAt)}</dd>
                  <dt className="text-muted">Richting</dt>
                  <dd>{holdedMap.lastSyncDirection ?? "—"}</dd>
                </dl>
              ) : (
                <p className="text-muted">Nog niet gekoppeld aan Holded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: deals, documents, timeline */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Deals & projecten</CardTitle>
              <LinkButton
                href={`/deals/new?contactId=${contact.id}`}
                variant="secondary"
                size="sm"
              >
                Nieuwe deal
              </LinkButton>
            </CardHeader>
            {relatedDeals.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen gekoppelde deals.</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Deal</Th>
                    <Th>Fase</Th>
                    <Th className="text-right">Waarde</Th>
                  </tr>
                </THead>
                <TBody>
                  {relatedDeals.map((d) => (
                    <Tr key={d.id}>
                      <Td className="font-medium">
                        <Link href={`/deals/${d.id}`} className="hover:underline">
                          {d.title}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={dealStageMeta[d.stage].tone}>
                          {dealStageMeta[d.stage].label}
                        </Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatEUR(d.valueEur)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Offertes & facturen</CardTitle>
              <div className="flex gap-1.5">
                <LinkButton
                  href={`/documents/new?kind=estimate&contactId=${contact.id}`}
                  variant="secondary"
                  size="sm"
                >
                  Nieuwe offerte
                </LinkButton>
                <LinkButton
                  href={`/documents/new?kind=invoice&contactId=${contact.id}`}
                  variant="secondary"
                  size="sm"
                >
                  Nieuwe factuur
                </LinkButton>
              </div>
            </CardHeader>
            {relatedDocs.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen documenten.</p>
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
                      <Td className="text-right tabular-nums">
                        {formatEUR(doc.totalEur)}
                      </Td>
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
                  placeholder="Notitie toevoegen (gesprek, afspraak, …)"
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
                        <span className="font-medium uppercase tracking-wide">
                          {a.type}
                        </span>
                        <span>·</span>
                        <span>{formatDate(a.createdAt)}</span>
                        {a.author?.name && (
                          <>
                            <span>·</span>
                            <span>{a.author.name}</span>
                          </>
                        )}
                      </div>
                      {a.subject && (
                        <p className="text-sm font-medium">{a.subject}</p>
                      )}
                      {a.body && (
                        <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                      )}
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
