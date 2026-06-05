import { asc, desc, eq, sql } from "drizzle-orm";

import { normalizeDocItems } from "@/lib/documents";
import {
  Card,
  CardContent,
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
import { HorizontalBarChart, MonthlyAmountChart } from "@/components/rapporten-charts";
import { db } from "@/lib/db";
import { contacts, documents, products, purchaseOrders } from "@/lib/db/schema";
import { purchaseDocsByMonth } from "@/lib/holded/accounting";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Rapporten" };

const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function lastTwelveMonths(): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: MONTH_LABELS[d.getMonth()] + (d.getMonth() === 0 || i === 11 ? ` ${String(d.getFullYear()).slice(-2)}` : "") });
  }
  return out;
}

export default async function RapportenPage() {
  const months = lastTwelveMonths();
  const from = months[0].key + "-01";

  // Holded aankoopfacturen-overzicht: exact zoals in Holded's "Aankoopfacturen"-pagina (sum subtotal ex BTW).
  const [holdedExpenses, revenueRows, topCustomers, topProductsRows, supplierRows, leadSourceRows, openInvoices, allDocsForMargin] =
    await Promise.all([
      purchaseDocsByMonth(12),
      // Omzet per maand (ex BTW), uit eigen documenten (zelfde model dat door Holded gesynct is).
      db.execute(sql`
        select to_char(issue_date,'YYYY-MM') as ym,
               coalesce(sum(case when kind='invoice' then subtotal_eur else 0 end),0)::text as invoiced,
               coalesce(sum(case when kind='creditnote' then subtotal_eur else 0 end),0)::text as credited
        from documents
        where issue_date is not null and issue_date >= ${from}
        group by ym order by ym
      `),
      // Top 10 klanten op netto-omzet ex BTW (all-time)
      db
        .select({
          id: contacts.id,
          name: contacts.name,
          revenue: sql<string>`coalesce(sum(case when ${documents.kind}='invoice' then ${documents.subtotalEur} when ${documents.kind}='creditnote' then -${documents.subtotalEur} else 0 end),0)::text`,
        })
        .from(documents)
        .leftJoin(contacts, eq(contacts.id, documents.contactId))
        .groupBy(contacts.id, contacts.name)
        .orderBy(desc(sql`sum(case when ${documents.kind}='invoice' then ${documents.subtotalEur} when ${documents.kind}='creditnote' then -${documents.subtotalEur} else 0 end)`))
        .limit(10),
      // Top 10 producten op verkochte omzet (uit factuurregels, ex BTW)
      db.execute(sql`
        select item->>'name' as name,
               sum((item->>'units')::numeric) as units,
               sum((item->>'units')::numeric * (item->>'price')::numeric * (1 - coalesce((item->>'discount')::numeric,0)/100)) as revenue
        from documents d, jsonb_array_elements(case when jsonb_typeof(d.items) = 'array' then d.items else '[]'::jsonb end) as item
        where d.kind='invoice' and item->>'name' is not null
        group by item->>'name'
        order by revenue desc nulls last
        limit 10
      `),
      // Top leveranciers op spend (ex BTW, zonder concept)
      db
        .select({
          supplier: purchaseOrders.supplier,
          spend: sql<string>`coalesce(sum(coalesce(${purchaseOrders.subtotal}, ${purchaseOrders.total})),0)::text`,
          docs: sql<number>`count(*)::int`,
        })
        .from(purchaseOrders)
        .where(sql`${purchaseOrders.currency} = 'EUR' and ${purchaseOrders.status} <> 'draft'`)
        .groupBy(purchaseOrders.supplier)
        .orderBy(desc(sql`sum(coalesce(${purchaseOrders.subtotal}, ${purchaseOrders.total}))`))
        .limit(10),
      // Leadgeneratie per bron
      db
        .select({
          source: contacts.source,
          n: sql<number>`count(*)::int`,
        })
        .from(contacts)
        .groupBy(contacts.source)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      // Aankomende cashflow: open facturen, op vervaldatum
      db
        .select({
          id: documents.id,
          docNumber: documents.docNumber,
          dueDate: documents.dueDate,
          totalEur: documents.totalEur,
          paidEur: documents.paidEur,
        })
        .from(documents)
        .where(sql`${documents.kind} = 'invoice' and ${documents.status} not in ('paid','void','draft')`)
        .orderBy(asc(documents.dueDate)),
      // Voor marge-per-maand: alle factuur-line-items + productkosten
      db
        .select({
          id: documents.id,
          kind: documents.kind,
          issueDate: documents.issueDate,
          subtotalEur: documents.subtotalEur,
          items: documents.items,
        })
        .from(documents)
        .where(sql`${documents.kind} in ('invoice','creditnote') and ${documents.issueDate} >= ${from}`),
    ]);

  // ──────────────── Inkoop per maand (uit Holded-grootboek) ────────────────
  const purchaseChart = months.map((m) => {
    const row = holdedExpenses.find((e) => e.ym === m.key);
    return { month: m.label, value: Math.max(0, row?.total ?? 0) };
  });
  const totalPur = purchaseChart.reduce((s, r) => s + r.value, 0);

  // ──────────────── Omzet per maand (uit CRM) ──────────────────────────────
  const rev = new Map<string, { invoiced: number; credited: number }>(
    (((revenueRows as any).rows ?? revenueRows) as any[]).map((r) => [
      r.ym,
      { invoiced: Number(r.invoiced), credited: Number(r.credited) },
    ]),
  );
  const revenueChart = months.map((m) => ({
    month: m.label,
    value: Math.max(0, (rev.get(m.key)?.invoiced ?? 0) - (rev.get(m.key)?.credited ?? 0)),
  }));
  const totalRev = revenueChart.reduce((s, r) => s + r.value, 0);
  const grossMargin = totalRev > 0 ? Math.round(((totalRev - totalPur) / totalRev) * 100) : null;

  // ──────────────── Marge per maand (omzet − kostprijs van regels) ─────────
  const productCost = new Map<string, number>();
  {
    const ps = await db.select({ id: products.id, cost: products.costEur }).from(products);
    for (const p of ps) productCost.set(p.id, Number(p.cost ?? 0));
  }
  const margeByMonth = new Map<string, { revenue: number; cost: number }>();
  for (const m of months) margeByMonth.set(m.key, { revenue: 0, cost: 0 });
  for (const d of allDocsForMargin) {
    if (!d.issueDate) continue;
    const ym = String(d.issueDate).slice(0, 7);
    const bucket = margeByMonth.get(ym);
    if (!bucket) continue;
    const sign = d.kind === "creditnote" ? -1 : 1;
    bucket.revenue += sign * Number(d.subtotalEur ?? 0);
    for (const it of normalizeDocItems(d.items)) {
      const c = it.productId ? productCost.get(it.productId) ?? 0 : 0;
      bucket.cost += sign * c * (Number(it.units) || 0);
    }
  }
  const margeChart = months.map((m) => {
    const b = margeByMonth.get(m.key)!;
    return { month: m.label, value: Math.round((b.revenue - b.cost) * 100) / 100 };
  });

  // ──────────────── Top customers/products/suppliers/sources ───────────────
  const topCustData = (topCustomers as any[])
    .filter((r) => r.name && Number(r.revenue) > 0)
    .map((r) => ({ name: r.name as string, value: Number(r.revenue) }));
  const topProdData = (((topProductsRows as any).rows ?? topProductsRows) as any[])
    .filter((r) => r.name && Number(r.revenue) > 0)
    .map((r) => ({ name: r.name as string, value: Number(r.revenue) }));
  const supplierData = (supplierRows as any[])
    .filter((r) => r.supplier && Number(r.spend) > 0)
    .map((r) => ({ name: r.supplier as string, value: Number(r.spend) }));
  const leadSourceData = (leadSourceRows as any[])
    .filter((r) => r.source)
    .map((r) => ({ name: r.source as string, value: Number(r.n) }));

  // ──────────────── Aankomende cashflow (per week, eerste 8 wkn) ───────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cashflowBuckets: { label: string; open: number }[] = [];
  for (let i = -1; i < 8; i++) {
    const start = new Date(today); start.setDate(today.getDate() + i * 7);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    let sum = 0;
    for (const inv of openInvoices) {
      if (!inv.dueDate) continue;
      const due = new Date(inv.dueDate);
      const open = Number(inv.totalEur ?? 0) - Number(inv.paidEur ?? 0);
      if (open <= 0) continue;
      if (i === -1 ? due < today : due >= start && due < end) sum += open;
    }
    const label = i === -1 ? "vervallen" : i === 0 ? "deze wk" : `+${i} wk`;
    cashflowBuckets.push({ label, open: Math.round(sum * 100) / 100 });
  }

  return (
    <>
      <PageHeader
        title="Rapporten"
        subtitle="Alle bedragen ex. BTW, laatste 12 maanden. Inkoop komt direct uit Holded's grootboek."
        actions={
          <LinkButton href="/rapporten/data-check" variant="secondary">
            🩺 Data-gezondheid
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Omzet (12 mnd)" value={formatEUR(totalRev)} hint="ex. BTW · facturen − creditnota's" />
        <StatTile label="Inkoop (12 mnd)" value={formatEUR(totalPur)} hint="ex. BTW · Holded aankoopfacturen" />
        <StatTile label="Bruto-resultaat" value={formatEUR(totalRev - totalPur)} hint={grossMargin != null ? `${grossMargin}% van de omzet` : undefined} />
        <StatTile label="Open facturen" value={openInvoices.length} hint={formatEUR(cashflowBuckets.reduce((s, b) => s + b.open, 0))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Omzet per maand</CardTitle>
            <span className="text-xs text-muted">ex. BTW · facturen − creditnota's</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={revenueChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inkoop per maand</CardTitle>
            <span className="text-xs text-muted">ex. BTW · uit Holded aankoopfacturen</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={purchaseChart} color="#3a2a20" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Marge per maand</CardTitle>
            <span className="text-xs text-muted">omzet − kostprijs van verkochte regels</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={margeChart} color="#1f6f5c" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top klanten — netto-omzet</CardTitle>
            <span className="text-xs text-muted">ex. BTW · all-time</span>
          </CardHeader>
          <CardContent>
            {topCustData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen klanten met omzet.</p>
            ) : (
              <HorizontalBarChart data={topCustData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top producten — omzet</CardTitle>
            <span className="text-xs text-muted">som van factuurregels, ex BTW</span>
          </CardHeader>
          <CardContent>
            {topProdData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen verkochte producten.</p>
            ) : (
              <HorizontalBarChart data={topProdData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top leveranciers — spend</CardTitle>
            <span className="text-xs text-muted">ex. BTW · zonder concepten</span>
          </CardHeader>
          <CardContent>
            {supplierData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen inkoop.</p>
            ) : (
              <HorizontalBarChart data={supplierData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads per bron</CardTitle>
            <span className="text-xs text-muted">contacten naar herkomst</span>
          </CardHeader>
          <CardContent>
            {leadSourceData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen leads met bron ingevuld.</p>
            ) : (
              <HorizontalBarChart data={leadSourceData} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Aankomende cashflow — open facturen op vervaldatum</CardTitle>
          <span className="text-xs text-muted">incl. BTW · wat de klant nog moet betalen</span>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <Th>Periode</Th>
              <Th className="text-right">Verwachte ontvangst</Th>
            </tr>
          </THead>
          <TBody>
            {cashflowBuckets.map((b) => (
              <Tr key={b.label}>
                <Td className={b.label === "vervallen" ? "font-medium text-danger" : ""}>
                  {b.label === "vervallen" ? "⚠️ Vervallen" : b.label === "deze wk" ? "Deze week" : `Over ${b.label.replace("+", "").replace(" wk", " weken")}`}
                </Td>
                <Td className="text-right tabular-nums">{formatEUR(b.open)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
