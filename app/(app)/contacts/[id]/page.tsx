import { and, desc, eq, inArray } from "drizzle-orm";
import { ChevronRight, Mail, MapPin, Phone } from "lucide-react";
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
  StatTile,
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
  documents,
  holdedSyncMap,
  projects,
} from "@/lib/db/schema";
import { cn, formatDate, formatEUR } from "@/lib/utils";
import { normalizeDocItems } from "@/lib/documents";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ReminderButton } from "@/components/reminder-button";
import { addContactNote, deleteContact } from "../actions";
import {
  contactTypeMeta,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    with: {
      owner: { columns: { name: true, email: true } },
      company: { columns: { id: true, name: true } },
    },
  });
  if (!contact) notFound();

  const [relatedProjects, relatedDocs, timeline, holdedMap] = await Promise.all([
    db.query.projects.findMany({
      where: eq(projects.contactId, id),
      orderBy: desc(projects.updatedAt),
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

  // KPI's uit de documenten van dit contact.
  const num = (v: unknown) => Number(v ?? 0);
  const estimates = relatedDocs.filter((d) => d.kind === "estimate");
  const invoices = relatedDocs.filter((d) => d.kind === "invoice" && d.status !== "void");
  const creditnotes = relatedDocs.filter((d) => d.kind === "creditnote" && d.status !== "void");
  // Omzet = verstuurde/betaalde facturen − creditnota's (incl. BTW).
  const omzet =
    invoices.filter((d) => d.status !== "draft").reduce((s, d) => s + num(d.totalEur), 0) -
    creditnotes.reduce((s, d) => s + num(d.totalEur), 0);
  const openstaand = invoices
    .filter((d) => d.status !== "paid")
    .reduce((s, d) => s + (num(d.totalEur) - num(d.paidEur)), 0);
  const geoffreerd = estimates
    .filter((d) => d.status !== "rejected" && d.status !== "void")
    .reduce((s, d) => s + num(d.totalEur), 0);
  // Conversie: offertes die tot een factuur leidden (via bron-offerte-koppeling).
  const invoicedEstimateIds = new Set(
    invoices.map((d) => d.sourceDocumentId).filter(Boolean) as string[],
  );
  const conversie = estimates.length
    ? Math.round((invoicedEstimateIds.size / estimates.length) * 100)
    : 0;
  const isZakelijk = !!contact.company;

  const TABS = [
    { key: "overzicht", label: "Overzicht" },
    { key: "offertes", label: "Offertes" },
    { key: "facturen", label: "Facturen" },
    { key: "pakbonnen", label: "Pakbonnen" },
    { key: "projecten", label: "Projecten" },
  ] as const;
  type Tab = (typeof TABS)[number]["key"];
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overzicht";
  const offertesList = relatedDocs.filter((d) => d.kind === "estimate");
  const facturenList = relatedDocs.filter((d) => d.kind === "invoice" || d.kind === "creditnote");
  const pakbonnenList = relatedDocs.filter((d) => d.kind === "deliverynote");

  // Documenten per project (voor de uitklapbare Projecten-tab).
  const projectIds = relatedProjects.map((p) => p.id);
  const projectDocs = projectIds.length
    ? await db.query.documents.findMany({
        where: inArray(documents.projectId, projectIds),
        columns: {
          id: true,
          projectId: true,
          kind: true,
          status: true,
          docNumber: true,
          totalEur: true,
          issueDate: true,
          items: true,
          sourceDocumentId: true,
        },
        orderBy: desc(documents.issueDate),
      })
    : [];
  const docsByProject = new Map<string, typeof projectDocs>();
  for (const d of projectDocs) {
    if (!d.projectId) continue;
    const arr = docsByProject.get(d.projectId);
    if (arr) arr.push(d);
    else docsByProject.set(d.projectId, [d]);
  }
  // Producten per project (uit factuurregels − creditnota's).
  const productsForProject = (pid: string) => {
    const m = new Map<string, { name: string; units: number }>();
    for (const d of docsByProject.get(pid) ?? []) {
      if (d.kind !== "invoice" && d.kind !== "creditnote") continue;
      const sign = d.kind === "creditnote" ? -1 : 1;
      for (const it of normalizeDocItems(d.items)) {
        const key = it.productId || it.description?.trim() || it.name?.trim();
        if (!key || !it.units) continue;
        const e = m.get(key) ?? { name: (it.name || it.description || "—").trim(), units: 0 };
        e.units += sign * (Number(it.units) || 0);
        m.set(key, e);
      }
    }
    return [...m.values()].filter((p) => Math.abs(p.units) > 0.001);
  };
  const tabHref = (key: Tab) => (key === "overzicht" ? `/contacts/${id}` : `/contacts/${id}?tab=${key}`);

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
            <Badge tone={isZakelijk ? "info" : "neutral"}>
              {isZakelijk ? "Zakelijk" : "Particulier"}
            </Badge>
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
          <>
            <Link href="/contacts" className="text-sm text-muted hover:underline">
              ← Contacten
            </Link>
            <LinkButton href={`/contacts/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
            <form action={deleteContact.bind(null, id)} className="contents">
              <ConfirmSubmit
                message={`Contact "${contact.name}" definitief verwijderen?`}
                className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
              >
                Verwijderen
              </ConfirmSubmit>
            </form>
          </>
        }
      />

      {sp.verwijderen === "facturen" && (
        <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          Dit contact kan niet verwijderd worden — er hangen nog verstuurde of betaalde
          facturen aan. Verwijder of ontkoppel die eerst.
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Totale omzet" value={formatEUR(omzet)} hint="gefactureerd, incl. BTW" tone="success" />
        <StatTile label="Openstaand" value={formatEUR(openstaand)} hint="te ontvangen" tone={openstaand > 0 ? "warning" : "neutral"} />
        <StatTile label="Totaal geoffreerd" value={formatEUR(geoffreerd)} hint="lopende offertes" />
        <StatTile label="Offertes" value={String(estimates.length)} hint={`${invoicedEstimateIds.size} gefactureerd`} />
        <StatTile label="Conversie" value={`${conversie}%`} hint="offerte → factuur" tone="info" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const cnt =
            t.key === "offertes"
              ? offertesList.length
              : t.key === "facturen"
                ? facturenList.length
                : t.key === "pakbonnen"
                  ? pakbonnenList.length
                  : t.key === "projecten"
                    ? relatedProjects.length
                    : 0;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
              {cnt > 0 ? ` (${cnt})` : ""}
            </Link>
          );
        })}
      </div>

      {tab === "offertes" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Offertes</CardTitle>
            <LinkButton href={`/documents/new?kind=estimate&contactId=${contact.id}`} variant="secondary" size="sm">
              Nieuwe offerte
            </LinkButton>
          </CardHeader>
          {offertesList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen offertes voor deze klant.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Nr.</Th>
                  <Th>Status</Th>
                  <Th>Datum</Th>
                  <Th className="text-right">Totaal</Th>
                </tr>
              </THead>
              <TBody>
                {offertesList.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.docNumber ?? "(geen nr.)"}
                      </Link>
                    </Td>
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
      )}

      {tab === "facturen" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Facturen</CardTitle>
            <LinkButton href={`/documents/new?kind=invoice&contactId=${contact.id}`} variant="secondary" size="sm">
              Nieuwe factuur
            </LinkButton>
          </CardHeader>
          {facturenList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen facturen voor deze klant.</p>
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
                  <Th className="text-right">Betaald</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {facturenList.map((doc) => (
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
                    <Td className="text-right tabular-nums text-muted">{formatEUR(doc.paidEur)}</Td>
                    <Td className="text-right">
                      {doc.kind === "invoice" &&
                        doc.status !== "paid" &&
                        doc.status !== "void" &&
                        doc.status !== "draft" &&
                        num(doc.totalEur) - num(doc.paidEur) > 0.01 && (
                          <ReminderButton documentId={doc.id} />
                        )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "pakbonnen" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Pakbonnen</CardTitle>
          </CardHeader>
          {pakbonnenList.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen pakbonnen voor deze klant.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Nr.</Th>
                  <Th>Status</Th>
                  <Th>Datum</Th>
                  <Th className="text-right">Afgeleverd</Th>
                </tr>
              </THead>
              <TBody>
                {pakbonnenList.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.docNumber ?? "(geen nr.)"}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={documentStatusMeta[doc.status].tone}>
                        {documentStatusMeta[doc.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{formatDate(doc.issueDate)}</Td>
                    <Td className="text-right text-muted">
                      {doc.stockAppliedAt ? formatDate(doc.stockAppliedAt) : "—"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "projecten" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Projecten</CardTitle>
            <LinkButton href="/projects/new" variant="secondary" size="sm">
              Nieuw project
            </LinkButton>
          </CardHeader>
          {relatedProjects.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen gekoppelde projecten.</p>
            </CardContent>
          ) : (
            <div className="divide-y">
              {relatedProjects.map((p) => {
                const docs = docsByProject.get(p.id) ?? [];
                // Per bron-offerte: hoeveel is er al gefactureerd?
                const invoicedByEst = new Map<string, number>();
                for (const d of docs) {
                  if (d.kind === "invoice" && d.status !== "void" && d.sourceDocumentId) {
                    invoicedByEst.set(
                      d.sourceDocumentId,
                      (invoicedByEst.get(d.sourceDocumentId) ?? 0) + Number(d.totalEur ?? 0),
                    );
                  }
                }
                // Verberg offertes die al volledig gefactureerd zijn (de factuur staat er al).
                const visibleDocs = docs.filter((d) => {
                  if (d.kind !== "estimate") return true;
                  return (invoicedByEst.get(d.id) ?? 0) < Number(d.totalEur ?? 0) - 0.01;
                });
                const prods = productsForProject(p.id);
                return (
                  <details key={p.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 hover:bg-background">
                      <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                      <span className="font-medium">{p.name}</span>
                      {p.code ? <span className="text-xs text-muted">{p.code}</span> : null}
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>
                        {p.status === "active" ? "Actief" : "Gearchiveerd"}
                      </Badge>
                      <span className="ml-auto text-xs text-muted">
                        {visibleDocs.length} doc{visibleDocs.length === 1 ? "" : "en"}
                      </span>
                    </summary>
                    <div className="space-y-3 bg-background/40 px-5 pb-4 pt-1">
                      {visibleDocs.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                            Documenten
                          </p>
                          <ul className="space-y-1 text-sm">
                            {visibleDocs.map((d) => (
                              <li key={d.id} className="flex flex-wrap items-center gap-2">
                                <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                                  {d.docNumber ?? documentKindMeta[d.kind]}
                                </Link>
                                <span className="text-muted">{documentKindMeta[d.kind]}</span>
                                <Badge tone={documentStatusMeta[d.status].tone}>
                                  {documentStatusMeta[d.status].label}
                                </Badge>
                                <span className="ml-auto tabular-nums">{formatEUR(d.totalEur)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prods.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                            Producten (verkocht)
                          </p>
                          <ul className="space-y-0.5 text-sm">
                            {prods.map((pr, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="truncate">{pr.name}</span>
                                <span className="shrink-0 tabular-nums text-muted">{pr.units}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-block text-sm font-medium text-accent hover:underline"
                      >
                        Open project →
                      </Link>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "overzicht" && (
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

        {/* Right: timeline */}
        <div className="space-y-4 lg:col-span-2">
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
      )}
    </>
  );
}
