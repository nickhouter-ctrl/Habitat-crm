import { desc, eq, sql } from "drizzle-orm";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { HorizontalBarChart, MonthlyAmountChart } from "@/components/rapporten-charts";
import { db } from "@/lib/db";
import { contacts, documents, purchaseOrders } from "@/lib/db/schema";
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

  const [revenueRows, purchaseRows, topCustomers] = await Promise.all([
    // Omzet per maand: facturen − creditnota's (gefactureerd), uit Holded gesynct of CRM
    db.execute(sql`
      select to_char(issue_date,'YYYY-MM') as ym,
             coalesce(sum(case when kind='invoice' then total_eur else 0 end),0)::text as invoiced,
             coalesce(sum(case when kind='creditnote' then total_eur else 0 end),0)::text as credited,
             coalesce(sum(case when kind in ('invoice','creditnote') then paid_eur else 0 end),0)::text as paid_signed
      from documents
      where issue_date is not null and issue_date >= ${from}
      group by ym
      order by ym
    `),
    // Inkoop per maand: alle EUR-aankopen (Holded converteert USD al)
    db.execute(sql`
      select to_char(order_date,'YYYY-MM') as ym, coalesce(sum(total),0)::text as total
      from purchase_orders
      where currency = 'EUR' and order_date is not null and order_date >= ${from}
      group by ym
      order by ym
    `),
    // Top 10 klanten op netto-omzet (facturen − creditnota's), all-time
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        revenue: sql<string>`coalesce(sum(case when ${documents.kind}='invoice' then ${documents.totalEur} when ${documents.kind}='creditnote' then -${documents.totalEur} else 0 end),0)::text`,
      })
      .from(documents)
      .leftJoin(contacts, eq(contacts.id, documents.contactId))
      .groupBy(contacts.id, contacts.name)
      .orderBy(desc(sql`sum(case when ${documents.kind}='invoice' then ${documents.totalEur} when ${documents.kind}='creditnote' then -${documents.totalEur} else 0 end)`))
      .limit(10),
  ]);

  const rev = new Map<string, { invoiced: number; credited: number; paid: number }>(
    (((revenueRows as any).rows ?? revenueRows) as any[]).map((r) => [
      r.ym,
      { invoiced: Number(r.invoiced), credited: Number(r.credited), paid: Number(r.paid_signed) },
    ]),
  );
  const pur = new Map<string, number>(
    (((purchaseRows as any).rows ?? purchaseRows) as any[]).map((r) => [r.ym, Number(r.total)]),
  );

  const revenueChart = months.map((m) => ({
    month: m.label,
    value: Math.max(0, (rev.get(m.key)?.invoiced ?? 0) - (rev.get(m.key)?.credited ?? 0)),
  }));
  const purchaseChart = months.map((m) => ({ month: m.label, value: pur.get(m.key) ?? 0 }));

  const totalRev = revenueChart.reduce((s, r) => s + r.value, 0);
  const totalPur = purchaseChart.reduce((s, r) => s + r.value, 0);
  const grossMargin = totalRev > 0 ? Math.round(((totalRev - totalPur) / totalRev) * 100) : null;

  const topCustData = (topCustomers as any[])
    .filter((r) => r.name && Number(r.revenue) > 0)
    .slice(0, 10)
    .map((r) => ({ name: r.name as string, value: Number(r.revenue) }));

  return (
    <>
      <PageHeader title="Rapporten" subtitle="Omzet, inkoop en de belangrijkste klanten — laatste 12 maanden." />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Omzet (12 mnd)" value={formatEUR(totalRev)} hint="facturen − creditnota's" />
        <StatTile label="Inkoop (12 mnd)" value={formatEUR(totalPur)} hint="aankopen in EUR" />
        <StatTile label="Bruto-resultaat" value={formatEUR(totalRev - totalPur)} hint={grossMargin != null ? `${grossMargin}% van de omzet` : undefined} />
        <StatTile label="Top-klanten" value={topCustData.length} hint="met omzet" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Omzet per maand</CardTitle>
            <span className="text-xs text-muted">facturen − creditnota's, gefactureerd</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={revenueChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inkoop per maand</CardTitle>
            <span className="text-xs text-muted">alle leveranciers-aankopen (EUR)</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={purchaseChart} color="#3a2a20" />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Top klanten — netto-omzet</CardTitle>
          <span className="text-xs text-muted">facturen − creditnota's, all-time</span>
        </CardHeader>
        <CardContent>
          {topCustData.length === 0 ? (
            <p className="text-sm text-muted">Nog geen klanten met omzet — eerste factuur maken in /invoices.</p>
          ) : (
            <HorizontalBarChart data={topCustData} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
