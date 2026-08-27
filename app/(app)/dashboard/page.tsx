import { and, count, desc, eq, gte, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, Wallet, LayoutDashboard, ShoppingCart, Activity } from "lucide-react";

import { MonthlyAmountChart } from "@/components/rapporten-charts";

import {
  Badge,
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
  Tr,
} from "@/components/ui";
import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { DagtakenLijst } from "@/components/dagtaken-lijst";
import { db } from "@/lib/db";
import { OFFERTE_TE_FACTUREREN } from "@/lib/quote-status";
import { verzamelDagtaken } from "@/lib/dagtaken";
import { activities, contacts, deliveries, documents, products, projects, purchaseOrders } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { purchaseDocsTotalExBTW } from "@/lib/holded/accounting";
import { getReservedStockByProduct } from "@/lib/stock";
import { formatMoney, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { poExVatSql } from "@/lib/purchase-orders-sql";
import { formatDate, formatEUR } from "@/lib/utils";
import { documentKindMeta } from "../_meta";
import { SubmitButton } from "@/components/submit-button";
import { reorderShortagesToDrafts } from "../bestellen/actions";
import { approveProforma } from "../inkooporders/actions";
import { markPickedUp, setDeliveryStatus } from "../leveringen/actions";

export const metadata = { title: "Dashboard" };
// Cold start mag tot 60s, ruim voor de eerste Holded-fetch; warm is dit 1–2s.
export const maxDuration = 60;

const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** Bouw een doorlopende reeks van de laatste 12 maanden uit DB-rijen (ym → waarde). */
function monthSeries(now: Date, rows: { ym: string; value: string | number }[]) {
  const map = new Map(rows.map((r) => [r.ym, Number(r.value)]));
  const out: { month: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: MONTHS_NL[d.getMonth()], value: map.get(ym) ?? 0 });
  }
  return out;
}

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Notitie",
  call: "Telefoon",
  email: "E-mail",
  meeting: "Afspraak",
  task: "Taak",
};

