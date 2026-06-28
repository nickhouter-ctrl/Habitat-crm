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
import {
  contacts,
  documents,
  products,
  projectBudgetLines,
  projectCosts,
  projectPayments,
  projects,
  purchaseOrders,
  timeEntries,
  users,
} from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { deriveProjectFinancials } from "@/lib/project-financials";
import { formatDate, formatEUR } from "@/lib/utils";

export const metadata = { title: "Projecten" };

/**
 * Gereserveerde waarde van een project = som van de offerte-subtotalen (ex. btw)
 * van offertes die geaccepteerd óf op 'gereserveerd' gezet zijn, EXCLUSIEF
 * offertes die al tot een factuur hebben geleid (gekoppeld via source-document of
 * met een gelijk factuurbedrag in hetzelfde project).
 */
type ReservedDoc = {
  id: string;
  kind: string;
  status: string;
  reservedAt: Date | null;
  subtotalEur: string | null;
  sourceDocumentId: string | null;
};
function computeReservedNet(docs: ReservedDoc[]): number {
  const liveInvoices = docs.filter((d) => d.kind === "invoice" && d.status !== "void");
  const invoicedEstimateIds = new Set(
    liveInvoices.map((d) => d.sourceDocumentId).filter(Boolean) as string[],
  );
  const invoiceSubtotals = liveInvoices.map((d) => Number(d.subtotalEur ?? 0));

  let total = 0;
  for (const d of docs) {
    if (d.kind !== "estimate") continue;
    if (d.status === "void" || d.status === "rejected") continue;
    if (!(d.status === "accepted" || d.reservedAt)) continue;
    const t = Number(d.subtotalEur ?? 0);
    if (t <= 0) continue;
    // Al gefactureerd? Dan is het geen reservering meer.
    const converted =
      invoicedEstimateIds.has(d.id) || invoiceSubtotals.some((it) => Math.abs(it - t) <= 0.02);
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

const TONE_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  success: { label: "✓ Op koers", tone: "success" },
  warning: { label: "⚠ Krappe marge", tone: "warning" },
  danger: { label: "⚠ Verlies", tone: "danger" },
  neutral: { label: "—", tone: "neutral" },
};

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
      contractPriceEur: projects.contractPriceEur,
      contingencyPct: projects.contingencyPct,
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

  const projectIds = projectRows.map((p) => p.id);

  // 2. Document-aggregaten per project — ALLES EX. BTW (subtotaal).
  //    invoiced = facturen − creditnota's; outstanding = ex-btw deel dat nog open
  //    staat (subtotaal × onbetaalde fractie); estimateSubtotal = offerte-doel.
  const aggRows = await db
    .select({
      projectId: documents.projectId,
      docCount: sql<number>`count(*)::int`,
      invoiced: sql<number>`(coalesce(sum(case when ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void') then ${documents.subtotalEur} else 0 end), 0) - coalesce(sum(case when ${documents.kind} = 'creditnote' and ${documents.status} <> 'void' then ${documents.subtotalEur} else 0 end), 0))::float8`,
      outstanding: sql<number>`coalesce(sum(case when ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void','paid') and ${documents.totalEur} > ${documents.paidEur} then ${documents.subtotalEur} * (${documents.totalEur} - ${documents.paidEur}) / nullif(${documents.totalEur}, 0) else 0 end), 0)::float8`,
      openInvoices: sql<number>`count(*) filter (where ${documents.kind} = 'invoice' and ${documents.status} not in ('draft','void','paid') and ${documents.totalEur} > ${documents.paidEur})::int`,
      estimateSubtotal: sql<number>`coalesce(sum(case when ${documents.kind} = 'estimate' and ${documents.status} not in ('void','rejected') then ${documents.subtotalEur} else 0 end), 0)::float8`,
      lastDocAt: sql<string | null>`max(${documents.updatedAt})`,
    })
    .from(documents)
    .where(isNotNull(documents.projectId))
    .groupBy(documents.projectId);
  const aggById = new Map(aggRows.map((a) => [a.projectId, a]));

  // 3. Kosten- en ontvangst-aggregaten per project (ex. btw; ontvangsten incl. btw).
  const [laborAgg, looseAgg, poAgg, budgetAgg, receivedAgg, costDocs] = projectIds.length
    ? await Promise.all([
        db
          .select({ projectId: timeEntries.projectId, v: sql<number>`coalesce(sum(${timeEntries.hours} * ${timeEntries.hourlyCostEur}), 0)::float8` })
          .from(timeEntries)
          .where(inArray(timeEntries.projectId, projectIds))
          .groupBy(timeEntries.projectId),
        db
          .select({ projectId: projectCosts.projectId, v: sql<number>`coalesce(sum(${projectCosts.amountEur}), 0)::float8` })
          .from(projectCosts)
          .where(inArray(projectCosts.projectId, projectIds))
          .groupBy(projectCosts.projectId),
        db
          .select({ projectId: purchaseOrders.projectId, v: sql<number>`coalesce(sum(coalesce(${purchaseOrders.subtotal}, ${purchaseOrders.total})), 0)::float8` })
          .from(purchaseOrders)
          .where(inArray(purchaseOrders.projectId, projectIds))
          .groupBy(purchaseOrders.projectId),
        db
          .select({ projectId: projectBudgetLines.projectId, v: sql<number>`coalesce(sum(${projectBudgetLines.amountEur}), 0)::float8` })
          .from(projectBudgetLines)
          .where(inArray(projectBudgetLines.projectId, projectIds))
          .groupBy(projectBudgetLines.projectId),
        db
          .select({ projectId: projectPayments.projectId, v: sql<number>`coalesce(sum(${projectPayments.amountEur}), 0)::float8` })
          .from(projectPayments)
          .where(inArray(projectPayments.projectId, projectIds))
          .groupBy(projectPayments.projectId),
        // Voor de gereserveerd-berekening én de kostprijs van eigen producten.
        db
          .select({
            id: documents.id,
            projectId: documents.projectId,
            kind: documents.kind,
            status: documents.status,
            subtotalEur: documents.subtotalEur,
            sourceDocumentId: documents.sourceDocumentId,
            reservedAt: documents.reservedAt,
            items: documents.items,
          })
          .from(documents)
          .where(
            and(
              inArray(documents.projectId, projectIds),
              inArray(documents.kind, ["estimate", "invoice", "creditnote"]),
            ),
          ),
      ])
    : [[], [], [], [], [], []];

  const mapBy = (rows: { projectId: string | null; v: number }[]) =>
    new Map(rows.map((r) => [r.projectId as string, Number(r.v ?? 0)]));
  const laborBy = mapBy(laborAgg);
  const looseBy = mapBy(looseAgg);
  const poBy = mapBy(poAgg);
  const budgetBy = mapBy(budgetAgg);
  const receivedBy = mapBy(receivedAgg);

  // Kostprijs eigen producten: koppel offerte-/factuurregels aan de productcatalogus
  // (op productId of op SKU=omschrijving). Verwacht = max(gefactureerd, offerte).
  const pidSet = new Set<string>();
  const skuSet = new Set<string>();
  for (const d of costDocs) {
    for (const it of normalizeDocItems(d.items)) {
      if (it.productId) pidSet.add(it.productId);
      if (it.description?.trim()) skuSet.add(it.description.trim());
    }
  }
  const prodCostRows =
    pidSet.size || skuSet.size
      ? await db.query.products.findMany({
          where: (p, { or, inArray: inArr }) =>
            or(
              pidSet.size ? inArr(p.id, [...pidSet]) : undefined,
              skuSet.size ? inArr(p.sku, [...skuSet]) : undefined,
            ),
          columns: { id: true, sku: true, costEur: true },
        })
      : [];
  const pCostById = new Map(prodCostRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const pCostBySku = new Map(prodCostRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]));
  const lineCost = (items: unknown) => {
    let cost = 0;
    for (const it of normalizeDocItems(items)) {
      const c =
        (it.productId ? pCostById.get(it.productId) : undefined) ??
        (it.description ? pCostBySku.get(it.description.trim()) : undefined);
      if (c != null && c > 0) cost += c * (Number(it.units) || 0);
    }
    return cost;
  };

  // Per project: gereserveerd + kostprijs eigen producten (realized vs. offerte).
  const docsByProject = new Map<string, typeof costDocs>();
  for (const d of costDocs) {
    if (!d.projectId) continue;
    const list = docsByProject.get(d.projectId) ?? [];
    list.push(d);
    docsByProject.set(d.projectId, list);
  }
  const reservedByProject = new Map<string, number>();
  const ownProductCostByProject = new Map<string, number>();
  for (const [pid, docs] of docsByProject) {
    reservedByProject.set(pid, computeReservedNet(docs as ReservedDoc[]));
    // Kostprijs eigen producten TOT NU TOE = gerealiseerd op facturen (− creditnota's).
    let realized = 0;
    for (const d of docs) {
      const c = lineCost(d.items);
      if (d.kind === "invoice" && d.status !== "draft" && d.status !== "void") {
        realized += c;
      } else if (d.kind === "creditnote" && d.status !== "void") {
        realized -= c;
      }
    }
    ownProductCostByProject.set(pid, realized);
  }

  // 4. Samenvoegen + per-project financiën afleiden (zelfde formule als detailscherm).
  const rows = projectRows
    .map((p) => {
      const a = aggById.get(p.id);
      const invoiced = Number(a?.invoiced ?? 0);
      const received = receivedBy.get(p.id) ?? 0;
      const laborCost = laborBy.get(p.id) ?? 0;
      const materialCost = (poBy.get(p.id) ?? 0) + (looseBy.get(p.id) ?? 0);
      const ownProductCost = ownProductCostByProject.get(p.id) ?? 0;
      const fin = deriveProjectFinancials({
        contractPriceEur: p.contractPriceEur != null ? Number(p.contractPriceEur) : null,
        contingencyPct: p.contingencyPct != null ? Number(p.contingencyPct) : null,
        budgetBase: budgetBy.get(p.id) ?? 0,
        estimateSubtotal: Number(a?.estimateSubtotal ?? 0),
        invoicedSubtotal: invoiced,
        received,
        laborCost,
        materialCost,
        ownProductCost,
      });
      const lastActivity =
        a?.lastDocAt && new Date(a.lastDocAt) > new Date(p.updatedAt)
          ? a.lastDocAt
          : (p.updatedAt as unknown as string);
      return {
        ...p,
        docCount: a?.docCount ?? 0,
        invoiced,
        outstanding: Number(a?.outstanding ?? 0),
        openInvoices: a?.openInvoices ?? 0,
        reservedValue: reservedByProject.get(p.id) ?? 0,
        received,
        fin,
        lastActivity,
      };
    })
    .sort((x, y) => new Date(y.lastActivity).getTime() - new Date(x.lastActivity).getTime());

  // Samenvatting (over de getoonde selectie) — ex. btw.
  const totals = rows.reduce(
    (s, r) => {
      s.invoiced += r.invoiced;
      s.outstanding += r.outstanding;
      s.toInvoice += r.fin.toInvoice;
      s.resultToDate += r.fin.resultToDate;
      s.contract += r.contractPriceEur != null ? Number(r.contractPriceEur) : 0;
      return s;
    },
    { invoiced: 0, outstanding: 0, toInvoice: 0, resultToDate: 0, contract: 0 },
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
          hint="facturen − creditnota's · ex. BTW"
          tone="success"
        />
        <StatTile
          label="Nog te factureren"
          value={formatEUR(totals.toInvoice)}
          hint="doel − gefactureerd − ontvangen · ex. BTW"
          tone={totals.toInvoice > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Resultaat tot nu toe"
          value={formatEUR(totals.resultToDate)}
          hint="doel − kosten tot nu toe · ex. BTW"
          tone={totals.resultToDate < 0 ? "danger" : "info"}
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
                <Th className="text-right">Aanneemprijs</Th>
                <Th className="text-right">Gefactureerd</Th>
                <Th className="text-right">Openstaand</Th>
                <Th className="text-right">Open facturen</Th>
                <Th className="text-right">Nog te factureren</Th>
                <Th className="text-right">Resultaat tot nu toe</Th>
                <Th>Op koers</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const koers = TONE_BADGE[p.fin.tone];
                const profitTone =
                  p.fin.tone === "danger" ? "text-danger" : p.fin.tone === "warning" ? "text-warning" : "text-foreground";
                return (
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
                        {p.code ? <span className="text-xs font-normal text-muted">{p.code}</span> : null}
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
                    <Td className="text-right tabular-nums">
                      {p.contractPriceEur != null ? (
                        formatEUR(p.contractPriceEur)
                      ) : p.fin.hasTarget ? (
                        <span className="text-muted" title="Doel uit begroting/offerte">
                          {formatEUR(p.fin.targetRevenue)}*
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{p.invoiced ? formatEUR(p.invoiced) : "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {p.outstanding > 0 ? (
                        <span className="font-medium text-warning">{formatEUR(p.outstanding)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.openInvoices > 0 ? (
                        <Badge tone="warning">{p.openInvoices}</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.fin.toInvoice > 0 ? formatEUR(p.fin.toInvoice) : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.fin.tone === "neutral" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={`font-medium ${profitTone}`}>
                          {formatEUR(p.fin.resultToDate)}
                          {p.fin.marginPct != null ? (
                            <span className="ml-1 text-xs font-normal text-muted">{p.fin.marginPct}%</span>
                          ) : null}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {p.fin.tone === "neutral" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <Badge tone={koers.tone}>{koers.label}</Badge>
                      )}
                    </Td>
                    <Td>{statusBadge(p.status)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
