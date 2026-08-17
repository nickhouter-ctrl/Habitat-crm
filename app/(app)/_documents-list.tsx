import { and, asc, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { Trash2 } from "lucide-react";
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
} from "@/components/ui";
import { SorteerbareKop } from "@/components/sorteerbare-kop";
import { SubmitButton } from "@/components/submit-button";
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { cn, formatDate, formatEUR } from "@/lib/utils";
import { documentKindMeta, documentStatusMeta } from "./_meta";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { RowLink, StopLink } from "@/components/row-link";
import { ReminderButton } from "@/components/reminder-button";
import { deleteDocument, setDeliveryNoteDelivered } from "./documents/actions";

type Kind =
  | "estimate"
  | "invoice"
  | "proforma"
  | "creditnote"
  | "fondos"
  | "salesreceipt"
  | "deliverynote";

/**
 * Sorteerbare kolommen. De sortering gebeurt in SQL en niet in JavaScript:
 * de lijst is afgekapt op 300 rijen, dus achteraf sorteren zou de verkeerde
 * 300 pakken — je zou "oudste eerst" vragen en de nieuwste 300 gesorteerd
 * terugkrijgen.
 */
const SORTEERBAAR = {
  docNumber: documents.docNumber,
  kind: documents.kind,
  // Klant zit in een relatie; via een subquery sorteert de database er wél op.
  klant: sql`coalesce(
    (select c.name from contacts c where c.id = ${documents.contactId}),
    (select b.name from companies b where b.id = ${documents.companyId})
  )`,
  status: documents.status,
  issueDate: documents.issueDate,
  dueDate: documents.dueDate,
  subtotalEur: documents.subtotalEur,
  totalEur: documents.totalEur,
  paidEur: documents.paidEur,
} as const;

type SorteerSleutel = keyof typeof SORTEERBAAR;

