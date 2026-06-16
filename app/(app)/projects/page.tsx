import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
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
import { contacts, documents, projects, users } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";

export const metadata = { title: "Projecten" };

/**
 * Gereserveerde waarde van een project = som van de offerte-totalen (incl. btw)
 * van offertes die geaccepteerd óf op 'gereserveerd' gezet zijn, EXCLUSIEF
 * offertes die al tot een factuur hebben geleid (gekoppeld via source-document of
 * met een gelijk factuurbedrag in hetzelfde project).
 */
type ReservedDoc = {
  id: string;
  kind: string;
  status: string;
  reservedAt: Date | null;
  totalEur: string | null;
  sourceDocumentId: string | null;
};
function computeReservedNet(docs: ReservedDoc[]): number {
  const liveInvoices = docs.filter((d) => d.kind === "invoice" && d.status !== "void");
  const invoicedEstimateIds = new Set(
    liveInvoices.map((d) => d.sourceDocumentId).filter(Boolean) as string[],
  );
  const invoiceTotals = liveInvoices.map((d) => Number(d.totalEur ?? 0));

  let total = 0;
  for (const d of docs) {
    if (d.kind !== "estimate") continue;
    if (d.status === "void" || d.status === "rejected") continue;
    if (!(d.status === "accepted" || d.reservedAt)) continue;
    const t = Number(d.totalEur ?? 0);
    if (t <= 0) continue;
    // Al gefactureerd? Dan is het geen reservering meer.
    const converted =
      invoicedEstimateIds.has(d.id) || invoiceTotals.some((it) => Math.abs(it - t) <= 0.02);
    if (converted) continue;
    total += t;
  }
  return total;
}

