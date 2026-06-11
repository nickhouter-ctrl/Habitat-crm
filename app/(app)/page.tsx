import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, Wallet } from "lucide-react";

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
import { db } from "@/lib/db";
import { activities, contacts, documents, emailInbox, mailAttachments, products, projects, purchaseOrders, quoteRequests } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { purchaseDocsTotalExBTW } from "@/lib/holded/accounting";
import { formatMoney, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { formatDate, formatEUR } from "@/lib/utils";
import { documentKindMeta } from "./_meta";
import { approveProforma, markPurchaseOrderPaid } from "./inkooporders/actions";

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

/** Eén regel in het "Wat moet er gebeuren"-paneel. */
function ActionRow({
  href,
  emoji,
  tone = "accent",
  children,
}: {
  href: string;
  emoji: string;
  tone?: "accent" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const toneText =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-accent";
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-foreground transition-colors hover:bg-background"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="flex-1">{children}</span>
      <span className={`shrink-0 font-medium ${toneText}`}>→</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const openExpr = sql`${documents.status} not in ('paid', 'void', 'draft')`;

  const [[contactsTotal], recentProjects, [docAgg], [creditAgg], [purchaseAgg], [productsAgg], openPurchaseOrders, [activeProjectsAgg], recentActivity, holdedExpensesYTD, [openRequestsAgg], [invoiceReviewAgg], unpaidInvoices, proformas, [acceptedAgg], unbookedStockRows] =
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
        .where(eq(documents.kind, "invoice")),
      // Credit notes to subtract from revenue (ex BTW).
      db
        .select({
          paidAll: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.issueDate} >= ${monthStart} then ${documents.subtotalEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(eq(documents.kind, "creditnote")),
      // Lokale PO's die nog niet in Holded staan — die zijn al "besteld + betaald"
      // maar zitten nog niet in de Holded-aankoopfacturen, dus tellen we los bij op.
      db
        .select({
          n: count(),
          totalEur: sql<string>`coalesce(sum(case when ${purchaseOrders.currency} = 'EUR' and ${purchaseOrders.holdedId} is null and ${purchaseOrders.status} not in ('draft', 'cancelled') then coalesce(${purchaseOrders.subtotal}, ${purchaseOrders.total}) else 0 end), 0)`,
        })
        .from(purchaseOrders),
      // Actieve producten zonder barcode + actieve producten onder de drempel.
      db
        .select({
          noBarcode: sql<number>`count(case when ${products.isActive} = true and ${products.barcode} is null then 1 end)::int`,
          lowStock: sql<number>`count(case when ${products.isActive} = true and ${products.availability} <> 'order_only' and ${products.stockMin} is not null and coalesce(${products.stockQty}, 0) < ${products.stockMin} then 1 end)::int`,
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
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(quoteRequests)
        .where(eq(quoteRequests.status, "pending")),
      // Inkoopfacturen die handmatige review nodig hebben — mails met financiële
      // bijlages die nog niet aan een PO gelinkt zijn
      db
        .select({
          n: sql<number>`count(distinct ${emailInbox.id})::int`,
        })
        .from(emailInbox)
        .innerJoin(mailAttachments, eq(mailAttachments.emailId, emailInbox.id))
        .where(
          and(
            isNull(emailInbox.linkedPurchaseOrderId),
            sql`${mailAttachments.category} IN ('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor','quote-proforma')`,
            sql`${emailInbox.status} != 'archived'`,
          ),
        ),
      // Openstaande inkoopfacturen — nog te betalen (nieuwste eerst)
      db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            isNull(purchaseOrders.paidAt),
            sql`${purchaseOrders.status} not in ('draft', 'cancelled')`,
          ),
        )
        .orderBy(desc(purchaseOrders.createdAt)),
      // Proforma's die op goedkeuring wachten
      db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "draft"))
        .orderBy(desc(purchaseOrders.createdAt)),
      // Geaccepteerde offertes die klaarstaan om gefactureerd te worden.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(and(eq(documents.kind, "estimate"), eq(documents.status, "accepted"))),
      // Verstuurde/betaalde facturen met productregels waarvan de voorraad nog
      // niet is afgeboekt — productregels checken we in JS (jsonb-veilig).
      db
        .select({ id: documents.id, items: documents.items })
        .from(documents)
        .where(
          and(
            eq(documents.kind, "invoice"),
            inArray(documents.status, ["sent", "paid", "partially_paid", "overdue"]),
            isNull(documents.stockAppliedAt),
          ),
        ),
    ]);
  const unbookedStockN = unbookedStockRows.filter((d) =>
    normalizeDocItems(d.items).some((it) => it.productId && it.units),
  ).length;

  // Producten onder 0 (oversold) — moeten bijbesteld worden. Order-only (op
  // bestelling gemaakt) tellen niet mee.
  const reorderProducts = await db
    .select({ sku: products.sku, name: products.name, stockQty: products.stockQty })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        sql`${products.availability} <> 'order_only'`,
        sql`coalesce(${products.stockQty}, 0) < 0`,
      ),
    )
    .orderBy(products.stockQty)
    .limit(50);

  // Facturen met een deur/deur-set-regel waarvan de draairichting (S1–S4) nog
  // niet gekozen is — zodat je een set kunt factureren en de richting later
  // aangeeft. We detecteren het direct uit de regels (geen losse notitie nodig).
  const doorProductIds = new Set(
    (await db.select({ id: products.id }).from(products).where(sql`${products.sku} like 'DR-00%'`)).map(
      (r) => r.id,
    ),
  );
  const doorInvoiceRows = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      items: documents.items,
      projectName: projects.name,
    })
    .from(documents)
    .leftJoin(projects, eq(documents.projectId, projects.id))
    .where(eq(documents.kind, "invoice"));
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
  const productCostRows = await db.select({ id: products.id, costEur: products.costEur }).from(products);
  const costMap = new Map(productCostRows.map((p) => [p.id, Number(p.costEur) || 0]));
  const cogsRows = await db
    .select({ items: documents.items, issueDate: documents.issueDate, kind: documents.kind })
    .from(documents)
    .where(inArray(documents.kind, ["invoice", "creditnote"]));
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
  const unpaidPurchaseTotal = unpaidInvoices.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const acceptedN = acceptedAgg?.n ?? 0;
  const poSoon = openPurchaseOrders.filter((po) => {
    if (!po.expectedDate) return false;
    const diff = (new Date(po.expectedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 7 && diff >= -1;
  }).length;
  const anyActions =
    acceptedN > 0 ||
    (openRequestsAgg?.n ?? 0) > 0 ||
    docAgg.overdueN > 0 ||
    unbookedStockN > 0 ||
    unpaidInvoices.length > 0 ||
    proformas.length > 0 ||
    (invoiceReviewAgg?.n ?? 0) > 0 ||
    poSoon > 0 ||
    productsAgg.lowStock > 0 ||
    productsAgg.stockNoPhoto > 0 ||
    productsAgg.noBarcode > 0 ||
    reorderProducts.length > 0;

  // --- Grafieken: omzet & offerte-waarde per maand (12 mnd) + conversie ---
  const since12 = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
  const [revByMonthRows, estByMonthRows, [estConv]] = await Promise.all([
    db
      .select({
        ym: sql<string>`to_char(${documents.issueDate}, 'YYYY-MM')`,
        value: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
      })
      .from(documents)
      .where(and(eq(documents.kind, "invoice"), gte(documents.issueDate, since12)))
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

      {doorOrientationN > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50/50">
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
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
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

      {reorderProducts.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50/40">
          <CardHeader>
            <CardTitle>
              🛒 {reorderProducts.length} product{reorderProducts.length === 1 ? "" : "en"} onder 0 — bijbestellen
            </CardTitle>
            <LinkButton href={`/bestellen?q=${encodeURIComponent(reorderProducts[0].sku ?? "")}`} className="text-xs">
              → Bestellen
            </LinkButton>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {reorderProducts.map((p) => {
                const stock = Number(p.stockQty ?? 0);
                const order = Math.ceil(Math.abs(stock) * 100) / 100;
                return (
                  <li key={p.sku ?? p.name} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-1.5">
                    <span className="truncate">
                      <span className="font-medium">{p.name}</span>{" "}
                      <span className="font-mono text-xs text-muted">{p.sku}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="text-danger">{stock}</span>{" "}
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800">bestel {order}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {anyActions ? (
        <Card className="mb-6 border-accent/30">
          <CardHeader>
            <CardTitle>Wat moet er gebeuren</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/70">
            {acceptedN > 0 && (
              <ActionRow href="/quotes" emoji="✅" tone="success">
                <strong>{acceptedN}</strong> geaccepteerde offerte{acceptedN === 1 ? "" : "s"} — klaar om te factureren.
              </ActionRow>
            )}
            {(openRequestsAgg?.n ?? 0) > 0 && (
              <ActionRow href="/aanvragen?status=pending" emoji="📩" tone="accent">
                <strong>{openRequestsAgg!.n}</strong> open offerte-aanvra{openRequestsAgg!.n === 1 ? "ag" : "gen"} via de website.
              </ActionRow>
            )}
            {docAgg.overdueN > 0 && (
              <ActionRow href="/invoices" emoji="⏰" tone="danger">
                <strong>{docAgg.overdueN}</strong> vervallen factu{docAgg.overdueN === 1 ? "ur" : "ren"} ({formatEUR(docAgg.overdueV)}) — verstuur herinnering.
              </ActionRow>
            )}
            {unbookedStockN > 0 && (
              <ActionRow href="/invoices" emoji="📦" tone="warning">
                <strong>{unbookedStockN}</strong> verstuurde/betaalde factu{unbookedStockN === 1 ? "ur" : "ren"} met productregels — voorraad nog niet afgeboekt.
              </ActionRow>
            )}
            {unpaidInvoices.length > 0 && (
              <ActionRow href="/inkooporders" emoji="💶" tone="warning">
                <strong>{unpaidInvoices.length}</strong> inkoopfactu{unpaidInvoices.length === 1 ? "ur" : "ren"} te betalen — {formatEUR(unpaidPurchaseTotal)}.
              </ActionRow>
            )}
            {proformas.length > 0 && (
              <ActionRow href="/inkooporders" emoji="🗂️" tone="accent">
                <strong>{proformas.length}</strong> proforma{proformas.length === 1 ? "" : "'s"} wacht{proformas.length === 1 ? "" : "en"} op goedkeuring.
              </ActionRow>
            )}
            {(invoiceReviewAgg?.n ?? 0) > 0 && (
              <ActionRow href="/inbox?status=new" emoji="🧾" tone="warning">
                <strong>{invoiceReviewAgg!.n}</strong> mail{invoiceReviewAgg!.n === 1 ? "" : "s"} met factuur/proforma-bijlage — in inkoop zetten?
              </ActionRow>
            )}
            {poSoon > 0 && (
              <ActionRow href="/inkooporders" emoji="📦" tone="accent">
                <strong>{poSoon}</strong> inkooporder{poSoon === 1 ? "" : "s"} kom{poSoon === 1 ? "t" : "en"} deze week binnen.
              </ActionRow>
            )}
            {productsAgg.lowStock > 0 && (
              <ActionRow href="/inkooporders/bestellen" emoji="🔻" tone="danger">
                <strong>{productsAgg.lowStock}</strong> producten onder de voorraaddrempel — bijbestellen.
              </ActionRow>
            )}
            {productsAgg.stockNoPhoto > 0 && (
              <ActionRow href="/products?nofoto=1" emoji="📸" tone="warning">
                <strong>{productsAgg.stockNoPhoto}</strong> actieve producten zonder foto.
              </ActionRow>
            )}
            {productsAgg.noBarcode > 0 && (
              <ActionRow href="/products?nobarcode=1" emoji="🏷️" tone="warning">
                <strong>{productsAgg.noBarcode}</strong> producten zonder barcode.
              </ActionRow>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          ✓ Niets dringends — alles is bij.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Omzet deze maand" value={formatEUR(revenueMonth)} hint={marginPctMonth != null ? `${marginPctMonth}% marge · ex. BTW` : "ex. BTW"} tone="success" icon={<TrendingUp className="size-5" />} />
        <StatTile label="Openstaande facturen" value={docAgg.outstandingN} hint={formatEUR(docAgg.outstandingV)} tone="warning" icon={<Clock className="size-5" />} />
        <StatTile label="Vervallen facturen" value={docAgg.overdueN} hint={formatEUR(docAgg.overdueV)} tone="danger" icon={<AlertTriangle className="size-5" />} />
        <StatTile label="Geaccepteerde offertes" value={acceptedN} hint="klaar om te factureren" tone="accent" icon={<CheckCircle2 className="size-5" />} />
        <StatTile label="Totale omzet" value={formatEUR(revenueAll)} hint={marginPctAll != null ? `${marginPctAll}% marge · dit jaar` : "ex. BTW · dit jaar"} tone="info" icon={<Wallet className="size-5" />} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Meer marge- en winstanalyses (per product, collectie, klant) staan in{" "}
        <Link href="/rapporten" className="text-accent hover:underline">Rapporten</Link>.
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs text-muted transition-colors hover:text-foreground">
          Meer cijfers — inkoop, pijplijn, contacten
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile
            label="Totale inkoop"
            value={formatEUR(totalPurchase)}
            hint={
              unpushedPurchase > 0
                ? `ex. BTW · Holded ${formatEUR(holdedExpensesYTD)} + ${purchaseAgg.n} PO's`
                : "ex. BTW · uit Holded"
            }
          />
          <StatTile label="Te betalen (inkoop)" value={unpaidInvoices.length} hint={formatEUR(unpaidPurchaseTotal)} />
          <StatTile label="Inkooporders onderweg" value={openPurchaseOrders.length} hint="aankomende voorraad" />
          <StatTile label="Actieve projecten" value={activeProjectsAgg?.n ?? 0} hint="lopende klussen" />
          <StatTile label="Contacten" value={contactsTotal.n} />
        </div>
      </details>

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Openstaande inkoopfacturen</CardTitle>
          <Link href="/inkooporders" className="text-xs text-accent hover:underline">
            Alle inkooporders
          </Link>
        </CardHeader>
        {unpaidInvoices.length === 0 ? (
          <CardContent>
            <EmptyState title="Alles betaald ✓" description="Geen openstaande inkoopfacturen." />
          </CardContent>
        ) : (
          <Table wrapperClassName="max-h-80 overflow-y-auto">
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Vervaldatum</Th>
                <Th className="text-right">Bedrag</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {unpaidInvoices.map((po) => {
                const overdue = !!po.dueDate && po.dueDate < today;
                return (
                  <Tr key={po.id}>
                    <Td>
                      <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                        {po.supplier}
                      </Link>
                    </Td>
                    <Td className="text-muted">{po.reference ?? "—"}</Td>
                    <Td className={overdue ? "font-medium text-danger" : "text-muted"}>
                      {po.dueDate ? formatDate(po.dueDate) : "—"}
                      {overdue ? " · vervallen" : ""}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatMoney(po.total, po.currency)}
                    </Td>
                    <Td className="text-right">
                      <form
                        action={async () => {
                          "use server";
                          await markPurchaseOrderPaid(po.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                        >
                          Betaald
                        </button>
                      </form>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

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
    </>
  );
}