export async function DocumentsList({
  kind,
  title,
  subtitle,
  newLabel,
  searchParams,
}: {
  kind: Kind | Kind[];
  title: string;
  subtitle: string;
  newLabel: string;
  /** `sort` = kolomsleutel, `dir` = asc/desc. Leeg = nieuwste datum eerst. */
  searchParams?: Record<string, string | undefined>;
}) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const primaryKind = kinds[0];
  const showKindColumn = kinds.length > 1;

  const gevraagd = searchParams?.sort;
  const sorteerOp = (gevraagd && gevraagd in SORTEERBAAR ? gevraagd : null) as SorteerSleutel | null;
  const oplopend = searchParams?.dir === "asc";
  const richting = oplopend ? asc : desc;

  // Lege datums en bedragen altijd onderaan, ongeacht de richting — een rij
  // zonder factuurnummer bovenaan zetten helpt niemand bij het zoeken.
  const sortering: SQL[] = sorteerOp
    ? [sql`${richting(SORTEERBAAR[sorteerOp] as never)} nulls last`, desc(documents.createdAt)]
    : [sql`${desc(documents.issueDate)} nulls last`, desc(documents.createdAt)];

  // Filter op documentsoort: op de facturenpagina staan facturen en creditnota's
  // door elkaar, en soms wil je er maar één zien.
  const soortFilter = searchParams?.soort;
  const zichtbareKinds = soortFilter && kinds.includes(soortFilter as Kind) ? [soortFilter as Kind] : kinds;

  // Zoeken op nummer, omschrijving, klant of project. De klant- en projectnaam
  // staan in een andere tabel; met een subquery zoekt de DATABASE mee, zodat
  // ook een klant buiten de eerste 300 rijen gevonden wordt.
  const zoek = (searchParams?.q ?? "").trim();
  const zoekFilter = zoek
    ? sql`(
        ${documents.docNumber} ilike ${`%${zoek}%`}
        or ${documents.title} ilike ${`%${zoek}%`}
        or exists (select 1 from contacts c where c.id = ${documents.contactId} and c.name ilike ${`%${zoek}%`})
        or exists (select 1 from companies b where b.id = ${documents.companyId} and b.name ilike ${`%${zoek}%`})
        or exists (select 1 from projects p where p.id = ${documents.projectId} and p.name ilike ${`%${zoek}%`})
      )`
    : undefined;

  const rows = await db.query.documents.findMany({
    where: and(
      zichtbareKinds.length === 1
        ? eq(documents.kind, zichtbareKinds[0])
        : inArray(documents.kind, zichtbareKinds),
      zoekFilter,
    ),
    orderBy: sortering,
    limit: 300,
    with: {
      contact: { columns: { id: true, name: true } },
      company: { columns: { id: true, name: true } },
      project: { columns: { id: true, name: true } },
    },
  });

  /** Huidige URL met een paar parameters aangepast; lege waarde haalt hem weg. */
  const metParams = (wijziging: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...wijziging })) {
      if (v != null && v !== "") sp.set(k, v);
    }
    const q = sp.toString();
    return q ? `?${q}` : "?";
  };

  const SorteerKop = ({
    sleutel,
    children,
    className,
  }: {
    sleutel: SorteerSleutel;
    children: React.ReactNode;
    className?: string;
  }) => (
    <SorteerbareKop
      sleutel={sleutel}
      actief={sorteerOp === sleutel}
      oplopend={oplopend}
      aflopendEerst={["issueDate", "dueDate", "subtotalEur", "totalEur", "paidEur"].includes(sleutel)}
      href={(s, richting) => metParams({ sort: s, dir: richting })}
      className={className}
    >
      {children}
    </SorteerbareKop>
  );

  // Welke offertes zijn al gefactureerd? (factuur verwijst via source_document_id)
  const invoicedEstimateIds = kinds.includes("estimate")
    ? new Set(
        (
          await db
            .select({ id: documents.sourceDocumentId })
            .from(documents)
            .where(
              and(
                eq(documents.kind, "invoice"),
                ne(documents.status, "void"),
                isNotNull(documents.sourceDocumentId),
              ),
            )
        )
          .map((r) => r.id)
          .filter(Boolean) as string[],
      )
    : new Set<string>();

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

      {/* Zoeken als GET-formulier: de zoekterm staat in de URL, dus een
          gesorteerde zoekopdracht is te delen en te bookmarken. De sortering
          reist mee als verborgen veld, anders val je bij zoeken terug op de
          standaardvolgorde. */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={zoek}
          placeholder="Zoek op nummer, omschrijving, klant of project…"
          className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {sorteerOp && <input type="hidden" name="sort" value={sorteerOp} />}
        {sorteerOp && <input type="hidden" name="dir" value={oplopend ? "asc" : "desc"} />}
        {soortFilter && <input type="hidden" name="soort" value={soortFilter} />}
        <SubmitButton size="sm" variant="secondary" pendingLabel="Zoeken…">
          Zoeken
        </SubmitButton>
        {zoek && (
          <Link href={metParams({ q: undefined })} className="text-sm text-muted hover:underline">
            wissen
          </Link>
        )}
        {zoek && (
          <span className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? "resultaat" : "resultaten"} voor “{zoek}”
          </span>
        )}
      </form>

      {showKindColumn && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted">Tonen</span>
          {[{ waarde: "", label: "Alles" }, ...kinds.map((k) => ({ waarde: k, label: documentKindMeta[k] }))].map(
            (optie) => {
              const actief = (soortFilter ?? "") === optie.waarde;
              return (
                <Link
                  key={optie.waarde || "alles"}
                  href={metParams({ soort: optie.waarde || undefined })}
                  className={cn(
                    "rounded-md border px-2.5 py-1 transition-colors",
                    actief ? "border-accent bg-accent/10 font-medium text-accent" : "text-muted hover:bg-background",
                  )}
                >
                  {optie.label}
                </Link>
              );
            },
          )}
        </div>
      )}

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
                <SorteerKop sleutel="docNumber">Nr.</SorteerKop>
                {showKindColumn && <SorteerKop sleutel="kind">Type</SorteerKop>}
                <SorteerKop sleutel="klant">Klant</SorteerKop>
                <SorteerKop sleutel="status">Status</SorteerKop>
                <SorteerKop sleutel="issueDate">Datum</SorteerKop>
                <SorteerKop sleutel="dueDate">Vervaldatum</SorteerKop>
                <SorteerKop sleutel="subtotalEur" className="text-right">Subtotaal</SorteerKop>
                <SorteerKop sleutel="totalEur" className="text-right">Totaal</SorteerKop>
                <SorteerKop sleutel="paidEur" className="text-right">Betaald</SorteerKop>
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
                      {d.project ? (
                        <StopLink
                          href={`/projects/${d.project.id}`}
                          className="mt-0.5 block text-xs text-accent hover:underline"
                        >
                          📁 {d.project.name}
                        </StopLink>
                      ) : null}
                    </Td>
                    <Td>
                      {d.kind === "deliverynote" ? (
                        d.deliveredAt ? (
                          <span className="flex items-center gap-1">
                            <Badge tone="success">Afgeleverd {formatDate(d.deliveredAt)}</Badge>
                            <form action={setDeliveryNoteDelivered.bind(null, d.id, false)}>
                              <ConfirmSubmit
                                message="Afgeleverd ongedaan maken?"
                                className="rounded p-1 text-muted transition-colors hover:bg-muted/50"
                              >
                                ↺
                              </ConfirmSubmit>
                            </form>
                          </span>
                        ) : (
                          <form action={setDeliveryNoteDelivered.bind(null, d.id, true)}>
                            <ConfirmSubmit
                              message="Pakbon markeren als afgeleverd?"
                              className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                            >
                              Markeer afgeleverd
                            </ConfirmSubmit>
                          </form>
                        )
                      ) : (
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge tone={documentStatusMeta[d.status].tone}>
                            {documentStatusMeta[d.status].label}
                          </Badge>
                          {d.kind === "estimate" && invoicedEstimateIds.has(d.id) && (
                            <Badge tone="success">Gefactureerd</Badge>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td className="text-muted">{formatDate(d.issueDate)}</Td>
                    <Td className="text-muted">{formatDate(d.dueDate)}</Td>
                    <Td className="text-right tabular-nums">
                      {formatEUR(sign(d.kind) * Number(d.subtotalEur ?? 0))}
                    </Td>
                    <Td
                      className={cn(
                        "text-right tabular-nums font-medium",
                        d.kind === "creditnote" && "text-danger",
                      )}
                    >
                      {formatEUR(sign(d.kind) * Number(d.totalEur ?? 0))}
                    </Td>
                    <Td className="text-right tabular-nums text-muted">
                      {formatEUR(sign(d.kind) * Number(d.paidEur ?? 0))}
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        {d.kind === "invoice" &&
                          d.status !== "paid" &&
                          d.status !== "void" &&
                          d.status !== "draft" &&
                          Number(d.totalEur ?? 0) - Number(d.paidEur ?? 0) > 0.01 && (
                            <ReminderButton documentId={d.id} />
                          )}
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
                      </span>
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