type Filter = "active" | "inactive" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Actief" },
  { key: "inactive", label: "Afgerond / archief" },
  { key: "all", label: "Alle" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter: Filter = status === "inactive" || status === "all" ? status : "active";

  const statusWhere =
    filter === "active"
      ? eq(projects.status, "active")
      : filter === "inactive"
        ? ne(projects.status, "active")
        : undefined;

  // 1. Projecten + klant + verantwoordelijke.
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      status: projects.status,
      holdedProjectId: projects.holdedProjectId,
      startDate: projects.startDate,
      endDate: projects.endDate,
      updatedAt: projects.updatedAt,
      contactId: projects.contactId,
      contactName: contacts.name,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .where(statusWhere)
    .orderBy(asc(projects.status), desc(projects.updatedAt));

  // 2. Document-aggregaten per project (omzet, openstaand, gereserveerd, #docs).
  const aggRows = await db
    .select({
      projectId: documents.projectId,
      docCount: sql<number>`count(*)::int`,
      invoiced: sql<number>`(coalesce(sum(case when ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void') then ${documents.totalEur} else 0 end), 0) - coalesce(sum(case when ${documents.kind} = 'creditnote' and ${documents.status} <> 'void' then ${documents.totalEur} else 0 end), 0))::float8`,
      outstanding: sql<number>`coalesce(sum(case when ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void','paid') then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)::float8`,
      openInvoices: sql<number>`count(*) filter (where ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void','paid') and ${documents.totalEur} > ${documents.paidEur})::int`,
      lastDocAt: sql<string | null>`max(${documents.updatedAt})`,
    })
    .from(documents)
    .where(isNotNull(documents.projectId))
    .groupBy(documents.projectId);

  const aggById = new Map(aggRows.map((a) => [a.projectId, a]));

  // Gereserveerd per project: zelfde netto-berekening als de detailpagina
  // (geaccepteerde/gereserveerde offertes minus wat al verkocht is).
  const projectIds = projectRows.map((p) => p.id);
  const reservedDocs = projectIds.length
    ? await db
        .select({
          id: documents.id,
          projectId: documents.projectId,
          kind: documents.kind,
          status: documents.status,
          reservedAt: documents.reservedAt,
          totalEur: documents.totalEur,
          sourceDocumentId: documents.sourceDocumentId,
        })
        .from(documents)
        .where(
          and(
            inArray(documents.projectId, projectIds),
            inArray(documents.kind, ["estimate", "invoice"]),
          ),
        )
    : [];
  const docsByProject = new Map<string, ReservedDoc[]>();
  for (const d of reservedDocs) {
    if (!d.projectId) continue;
    const list = docsByProject.get(d.projectId) ?? [];
    list.push(d);
    docsByProject.set(d.projectId, list);
  }
  const reservedByProject = new Map<string, number>();
  for (const [pid, docs] of docsByProject) {
    reservedByProject.set(pid, computeReservedNet(docs));
  }

  // 3. Samenvoegen + sorteren op laatste activiteit (recentste bovenaan).
  const rows = projectRows
    .map((p) => {
      const a = aggById.get(p.id);
      const lastActivity =
        a?.lastDocAt && new Date(a.lastDocAt) > new Date(p.updatedAt)
          ? a.lastDocAt
          : (p.updatedAt as unknown as string);
      return {
        ...p,
        docCount: a?.docCount ?? 0,
        invoiced: Number(a?.invoiced ?? 0),
        outstanding: Number(a?.outstanding ?? 0),
        openInvoices: a?.openInvoices ?? 0,
        reservedValue: reservedByProject.get(p.id) ?? 0,
        lastActivity,
      };
    })
    .sort((x, y) => new Date(y.lastActivity).getTime() - new Date(x.lastActivity).getTime());

  // Samenvatting (over de getoonde selectie).
  const totals = rows.reduce(
    (s, r) => {
      s.invoiced += r.invoiced;
      s.outstanding += r.outstanding;
      s.reserved += r.reservedValue;
      s.openInvoices += r.openInvoices;
      return s;
    },
    { invoiced: 0, outstanding: 0, reserved: 0, openInvoices: 0 },
  );

  const statusBadge = (s: string) =>
    s === "active" ? (
      <Badge tone="success">Actief</Badge>
    ) : s === "completed" ? (
      <Badge tone="info">Afgerond</Badge>
    ) : (
      <Badge tone="neutral">Gearchiveerd</Badge>
    );

  return (
    <>
      <PageHeader
        title="Projecten"
        actions={
          <LinkButton href="/projects/new" variant="primary">
            Nieuw project
          </LinkButton>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Projecten"
          value={String(rows.length)}
          hint={FILTERS.find((f) => f.key === filter)?.label}
          tone="neutral"
        />
        <StatTile
          label="Gefactureerd"
          value={formatEUR(totals.invoiced)}
          hint="facturen − creditnota's, incl. BTW"
          tone="success"
        />
        <StatTile
          label="Openstaand"
          value={formatEUR(totals.outstanding)}
          hint={`${totals.openInvoices} open factu${totals.openInvoices === 1 ? "ur" : "ren"}`}
          tone={totals.outstanding > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Gereserveerd"
          value={formatEUR(totals.reserved)}
          hint="uit gereserveerde/geaccepteerde offertes, minus wat al verkocht is"
          tone="info"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Alle projecten</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "active" ? "/projects" : `/projects?status=${f.key}`}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  filter === f.key ? "bg-primary/10 text-primary" : "text-muted hover:bg-muted/50"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            Geen projecten in deze weergave — maak er een aan met “Nieuw project”.
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Project</Th>
                <Th>Klant</Th>
                <Th>Verantwoordelijke</Th>
                <Th className="text-right">Docs</Th>
                <Th className="text-right">Gefactureerd</Th>
                <Th className="text-right">Openstaand</Th>
                <Th className="text-right">Gereserveerd</Th>
                <Th className="text-right">Laatste activiteit</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: p.color ?? "#9ca3af" }}
                      />
                      <span className="truncate">{p.name}</span>
                      {p.code ? (
                        <span className="text-xs font-normal text-muted">{p.code}</span>
                      ) : null}
                    </Link>
                  </Td>
                  <Td>
                    {p.contactName ? (
                      <Link href={`/contacts/${p.contactId}`} className="hover:underline">
                        {p.contactName}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-muted">{p.ownerName ?? p.ownerEmail ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{p.docCount || "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {p.invoiced ? formatEUR(p.invoiced) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.outstanding > 0 ? (
                      <span className="font-medium text-warning">{formatEUR(p.outstanding)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.reservedValue > 0 ? (
                      formatEUR(p.reservedValue)
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right text-xs text-muted">{formatDate(p.lastActivity)}</Td>
                  <Td>{statusBadge(p.status)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