export default async function DashboardPage() {
  const t0 = Date.now();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const openExpr = sql`${documents.status} not in ('paid', 'void', 'draft')`;

  const [[contactsTotal], recentProjects, [docAgg], [creditAgg], [purchaseAgg], [productsAgg], openPurchaseOrders, [activeProjectsAgg], recentActivity, holdedExpensesYTD, proformas, [acceptedAgg], dagtaken] =
    await Promise.all([
      db.select({ n: count() }).from(contacts),
      db.query.projects.findMany({
        orderBy: desc(projects.updatedAt),
        limit: 7,
        with: { contact: { columns: { name: true } } },
      }),
      db
        .select({
          // Ex BTW: omzet = subtotaal van facturen
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.issueDate} >= ${monthStart} then ${documents.subtotalEur} else 0 end), 0)`,
          revenueAll: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
          // Openstaand/vervallen blijft cash-flow (incl. BTW), dat is wat klant betaalt.
          outstandingN: sql<number>`count(case when ${openExpr} then 1 end)::int`,
          outstandingV: sql<string>`coalesce(sum(case when ${openExpr} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
          overdueN: sql<number>`count(case when ${openExpr} and ${documents.dueDate} < ${today} then 1 end)::int`,
          overdueV: sql<string>`coalesce(sum(case when ${openExpr} and ${documents.dueDate} < ${today} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
        })
        .from(documents)
        // Concepten/geannuleerd tellen niet als omzet.
        .where(and(eq(documents.kind, "invoice"), notInArray(documents.status, ["draft", "void"]))),
      // Credit notes to subtract from revenue (ex BTW).
      db
        .select({
          paidAll: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.issueDate} >= ${monthStart} then ${documents.subtotalEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(and(eq(documents.kind, "creditnote"), notInArray(documents.status, ["draft", "void"]))),
      // Lokale PO's die nog niet in Holded staan — die zijn al "besteld + betaald"
      // maar zitten nog niet in de Holded-aankoopfacturen, dus tellen we los bij op.
      db
        .select({
          n: count(),
          totalEur: sql<string>`coalesce(sum(case when ${purchaseOrders.currency} = 'EUR' and ${purchaseOrders.holdedId} is null and ${purchaseOrders.status} not in ('draft', 'cancelled') then ${poExVatSql} else 0 end), 0)`,
        })
        .from(purchaseOrders),
      // Actieve producten zonder barcode + actieve producten onder de drempel.
      db
        .select({
          noBarcode: sql<number>`count(case when ${products.isActive} = true and ${products.barcode} is null then 1 end)::int`,
          lowStock: sql<number>`count(case when ${products.isActive} = true and ${products.stockMin} is not null and coalesce(${products.stockQty}, 0) < ${products.stockMin} then 1 end)::int`,
          stockNoPhoto: sql<number>`count(case when ${products.isActive} = true and ${products.imageUrl} is null then 1 end)::int`,
        })
        .from(products),
      db
        .select()
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.status, PO_OPEN_STATUSES))
        .orderBy(purchaseOrders.expectedDate),
      db.select({ n: count() }).from(projects).where(eq(projects.status, "active")),
      db.query.activities.findMany({
        orderBy: desc(activities.createdAt),
        limit: 10,
        with: {
          author: { columns: { name: true } },
          contact: { columns: { id: true, name: true } },
          document: { columns: { id: true, docNumber: true, kind: true } },
        },
      }),
      purchaseDocsTotalExBTW(),
      // Proforma's die op goedkeuring wachten
      db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "draft"))
        .orderBy(desc(purchaseOrders.createdAt)),
      // Geaccepteerde offertes die klaarstaan om gefactureerd te worden.
      db.select({ n: sql<number>`count(*)::int` }).from(documents).where(OFFERTE_TE_FACTUREREN),
      // De "Wat moet er gebeuren"-signalen — gedeelde bron met de startpagina.
      verzamelDagtaken(),
    ]);

  // Te bestellen: producten waarvan de VRIJE voorraad (fysiek − gereserveerd)
  // onder 0 zit. Eén lijst dekt zowel negatieve voorraad als reserveringen boven
  // de voorraad — het tekort = gereserveerd − voorraad. Order-only (op bestelling
  // gemaakt) telt niet mee.
  // Alle resterende dashboard-queries zijn onafhankelijk van elkaar — start ze
  // hier ALLEMAAL tegelijk. Voorheen liepen ze ná elkaar (13 aparte database-
  // rondreizen van elk ~50-150 ms) en dat was de hoofdoorzaak van het trage
  // dashboard. Promise.resolve(...) dwingt de lazy drizzle-builders om direct
  // te beginnen; de awaits verderop pakken alleen nog het resultaat.
  const since12 = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

  console.log(`[dash] eerste golf klaar na ${Date.now() - t0} ms`);
  // Tweede golf: één Promise.all, net als de eerste golf. Losse
  // Promise.resolve-kickoffs + een volle pool lieten postgres.js queries
  // pipelinen waarvan er één in protocol-limbo bleef (server: ClientRead)
  // — de response sloot dan pas bij de functie-timeout van 60 s.
  const [reservedByProduct, activeProductRows, estimateRows, invoicedSumRows, openOffertes, openSalesInvoices, plannedDeliveries, deliveredDocRows, toPlanRows, doorProductRows, doorInvoiceRows, productCostRows, cogsRows, revByMonthRows, estByMonthRows, [estConv]] = await Promise.all([
    getReservedStockByProduct(),
    db
      .select({ id: products.id, sku: products.sku, name: products.name, stockQty: products.stockQty })
      .from(products)
      .where(eq(products.isActive, true)),
    db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
        contactName: contacts.name,
      })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .where(OFFERTE_TE_FACTUREREN),
    db
      .select({
        src: documents.sourceDocumentId,
        invoiced: sql<number>`coalesce(sum(${documents.totalEur}), 0)::float8`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.kind, "invoice"),
          ne(documents.status, "void"),
          isNotNull(documents.sourceDocumentId),
        ),
      )
      .groupBy(documents.sourceDocumentId),
    db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
        issueDate: documents.issueDate,
        contactName: contacts.name,
      })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .where(and(eq(documents.kind, "estimate"), eq(documents.status, "sent")))
      .orderBy(desc(documents.issueDate))
      .limit(50),
    db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        totalEur: documents.totalEur,
        paidEur: documents.paidEur,
        dueDate: documents.dueDate,
        status: documents.status,
        contactName: contacts.name,
      })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .where(
        and(
          eq(documents.kind, "invoice"),
          inArray(documents.status, ["sent", "partially_paid", "overdue"]),
        ),
      )
      .orderBy(documents.dueDate)
      .limit(50),
    db
      .select({
        id: deliveries.id,
        plannedDate: deliveries.plannedDate,
        method: deliveries.method,
        status: deliveries.status,
        notifiedAt: deliveries.notifiedAt,
        docId: documents.id,
        docNumber: documents.docNumber,
        contactName: contacts.name,
      })
      .from(deliveries)
      .leftJoin(documents, eq(documents.id, deliveries.documentId))
      .leftJoin(contacts, eq(contacts.id, deliveries.contactId))
      .where(inArray(deliveries.status, ["gepland", "onderweg"]))
      .orderBy(deliveries.plannedDate),
    db.select({ id: deliveries.documentId }).from(deliveries),
    db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        title: documents.title,
        items: documents.items,
        issueDate: documents.issueDate,
        contactName: contacts.name,
        projectName: projects.name,
      })
      .from(documents)
      .leftJoin(contacts, eq(contacts.id, documents.contactId))
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .where(
        and(
          eq(documents.kind, "invoice"),
          inArray(documents.status, ["sent", "paid", "partially_paid", "overdue"]),
        ),
      )
      .orderBy(desc(documents.issueDate)),
    db.select({ id: products.id }).from(products).where(sql`${products.sku} like 'DR-00%'`),
    db
      .select({
        id: documents.id,
        docNumber: documents.docNumber,
        items: documents.items,
        projectName: projects.name,
      })
      .from(documents)
      .leftJoin(projects, eq(documents.projectId, projects.id))
      .where(eq(documents.kind, "invoice")),
    db.select({ id: products.id, costEur: products.costEur }).from(products),
    db
      .select({ items: documents.items, issueDate: documents.issueDate, kind: documents.kind })
      .from(documents)
      .where(inArray(documents.kind, ["invoice", "creditnote"])),
    db
      .select({
        ym: sql<string>`to_char(${documents.issueDate}, 'YYYY-MM')`,
        value: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
      })
      .from(documents)
      .where(and(eq(documents.kind, "invoice"), notInArray(documents.status, ["draft", "void"]), gte(documents.issueDate, since12)))
      .groupBy(sql`to_char(${documents.issueDate}, 'YYYY-MM')`),
    db
      .select({
        ym: sql<string>`to_char(${documents.issueDate}, 'YYYY-MM')`,
        value: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
      })
      .from(documents)
      .where(and(eq(documents.kind, "estimate"), gte(documents.issueDate, since12)))
      .groupBy(sql`to_char(${documents.issueDate}, 'YYYY-MM')`),
    db
      .select({
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`count(case when ${documents.status} = 'accepted' then 1 end)::int`,
        acceptedValue: sql<string>`coalesce(sum(case when ${documents.status} = 'accepted' then ${documents.subtotalEur} else 0 end), 0)`,
      })
      .from(documents)
      .where(eq(documents.kind, "estimate")),
  ]);
  console.log(`[dash] tweede golf klaar na ${Date.now() - t0} ms`);
  const toOrder = activeProductRows
    .map((p) => {
      const reserved = reservedByProduct.get(p.id) ?? 0;
      const stock = Number(p.stockQty ?? 0);
      return { sku: p.sku, name: p.name, reserved, stock, need: reserved - stock };
    })
    .filter((p) => p.need > 0)
    .sort((a, b) => b.need - a.need)
    .slice(0, 100);

  // Nog af te rekenen: offertes die deels gefactureerd zijn (gekoppelde facturen
  // < offertebedrag) → er moet nog een eindafrekening komen.
  const invoicedByEstimate = new Map(invoicedSumRows.map((r) => [r.src, Number(r.invoiced)]));
  const toSettle = estimateRows
    .map((e) => {
      const invoiced = invoicedByEstimate.get(e.id) ?? 0;
      return { ...e, invoiced, rest: Number(e.totalEur ?? 0) - invoiced };
    })
    .filter((e) => e.invoiced > 0.01 && e.rest > 0.01)
    .sort((a, b) => b.rest - a.rest)
    .slice(0, 50);

  // Open offertes: uitgebracht (verstuurd) en wachtend op antwoord.

  // Openstaande verkoopfacturen — verzonden/deels betaald/vervallen, nog te ontvangen.

  // Geplande leveringen (gepland/onderweg) — eerstvolgende bovenaan.

  // Te plannen: verkochte facturen met productregels die nog geen levering hebben.
  const deliveredDocIds = new Set(deliveredDocRows.map((r) => r.id).filter(Boolean) as string[]);
  const toPlan = toPlanRows
    .filter(
      (d) =>
        !deliveredDocIds.has(d.id) &&
        normalizeDocItems(d.items).some((it) => it.productId && it.units),
    )
    .slice(0, 30);

  // Facturen met een deur/deur-set-regel waarvan de draairichting (S1–S4) nog
  // niet gekozen is — zodat je een set kunt factureren en de richting later
  // aangeeft. We detecteren het direct uit de regels (geen losse notitie nodig).
  const doorProductIds = new Set(doorProductRows.map((r) => r.id));
  const doorOrientationDocs = doorInvoiceRows
    .map((d) => {
      const units = normalizeDocItems(d.items)
        .filter(
          (it) =>
            it.productId &&
            doorProductIds.has(it.productId) &&
            !/\bS[1-4]\b/.test(`${it.name ?? ""} ${it.description ?? ""}`),
        )
        .reduce((sum, it) => sum + (Number(it.units) || 0), 0);
      return units > 0 ? { id: d.id, docNumber: d.docNumber, projectName: d.projectName, units } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const doorOrientationN = doorOrientationDocs.length;

  const revenueAll = Number(docAgg.revenueAll) - Number(creditAgg.paidAll);
  const revenueMonth = Number(docAgg.revenueMonth) - Number(creditAgg.revenueMonth);

  // Marge = omzet − kostprijs van de verkochte producten (COGS uit de
  // factuurregels × products.costEur). Creditnota's draaien de marge terug.
  // Regels zonder gekoppeld product (bv. arbeid) tellen niet mee in de COGS.
  const costMap = new Map(productCostRows.map((p) => [p.id, Number(p.costEur) || 0]));
  let cogsAll = 0;
  let cogsMonth = 0;
  for (const d of cogsRows) {
    const sign = d.kind === "creditnote" ? -1 : 1;
    const inMonth = !!d.issueDate && String(d.issueDate).slice(0, 10) >= monthStart;
    for (const it of normalizeDocItems(d.items)) {
      if (!it.productId) continue;
      const c = (costMap.get(it.productId) ?? 0) * (Number(it.units) || 0) * sign;
      cogsAll += c;
      if (inMonth) cogsMonth += c;
    }
  }
  const marginAll = revenueAll - cogsAll;
  const marginMonth = revenueMonth - cogsMonth;
  const marginPctAll = revenueAll > 0 ? Math.round((marginAll / revenueAll) * 100) : 0;
  const marginPctMonth = revenueMonth > 0 ? Math.round((marginMonth / revenueMonth) * 100) : 0;
  const unpushedPurchase = Number(purchaseAgg.totalEur);
  const totalPurchase = Number(holdedExpensesYTD) + unpushedPurchase;
  const acceptedN = acceptedAgg?.n ?? 0;

  // --- Grafieken: omzet & offerte-waarde per maand (12 mnd) + conversie ---
  const revSeries = monthSeries(now, revByMonthRows);
  const estSeries = monthSeries(now, estByMonthRows);
  const convPct = estConv && estConv.total > 0 ? Math.round((estConv.accepted / estConv.total) * 100) : 0;
  const acceptedOfferteValue = Number(estConv?.acceptedValue ?? 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van de pijplijn, facturen en activiteit"
        actions={<LinkButton href="/contacts/new">Nieuw contact</LinkButton>}
      />

      <TabsRoot
        defaultTab="vandaag"
        ids={["vandaag", "verkoop", "inkoop", "activiteit"]}
        className="flex flex-col"
      >
      {/* KPI's — altijd zichtbaar onder de tabbalk */}
      <div className="order-1 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Omzet deze maand" value={formatEUR(revenueMonth)} hint={marginPctMonth != null ? `${marginPctMonth}% marge · ex. BTW` : "ex. BTW"} tone="success" icon={<TrendingUp className="size-5" />} />
        <StatTile label="Openstaande facturen" value={docAgg.outstandingN} hint={formatEUR(docAgg.outstandingV)} tone="warning" icon={<Clock className="size-5" />} />
        <StatTile label="Vervallen facturen" value={docAgg.overdueN} hint={formatEUR(docAgg.overdueV)} tone="danger" icon={<AlertTriangle className="size-5" />} />
        <StatTile label="Geaccepteerde offertes" value={acceptedN} hint="klaar om te factureren" tone="accent" icon={<CheckCircle2 className="size-5" />} />
        <StatTile label="Totale omzet" value={formatEUR(revenueAll)} hint={marginPctAll != null ? `${marginPctAll}% marge · dit jaar` : "ex. BTW · dit jaar"} tone="info" icon={<Wallet className="size-5" />} />
      </div>

        <TabsBar
          className="order-2"
          tabs={[
            { id: "vandaag", label: "Vandaag", icon: <LayoutDashboard /> },
            { id: "verkoop", label: "Verkoop", icon: <TrendingUp /> },
            { id: "inkoop", label: "Inkoop", icon: <ShoppingCart /> },
            { id: "activiteit", label: "Activiteit", icon: <Activity /> },
          ]}
        />

        {/* ── Tab: Vandaag — cijfers, acties, aanmaningen ── */}
        <TabPanel id="vandaag" className="order-3">
      <details className="mb-6 -mt-3">
        <summary className="cursor-pointer select-none text-xs text-muted transition-colors hover:text-foreground">
          Meer cijfers — inkoop, projecten, contacten
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="Totale inkoop"
            value={formatEUR(totalPurchase)}
            hint={
              unpushedPurchase > 0
                ? `ex. BTW · Holded ${formatEUR(holdedExpensesYTD)} + ${purchaseAgg.n} PO's`
                : "ex. BTW · uit Holded"
            }
          />
          <StatTile label="Inkooporders onderweg" value={openPurchaseOrders.length} hint="aankomende voorraad" />
          <StatTile label="Actieve projecten" value={activeProjectsAgg?.n ?? 0} hint="lopende klussen" />
          <StatTile label="Contacten" value={contactsTotal.n} />
          <StatTile label="Onder voorraaddrempel" value={productsAgg.lowStock} hint="producten" />
          <StatTile label="Producten zonder foto" value={productsAgg.stockNoPhoto} />
          <StatTile label="Producten zonder barcode" value={productsAgg.noBarcode} />
        </div>
      </details>

      <DagtakenLijst taken={dagtaken} />

      {(doorOrientationN > 0 || toSettle.length > 0 || toOrder.length > 0) && (
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start">
      {doorOrientationN > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 lg:flex-1 lg:min-w-0">
          <CardHeader>
            <CardTitle>
              🚪 {doorOrientationN} factu{doorOrientationN === 1 ? "ur" : "ren"} — draairichting kiezen
            </CardTitle>
            <LinkButton href="/draairichtingen" className="text-xs">
              → Toewijzen
            </LinkButton>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted">
              Bij deze deur-facturen moet je nog per regel de draairichting (S1–S4) en het aantal per richting opgeven.
            </p>
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-sm">
              {doorOrientationDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-1.5">
                  <Link href={`/draairichtingen`} className="truncate font-medium hover:underline">
                    {d.docNumber ?? "(geen nr.)"}
                    {d.projectName && <span className="ml-1 font-normal text-muted">· {d.projectName}</span>}
                  </Link>
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 tabular-nums">
                    {d.units} {d.units === 1 ? "deur" : "deuren"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {toSettle.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/40 lg:flex-1 lg:min-w-0">
          <CardHeader>
            <CardTitle>
              🧾 {toSettle.length} offerte{toSettle.length === 1 ? "" : "s"} nog af te rekenen — deels gefactureerd
            </CardTitle>
            <LinkButton href="/quotes" className="text-xs">
              Alle offertes
            </LinkButton>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted">
              Hier is al een (deel)factuur van gemaakt, maar nog niet het volledige bedrag. Maak de
              eindafrekening.
            </p>
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-sm">
              {toSettle.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-3 py-1.5"
                >
                  <span className="min-w-0 truncate">
                    <Link href={`/documents/${e.id}`} className="font-medium hover:underline">
                      {e.docNumber ?? "(offerte)"}
                    </Link>{" "}
                    <span className="text-muted">{e.contactName ?? e.title ?? ""}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {formatEUR(e.invoiced)} van {formatEUR(e.totalEur)} ·{" "}
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">
                      nog {formatEUR(e.rest)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {toOrder.length > 0 && (
        <Card className="border-red-200 bg-red-50/40 lg:flex-1 lg:min-w-0">
          <CardHeader>
            <CardTitle>
              🛒 {toOrder.length} product{toOrder.length === 1 ? "" : "en"} bijbestellen — te weinig vrije voorraad
            </CardTitle>
            <form action={reorderShortagesToDrafts}>
              <SubmitButton size="sm" className="text-xs" pendingLabel="Bezig…">
                → Bestellen
              </SubmitButton>
            </form>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted">
              Onder 0 op voorraad óf gereserveerd boven de voorraad. Eén klik zet het tekort als
              concept-bestelbon per leverancier klaar.
            </p>
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-sm">
              {toOrder.map((p) => (
                <li
                  key={p.sku ?? p.name}
                  className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-1.5"
                >
                  <span className="truncate">
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="font-mono text-xs text-muted">{p.sku}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="text-muted">
                      {p.reserved > 0 ? `${p.reserved} geres. · ` : ""}
                      <span className={p.stock < 0 ? "text-danger" : ""}>{p.stock} voorr.</span>
                    </span>{" "}
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800">
                      bestel {Math.ceil(p.need)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
        </div>
      )}

      {/* Open offertes + openstaande verkoopfacturen */}
        </TabPanel>

        {/* ── Tab: Verkoop — offertes, leveringen, omzet ── */}
        <TabPanel id="verkoop" className="order-3">
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open offertes{openOffertes.length > 0 ? ` (${openOffertes.length})` : ""}</CardTitle>
            <Link href="/quotes" className="text-xs text-accent hover:underline">
              Alle offertes
            </Link>
          </CardHeader>
          {openOffertes.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen openstaande offertes.</p>
            </CardContent>
          ) : (
            <Table wrapperClassName="max-h-80 overflow-y-auto">
              <THead>
                <tr>
                  <Th>Nr.</Th>
                  <Th>Klant</Th>
                  <Th className="text-right">Bedrag</Th>
                  <Th className="text-right">Open</Th>
                </tr>
              </THead>
              <TBody>
                {openOffertes.map((o) => {
                  const days = o.issueDate
                    ? Math.max(0, Math.round((now.getTime() - new Date(o.issueDate).getTime()) / 86400000))
                    : null;
                  return (
                    <Tr key={o.id}>
                      <Td>
                        <Link href={`/documents/${o.id}`} className="font-medium hover:underline">
                          {o.docNumber ?? "(offerte)"}
                        </Link>
                      </Td>
                      <Td className="text-muted">{o.contactName ?? o.title ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{formatEUR(o.totalEur)}</Td>
                      <Td className="text-right text-muted">{days != null ? `${days}d` : "—"}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Openstaande facturen{openSalesInvoices.length > 0 ? ` (${openSalesInvoices.length})` : ""}
            </CardTitle>
            <Link href="/invoices" className="text-xs text-accent hover:underline">
              Alle facturen
            </Link>
          </CardHeader>
          {openSalesInvoices.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen openstaande facturen.</p>
            </CardContent>
          ) : (
            <Table wrapperClassName="max-h-80 overflow-y-auto">
              <THead>
                <tr>
                  <Th>Nr.</Th>
                  <Th>Klant</Th>
                  <Th>Vervalt</Th>
                  <Th className="text-right">Open</Th>
                </tr>
              </THead>
              <TBody>
                {openSalesInvoices.map((inv) => {
                  const open = Number(inv.totalEur ?? 0) - Number(inv.paidEur ?? 0);
                  const overdue = !!inv.dueDate && inv.dueDate < today;
                  return (
                    <Tr key={inv.id}>
                      <Td>
                        <Link href={`/documents/${inv.id}`} className="font-medium hover:underline">
                          {inv.docNumber ?? "(factuur)"}
                        </Link>
                      </Td>
                      <Td className="text-muted">{inv.contactName ?? "—"}</Td>
                      <Td className={overdue ? "font-medium text-danger" : "text-muted"}>
                        {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                        {overdue ? " · vervallen" : ""}
                      </Td>
                      <Td className="text-right font-medium tabular-nums">{formatEUR(open)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Leveringen: te plannen + ingepland */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Te plannen leveringen{toPlan.length > 0 ? ` (${toPlan.length})` : ""}</CardTitle>
            <Link href="/leveringen" className="text-xs text-accent hover:underline">
              Inplannen →
            </Link>
          </CardHeader>
          {toPlan.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen leveringen te plannen.</p>
            </CardContent>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
              {toPlan.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <span className="min-w-0">
                    <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                      {d.docNumber ?? "(factuur)"}
                    </Link>{" "}
                    <span className="text-muted">{d.contactName ?? ""}</span>
                    {(d.projectName || d.title) && (
                      <span className="block truncate text-xs text-muted">
                        {[d.projectName, d.title].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <form action={markPickedUp.bind(null, d.id)}>
                      <SubmitButton
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted"
                        pendingLabel="…"
                      >
                        Afgehaald
                      </SubmitButton>
                    </form>
                    <Link href="/leveringen" className="text-xs font-medium text-accent hover:underline">
                      Plannen →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Geplande leveringen{plannedDeliveries.length > 0 ? ` (${plannedDeliveries.length})` : ""}
            </CardTitle>
          </CardHeader>
          {plannedDeliveries.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Nog niets ingepland.</p>
            </CardContent>
          ) : (
            <Table wrapperClassName="max-h-96 overflow-y-auto">
              <THead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Factuur</Th>
                  <Th>Klant</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </THead>
              <TBody>
                {plannedDeliveries.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium tabular-nums">
                      {d.plannedDate ? formatDate(d.plannedDate) : "—"}
                    </Td>
                    <Td>
                      {d.docId ? (
                        <Link href={`/documents/${d.docId}`} className="hover:underline">
                          {d.docNumber ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-muted">
                      {d.contactName ?? "—"}
                      {d.notifiedAt ? " · ✉ gemeld" : ""}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-muted">
                          {d.method === "ophalen"
                            ? "🤝 ophalen"
                            : d.method === "plaatsen"
                              ? "🔧 plaatsen"
                              : "🚚 leveren"}
                        </span>
                        <Badge tone={d.status === "onderweg" ? "info" : "neutral"}>
                          {d.status === "onderweg" ? "Onderweg" : "Gepland"}
                        </Badge>
                        <form action={setDeliveryStatus.bind(null, d.id, "geleverd")}>
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                            Geleverd
                          </SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Omzet per maand</CardTitle>
            <span className="text-xs text-muted">facturen · ex. BTW</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={revSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Offerte-waarde per maand</CardTitle>
            <span className="text-xs text-muted">uitgebracht · ex. BTW</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={estSeries} color="#a98a4b" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Offerte-conversie"
          value={`${convPct}%`}
          hint={`${estConv?.accepted ?? 0} van ${estConv?.total ?? 0} geaccepteerd`}
        />
        <StatTile
          label="Geaccepteerde offerte-omzet"
          value={formatEUR(acceptedOfferteValue)}
          hint="ex. BTW"
        />
      </div>

        </TabPanel>

        {/* ── Tab: Inkoop — orders, proforma's, inkoopfacturen ── */}
        <TabPanel id="inkoop" className="order-3">
      {openPurchaseOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Inkooporders onderweg</CardTitle>
            <Link href="/inkooporders" className="text-xs text-accent hover:underline">
              Alle inkooporders
            </Link>
          </CardHeader>
          <Table wrapperClassName="max-h-80 overflow-y-auto">
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Verwacht</Th>
                <Th className="text-right">Regels</Th>
                <Th className="text-right">Totaal</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {openPurchaseOrders.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                      {po.supplier}
                    </Link>
                  </Td>
                  <Td className="text-muted">{po.reference ?? "—"}</Td>
                  <Td className="text-muted">
                    {po.expectedDate
                      ? new Date(po.expectedDate).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{po.items?.length ?? 0}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                  <Td>
                    <Badge tone={PO_STATUS_META[po.status].tone}>{PO_STATUS_META[po.status].label}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {proformas.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Proforma&apos;s ter goedkeuring</CardTitle>
            <Link href="/inkooporders" className="text-xs text-accent hover:underline">
              Alle inkooporders
            </Link>
          </CardHeader>
          <Table wrapperClassName="max-h-80 overflow-y-auto">
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th className="text-right">Bedrag</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {proformas.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                      {po.supplier}
                    </Link>
                  </Td>
                  <Td className="text-muted">{po.reference ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                  <Td className="text-right">
                    <form
                      action={async () => {
                        "use server";
                        await approveProforma(po.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                      >
                        Goedkeuren
                      </button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

        </TabPanel>

        {/* ── Tab: Activiteit — recente activiteit + projecten ── */}
        <TabPanel id="activiteit" className="order-3">
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recente activiteit</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState title="Nog geen activiteit" />
            ) : (
              <ol className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {recentActivity.map((a) => {
                  const link = a.document
                    ? { href: `/documents/${a.document.id}`, label: `${documentKindMeta[a.document.kind]} ${a.document.docNumber ?? ""}`.trim() }
                    : a.contact
                      ? { href: `/contacts/${a.contact.id}`, label: a.contact.name }
                      : null;
                  return (
                    <li key={a.id} className="border-l-2 border-border pl-3">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="font-medium uppercase tracking-wide">
                          {ACTIVITY_LABEL[a.type] ?? a.type}
                        </span>
                        <span>·</span>
                        <span>{formatDate(a.createdAt)}</span>
                        {a.author?.name && (
                          <>
                            <span>·</span>
                            <span>{a.author.name}</span>
                          </>
                        )}
                        {link && (
                          <>
                            <span>·</span>
                            <Link href={link.href} className="text-accent hover:underline">
                              {link.label}
                            </Link>
                          </>
                        )}
                      </div>
                      {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
                      {a.body && (
                        <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recente projecten</CardTitle>
            <Link href="/projects" className="text-xs text-accent hover:underline">
              Alles bekijken
            </Link>
          </CardHeader>
          {recentProjects.length === 0 ? (
            <CardContent>
              <EmptyState title="Nog geen projecten" />
            </CardContent>
          ) : (
            <Table wrapperClassName="max-h-80 overflow-y-auto">
              <THead>
                <tr>
                  <Th>Project</Th>
                  <Th>Klant</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </THead>
              <TBody>
                {recentProjects.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </Td>
                    <Td className="text-muted">{p.contact?.name ?? "—"}</Td>
                    <Td className="text-right">
                      <Badge tone={p.status === "active" ? "success" : "neutral"}>
                        {p.status === "active" ? "Actief" : "Gearchiveerd"}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
        </TabPanel>
      </TabsRoot>
    </>
  );
}
