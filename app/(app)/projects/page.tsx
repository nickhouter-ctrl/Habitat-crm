import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { requireModuleRead } from "@/lib/auth/guards";
import { projectProgress } from "@/lib/project-progress";
import { ActionDialog } from "@/components/action-dialog";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { loadProjectFunding } from "@/lib/project-funding";
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
  projectBudgetLines,
  projectCosts,
  projectPayments,
  projectPhases,
  projects,
  purchaseOrders,
  timeEntries,
  users,
} from "@/lib/db/schema";
import { docOwnShare, docProductMargin, normalizeDocItems } from "@/lib/documents";
import type { DocumentLineItem } from "@/lib/db/schema";
import { deriveAdvanceCover, deriveProjectMargins, deriveProjectFinancials } from "@/lib/project-financials";
import { splitProjectReceipts } from "@/lib/receipts";
import { poExVatSql } from "@/lib/purchase-orders-sql";
import { formatEUR } from "@/lib/utils";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Projecten") };
}

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
  warning: { label: "⚠ < 15% marge", tone: "warning" },
  danger: { label: "⚠ Verlies", tone: "danger" },
  neutral: { label: "—", tone: "neutral" },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; funding?: string }>;
}) {
  await requireModuleRead("projects");
  const uiT = await uiTranslation();
  const { status, funding: fundingFilter } = await searchParams;
  const funding = await loadProjectFunding(undefined, true);
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
      laborMarginPct: projects.laborMarginPct,
      purchaseMarginPct: projects.purchaseMarginPct,
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
  const [progressPhases, progressBudget] = projectIds.length ? await Promise.all([
    db.select({projectId:projectPhases.projectId,name:projectPhases.name,progressPct:projectPhases.progressPct}).from(projectPhases).where(inArray(projectPhases.projectId,projectIds)).orderBy(asc(projectPhases.sortOrder)),
    db.select({projectId:projectBudgetLines.projectId,phase:projectBudgetLines.phase,amountEur:projectBudgetLines.amountEur}).from(projectBudgetLines).where(inArray(projectBudgetLines.projectId,projectIds)).orderBy(asc(projectBudgetLines.sortOrder),asc(projectBudgetLines.createdAt)),
  ]) : [[],[]];

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
  const [laborAgg, looseAgg, poAgg, budgetAgg, paymentRecords, costDocs, invAdvanceAgg] = projectIds.length
    ? await Promise.all([
        db
          .select({ projectId: timeEntries.projectId, v: sql<number>`coalesce(sum(${timeEntries.hours} * ${timeEntries.hourlyCostEur}), 0)::float8` })
          .from(timeEntries)
          .where(
            and(
              inArray(timeEntries.projectId, projectIds),
              // Portaal-uren tellen pas mee na goedkeuring door kantoor.
              sql`not (${timeEntries.selfLoggedAt} is not null and ${timeEntries.approvedAt} is null)`,
            ),
          )
          .groupBy(timeEntries.projectId),
        db
          .select({ projectId: projectCosts.projectId, v: sql<number>`coalesce(sum(${projectCosts.amountEur}), 0)::float8` })
          .from(projectCosts)
          .where(inArray(projectCosts.projectId, projectIds))
          .groupBy(projectCosts.projectId),
        db
          .select({ projectId: purchaseOrders.projectId, v: sql<number>`coalesce(sum(${poExVatSql}), 0)::float8` })
          .from(purchaseOrders)
          .where(
            and(
              inArray(purchaseOrders.projectId, projectIds),
              // Arbeid-PO's tellen via time_entries — hier meetellen zou dubbel
              // zijn (zelfde filter als het projectdetail).
              eq(purchaseOrders.countAsLabor, false),
            ),
          )
          .groupBy(purchaseOrders.projectId),
        db
          .select({ projectId: projectBudgetLines.projectId, v: sql<number>`coalesce(sum(${projectBudgetLines.amountEur}), 0)::float8` })
          .from(projectBudgetLines)
          .where(inArray(projectBudgetLines.projectId, projectIds))
          .groupBy(projectBudgetLines.projectId),
        // Ontvangsten als losse rijen (niet als som): de voorschotdekking moet
        // per betaling ex. btw rekenen en het eigen-productdeel van de factuur
        // eraf halen — zelfde helpers als het detailscherm (lib/receipts.ts).
        db
          .select({
            projectId: projectPayments.projectId,
            amountEur: projectPayments.amountEur,
            method: projectPayments.method,
            vatRate: projectPayments.vatRate,
            vatAmountEur: projectPayments.vatAmountEur,
            documentId: projectPayments.documentId,
            docSubtotal: documents.subtotalEur,
            docTotal: documents.totalEur,
          })
          .from(projectPayments)
          .leftJoin(documents, eq(documents.id, projectPayments.documentId))
          .where(inArray(projectPayments.projectId, projectIds)),
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
        db
          .select({
            projectId: projectPayments.projectId,
            v: sql<number>`coalesce(sum(${projectPayments.amountEur}), 0)::float8`,
          })
          .from(projectPayments)
          .innerJoin(
            documents,
            and(
              eq(documents.projectId, projectPayments.projectId),
              eq(documents.kind, "invoice"),
              eq(documents.isAdvance, true),
              sql`${projectPayments.description} = 'Voorschot ' || ${documents.docNumber}`,
            ),
          )
          .where(and(inArray(projectPayments.projectId, projectIds), eq(projectPayments.method, "advance")))
          .groupBy(projectPayments.projectId),
      ])
    : [[], [], [], [], [], [], []];

  const mapBy = (rows: { projectId: string | null; v: number }[]) =>
    new Map(rows.map((r) => [r.projectId as string, Number(r.v ?? 0)]));
  const laborBy = mapBy(laborAgg);
  const looseBy = mapBy(looseAgg);
  const poBy = mapBy(poAgg);
  const budgetBy = mapBy(budgetAgg);
  const invAdvanceBy = mapBy(invAdvanceAgg);

  // Ontvangen per project (incl. btw — zelfde cijfer als de oude som-aggregate).
  const receivedBy = new Map<string, number>();
  const paymentsByProject = new Map<string, typeof paymentRecords>();
  for (const r of paymentRecords) {
    if (!r.projectId) continue;
    receivedBy.set(r.projectId, (receivedBy.get(r.projectId) ?? 0) + Number(r.amountEur ?? 0));
    const list = paymentsByProject.get(r.projectId) ?? [];
    list.push(r);
    paymentsByProject.set(r.projectId, list);
  }

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
  // Verkoop én kostprijs van de eigen producten — zelfde meting als het detailscherm.
  const ownProductMarginByProject = new Map<string, { revenue: number; cost: number; uncosted: number }>();
  const productCostOf = (it: DocumentLineItem) =>
    (it.productId ? pCostById.get(it.productId) : undefined) ??
    (it.description ? pCostBySku.get(it.description.trim()) : undefined);
  for (const [pid, docs] of docsByProject) {
    reservedByProject.set(pid, computeReservedNet(docs as ReservedDoc[]));
    // Kostprijs eigen producten TOT NU TOE = gerealiseerd op facturen (− creditnota's).
    let realized = 0;
    const own = { revenue: 0, cost: 0, uncosted: 0 };
    for (const d of docs) {
      const live =
        (d.kind === "invoice" && d.status !== "draft" && d.status !== "void") ||
        (d.kind === "creditnote" && d.status !== "void");
      if (!live) continue;
      const sign = d.kind === "creditnote" ? -1 : 1;
      realized += sign * lineCost(d.items);
      const pm = docProductMargin(d.items, productCostOf);
      own.revenue += sign * pm.revenue;
      own.cost += sign * pm.cost;
      own.uncosted += sign * pm.uncostedRevenue;
    }
    ownProductCostByProject.set(pid, realized);
    ownProductMarginByProject.set(pid, own);
  }

  // Voorschotdekking per project — zelfde methodiek als het detailscherm: een
  // betaling op een factuur telt maar voor (1 − eigen-productaandeel) mee.
  const ownShareByDoc = new Map<string, number>();
  for (const d of costDocs) {
    if (d.kind === "estimate") continue;
    ownShareByDoc.set(d.id, docOwnShare(d.items, Number(d.subtotalEur ?? 0), productCostOf));
  }
  const receiptsByProject = new Map([...paymentsByProject].map(([pid, list]) => [pid, splitProjectReceipts(list, ownShareByDoc)]));

  // 4. Samenvoegen + per-project financiën afleiden (zelfde formule als detailscherm).
  const rows = projectRows
    .map((p) => {
      const a = aggById.get(p.id);
      const invoiced = Number(a?.invoiced ?? 0);
      const received = receivedBy.get(p.id) ?? 0;
      // Ontvangsten uit betaalde voorschot-FACTUREN zitten al in `invoiced` —
      // niet dubbel aftrekken in "nog te factureren".
      const receivedFromInvoicedAdvances = invAdvanceBy.get(p.id) ?? 0;
      const laborCost = laborBy.get(p.id) ?? 0;
      const materialCost = (poBy.get(p.id) ?? 0) + (looseBy.get(p.id) ?? 0);
      const ownProductCost = ownProductCostByProject.get(p.id) ?? 0;
      const fin = deriveProjectFinancials({
        contractPriceEur: p.contractPriceEur != null ? Number(p.contractPriceEur) : null,
        contingencyPct: p.contingencyPct != null ? Number(p.contingencyPct) : null,
        budgetBase: budgetBy.get(p.id) ?? 0,
        estimateSubtotal: Number(a?.estimateSubtotal ?? 0),
        invoicedSubtotal: invoiced,
        received: received - receivedFromInvoicedAdvances,
        laborCost,
        materialCost,
        ownProductCost,
      });
      // Marge per stroom — zelfde meting als op het detailscherm.
      const own = ownProductMarginByProject.get(p.id) ?? { revenue: 0, cost: 0, uncosted: 0 };
      const margins = deriveProjectMargins({
        laborCost,
        laborMarginPct: p.laborMarginPct != null ? Number(p.laborMarginPct) : null,
        productRevenue: own.revenue,
        productCost: own.cost,
        uncostedProductRevenue: own.uncosted,
        purchaseCost: materialCost,
        purchaseMarginPct: p.purchaseMarginPct != null ? Number(p.purchaseMarginPct) : null,
      });
      // Voorschotdekking: kasgeld (uren + inkoop derden) tegenover ontvangen
      // dekking — eigen voorraadproducten staan hier bewust buiten.
      const cover = funding.get(p.id)?.cover ?? deriveAdvanceCover({
        laborCost,
        purchaseCost: materialCost,
        coverReceivedEx: receiptsByProject.get(p.id)?.liquidReceived ?? 0,
        ownProductReceivedEx: receiptsByProject.get(p.id)?.ownProductReceived ?? 0,
        requiredRevenue: margins.laborRevenue + margins.purchaseRevenue,
      });
      const lastActivity =
        a?.lastDocAt && new Date(a.lastDocAt) > new Date(p.updatedAt)
          ? a.lastDocAt
          : (p.updatedAt as unknown as string);
      return {
        ...p,
        margins,
        cover,
        progress: projectProgress(progressPhases.filter(f=>f.projectId===p.id),progressBudget.filter(b=>b.projectId===p.id)),
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
    .filter(p=>fundingFilter!=="attention" || p.cover.requiredRevenue>0&&p.cover.status!=="gedekt")
    .sort((x, y) => new Date(y.lastActivity).getTime() - new Date(x.lastActivity).getTime());

  // Samenvatting (over de getoonde selectie) — ex. btw.
  const totals = rows.reduce(
    (s, r) => {
      s.invoiced += r.invoiced;
      s.outstanding += r.outstanding;
      s.toInvoice += r.fin.toInvoice;
      s.resultToDate += r.fin.resultToDate;
      s.contract += r.contractPriceEur != null ? Number(r.contractPriceEur) : 0;
      // Alleen echte tekorten optellen: waar wij op dit moment geld voorschieten.
      s.voorgeschoten += r.cover.saldo < 0 ? -r.cover.saldo : 0;
      return s;
    },
    { invoiced: 0, outstanding: 0, toInvoice: 0, resultToDate: 0, contract: 0, voorgeschoten: 0 },
  );

  const statusBadge = (s: string) =>
    s === "active" ? (
      <Badge tone="success">{uiT("Actief")}</Badge>
    ) : s === "completed" ? (
      <Badge tone="info">{uiT("Afgerond")}</Badge>
    ) : (
      <Badge tone="neutral">{uiT("Gearchiveerd")}</Badge>
    );

  return (
    <>
      <PageHeader
        title={uiT("Projecten")}
        actions={
          <LinkButton href="/projects/new" variant="primary">
            {uiT("Nieuw project")} </LinkButton>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(f=><Link key={f.key} href={f.key==='active'?'/projects':`/projects?status=${f.key}`} aria-current={filter===f.key?'page':undefined} className={`rounded-lg border px-3 py-2 text-sm ${filter===f.key?'bg-accent/10 text-accent':'bg-surface text-muted'}`}>{uiT(f.label)}</Link>)}</div>
      <TabsRoot defaultTab="stand" ids={["stand","resultaat"]} param="weergave"><TabsBar tabs={[{id:"stand",label:uiT("Stand & voorschotten")},{id:"resultaat",label:uiT("Marge & winst")}]}/>
      {fundingFilter==="attention"&&<p className="mb-4 rounded-lg bg-warning/10 p-3 text-sm">{uiT("Projecten waar een aanvullend voorschot nodig is of binnenkort nodig wordt.")} <Link href="/projects" className="text-accent underline">{uiT("Alle projecten tonen")}</Link></p>}
      <TabPanel id="resultaat"><div className="mb-4"><ActionDialog title={uiT("Overzicht cijfers")} wide><div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label={uiT("Projecten")}
          value={String(rows.length)}
          hint={FILTERS.find((f) => f.key === filter)?.label}
          tone="neutral"
        />
        <StatTile
          label={uiT("Aanvullend voorschot nodig")}
          value={formatEUR(totals.voorgeschoten)}
          hint={uiT("tekort na doorbelasting inclusief opslag · ex. BTW")}
          tone={totals.voorgeschoten > 0.01 ? "danger" : "success"}
        />
        <StatTile
          label={uiT("Gefactureerd")}
          value={formatEUR(totals.invoiced)}
          hint={uiT("facturen − creditnota's · ex. BTW")}
          tone="success"
        />
        <StatTile
          label={uiT("Nog te factureren")}
          value={formatEUR(totals.toInvoice)}
          hint={uiT("doel − gefactureerd − ontvangen · ex. BTW")}
          tone={totals.toInvoice > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label={uiT("Resultaat tot nu toe")}
          value={formatEUR(totals.resultToDate)}
          hint={uiT("doel − kosten tot nu toe · ex. BTW")}
          tone={totals.resultToDate < 0 ? "danger" : "info"}
        />
      </div></ActionDialog></div></TabPanel>


      <TabPanel id="stand">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/projects" className="rounded-xl border bg-surface px-4 py-4"><p className="text-xs text-muted">{uiT("Projecten in beeld")}</p><p className="mt-1 text-xl font-semibold">{rows.length}</p></Link>
          <Link href="/projects?funding=attention" className="rounded-xl border bg-surface px-4 py-4"><p className="text-xs text-muted">{uiT("Voorschot controleren")}</p><p className="mt-1 text-xl font-semibold text-warning">{rows.filter(p=>p.status==='active'&&p.cover.requiredRevenue>0.01&&p.cover.status!=='gedekt').length}</p></Link>
          <div className="rounded-xl border bg-surface px-4 py-4"><p className="text-xs text-muted">{uiT("Openstaande klantfacturen")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatEUR(totals.outstanding)}</p><p className="mt-1 text-xs text-muted">{uiT("Nog niet ontvangen · ex. btw")}</p></div>
        </div>
        <Card className="overflow-hidden"><CardHeader><CardTitle>{uiT("Stand per project")}</CardTitle><span className="text-xs text-muted">{uiT("Ontvangsten en voorschotruimte · ex. btw")}</span></CardHeader><Table className="min-w-[1200px]">
          <THead><Tr><Th>{uiT("Project")}</Th><Th>{uiT("Voortgang")}</Th><Th className="text-right">{uiT("Totaal ontvangen")}</Th><Th className="text-right">{uiT("Ontvangen voor eigen producten")}</Th><Th className="text-right">{uiT("Liquide ontvangen")}</Th><Th className="text-right">{uiT("Over na kosten, vóór opslag")}</Th><Th className="text-right">{uiT("Uren en derden tegen klantprijs")}</Th><Th className="text-right">{uiT("Resterende voorschotruimte")}</Th><Th>{uiT("Volgende stap")}</Th></Tr></THead>
          <TBody>{rows.map(p=><Tr key={p.id}>
            <Td><Link href={`/projects/${p.id}`} className="font-semibold text-accent hover:underline">{p.name}</Link><p className="mt-1 text-xs text-muted">{p.contactName??uiT("Geen klant gekoppeld")}{p.ownerName?` · ${p.ownerName}`:''}</p><div className="mt-2">{statusBadge(p.status)}</div></Td>
            <Td>{p.progress.percent===null?<span className="text-xs text-muted">{uiT("Nog niet vastgelegd")}</span>:<><p className="text-sm font-semibold">{p.progress.percent}%</p><div role="progressbar" aria-label={uiT("Voortgang")} aria-valuenow={p.progress.percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-background"><div className="h-full bg-accent" style={{width:`${p.progress.percent}%`}}/></div><p className="mt-1 max-w-36 text-xs text-muted">{p.progress.current??uiT("Alle fases afgerond")}</p></>}</Td>
            <Td className="text-right tabular-nums">{formatEUR(p.cover.totalReceived)}</Td>
            <Td className="text-right tabular-nums">{formatEUR(p.cover.ownProductReceived)}</Td>
            <Td className="text-right tabular-nums">{formatEUR(p.cover.received)}</Td>
            <Td className={`text-right font-semibold tabular-nums ${p.cover.costSaldo < 0 ? "text-danger" : "text-success"}`}>{formatEUR(p.cover.costSaldo)}</Td>
            <Td className="text-right tabular-nums">{formatEUR(p.cover.requiredRevenue)}<p className="mt-1 text-xs text-muted">{uiT("Incl. opslag op uren en derden")}</p></Td>
            <Td className="text-right"><p className={`font-semibold tabular-nums ${p.cover.saldo<0?'text-danger':p.cover.status==='bijna_op'?'text-warning':'text-success'}`}>{formatEUR(p.cover.saldo)}</p><p className="mt-1 text-xs text-muted">{uiT(p.cover.saldo<0?"tekort incl. opslag":"vooruit ontvangen incl. opslag")}</p></Td>
            <Td><Link href={`/projects/${p.id}#voorschot-opvragen`} className="inline-block text-sm font-medium text-accent hover:underline">{uiT(p.status!=='active'?"Betalingen controleren":p.cover.requiredRevenue<=0.01?"Voorschot plannen":p.cover.status==='voorgeschoten'?"Voorschot nodig":p.cover.status==='bijna_op'?"Nieuw voorschot voorbereiden":"Voldoende voorschotruimte")}</Link>{p.outstanding>0.01&&<p className="mt-2 text-xs text-warning">{uiT("{amount} facturen nog open",{amount:formatEUR(p.outstanding)})}</p>}</Td>
          </Tr>)}{!rows.length&&<Tr><Td colSpan={9}>{uiT("Geen projecten in deze weergave — maak er een aan met “Nieuw project”.")}</Td></Tr>}</TBody>
        </Table></Card>
        <p className="text-xs leading-relaxed text-muted">{uiT("Liquide ontvangen − geboekte kosten van uren en derden = liquide projectruimte. Alle bedragen ex. btw; gebaseerd op geboekte betalingen en kosten.")} {uiT("Kosten en berekening bekijk je in het project. Marge en winst staan in hun eigen tabblad.")}</p>
      </TabPanel>
      <TabPanel id="resultaat">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{uiT("Alle projecten")}</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "active" ? "/projects" : `/projects?status=${f.key}`}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  filter === f.key ? "bg-primary/10 text-primary" : "text-muted hover:bg-muted/50"
                }`}
              >
                {uiT(f.label)}
              </Link>
            ))}
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            {uiT("Geen projecten in deze weergave — maak er een aan met “Nieuw project”.")} </div>
        ) : (
          <Table views={[
            { id: "profit", label: uiT("Marge & winst"), hidden: [4, 5, 6, 7, 8] },
            { id: "all", label: uiT("Alle kolommen"), hidden: [] },
          ]}>
            <THead>
              <tr>
                <Th>{uiT("Project")}</Th>
                <Th>{uiT("Klant")}</Th>
                <Th className="text-right">{uiT("Aanneemprijs")}</Th>
                <Th className="text-right">{uiT("Gefactureerd")}</Th>
                <Th className="text-right">{uiT("Openstaand")}</Th>
                <Th className="text-right">{uiT("Voorschot")}</Th>
                <Th className="text-right">{uiT("Open facturen")}</Th>
                <Th className="text-right">{uiT("Nog te factureren")}</Th>
                <Th className="text-right">{uiT("Marge uren")}</Th>
                <Th className="text-right">{uiT("Marge inkoop")}</Th>
                <Th className="text-right">{uiT("Marge eigen producten")}</Th>
                <Th className="text-right">{uiT("Resultaat tot nu toe")}</Th>
                <Th>{uiT("Op koers")}</Th>
                <Th>{uiT("Status")}</Th>
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
                        <span className="text-muted" title={uiT("Doel uit begroting/offerte")}>
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
                    {/* Voorschotdekking: rood = wij schieten voor, oranje = bijna
                        op. Zonder kasuitgaven valt er niets te dekken → "—". */}
                    <Td className="text-right tabular-nums">
                      {p.cover.requiredRevenue <= 0.01 ? (
                        <span className="text-muted">—</span>
                      ) : p.cover.status === "voorgeschoten" ? (
                        <Link href={`/projects/${p.id}#voorschot-opvragen`} title={uiT("Voorschottekort inclusief opslag — nieuw voorschot vragen")}>
                          <Badge tone="danger">− {formatEUR(-p.cover.saldo)}</Badge>
                        </Link>
                      ) : p.cover.status === "bijna_op" ? (
                        <Link href={`/projects/${p.id}#voorschot-opvragen`} title={uiT("Nog {v0} dekking over", { v0: formatEUR(p.cover.saldo) })}>
                          <Badge tone="warning">{uiT("bijna op")}</Badge>
                        </Link>
                      ) : (
                        <span className="text-success" title={uiT("{v0} dekking over", { v0: formatEUR(p.cover.saldo) })}>
                          ✓
                        </span>
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
                      {p.margins.laborCost > 0 ? (
                        <span title={uiT("{v0}% norm · kostprijs {v1} → door te belasten {v2}", { v0: p.margins.laborMarginPct, v1: formatEUR(p.margins.laborCost), v2: formatEUR(p.margins.laborRevenue) })}>
                          {formatEUR(p.margins.laborMargin)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.margins.purchaseCost > 0 ? (
                        <span title={uiT("{v0}% norm · kostprijs {v1} → door te belasten {v2}", { v0: p.margins.purchaseMarginPct, v1: formatEUR(p.margins.purchaseCost), v2: formatEUR(p.margins.purchaseRevenue) })}>
                          {formatEUR(p.margins.purchaseMargin)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.margins.productRevenue > 0 ? (
                        <span
                          className={p.margins.productMargin < 0 ? "font-medium text-danger" : undefined}
                          title={uiT("gefactureerd {v0} − kostprijs {v1}", { v0: formatEUR(p.margins.productRevenue), v1: formatEUR(p.margins.productCost) })}
                        >
                          {formatEUR(p.margins.productMargin)}
                          {p.margins.productMarginPct != null && (
                            <span className="ml-1 text-xs text-muted">
                              {p.margins.productMarginPct.toFixed(0)}%
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
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
                        <Badge tone={koers.tone}>{uiT(koers.label)}</Badge>
                      )}
                    </Td>
                    <Td>{statusBadge(p.status)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card></TabPanel></TabsRoot>
    </>
  );
}
