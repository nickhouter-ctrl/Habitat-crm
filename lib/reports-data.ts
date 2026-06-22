/* Gedeelde berekening voor de Rapporten-pagina én de Rapporten-PDF, zodat beide
 * exact dezelfde cijfers tonen (één bron van waarheid). Alle bedragen ex. BTW,
 * laatste 12 maanden tenzij anders vermeld. */
import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, documents, products, purchaseOrders } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { purchaseDocsByMonth } from "@/lib/holded/accounting";
import { prettySupplierName } from "@/lib/supplier-name";

const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function lastTwelveMonths(): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: MONTH_LABELS[d.getMonth()] + (d.getMonth() === 0 || i === 11 ? ` ${String(d.getFullYear()).slice(-2)}` : ""),
    });
  }
  return out;
}

export type NamedValue = { name: string; value: number };

export async function getReportsData() {
  const months = lastTwelveMonths();
  const from = months[0].key + "-01";

  const [holdedExpenses, revenueRows, topCustomers, topProductsRows, supplierRows, leadSourceRows, openInvoices, allDocsForMargin] =
    await Promise.all([
      purchaseDocsByMonth(12),
      db.execute(sql`
        select to_char(issue_date,'YYYY-MM') as ym,
               coalesce(sum(case when kind='invoice' then subtotal_eur else 0 end),0)::text as invoiced,
               coalesce(sum(case when kind='creditnote' then subtotal_eur else 0 end),0)::text as credited
        from documents
        where issue_date is not null and issue_date >= ${from}
        group by ym order by ym
      `),
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
      db
        .select({ source: contacts.source, n: sql<number>`count(*)::int` })
        .from(contacts)
        .groupBy(contacts.source)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
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
      db
        .select({
          id: documents.id,
          kind: documents.kind,
          issueDate: documents.issueDate,
          subtotalEur: documents.subtotalEur,
          items: documents.items,
          contactId: documents.contactId,
          contactName: contacts.name,
        })
        .from(documents)
        .leftJoin(contacts, eq(contacts.id, documents.contactId))
        .where(sql`${documents.kind} in ('invoice','creditnote') and ${documents.issueDate} >= ${from}`),
    ]);

  // Inkoop per maand (Holded-grootboek)
  const purchaseChart = months.map((m) => {
    const row = holdedExpenses.find((e) => e.ym === m.key);
    return { month: m.label, value: Math.max(0, row?.total ?? 0) };
  });
  const totalPur = purchaseChart.reduce((s, r) => s + r.value, 0);

  // Omzet per maand (CRM)
  const rev = new Map<string, { invoiced: number; credited: number }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Marge & winst
  type Prod = { name: string; cost: number; collection: string | null };
  const prodInfo = new Map<string, Prod>();
  {
    const ps = await db
      .select({ id: products.id, name: products.name, cost: products.costEur, collection: products.collection })
      .from(products);
    for (const p of ps) prodInfo.set(p.id, { name: p.name, cost: Number(p.cost ?? 0), collection: p.collection });
  }
  const lineRevenue = (it: { units?: unknown; price?: unknown; discount?: unknown }) =>
    (Number(it.units) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discount) || 0) / 100);

  type Agg = { revenue: number; cost: number };
  const margeByMonth = new Map<string, Agg>();
  for (const m of months) margeByMonth.set(m.key, { revenue: 0, cost: 0 });
  const byProduct = new Map<string, Agg & { name: string; units: number; hasCost: boolean }>();
  const byCollection = new Map<string, Agg>();
  const byCustomer = new Map<string, Agg & { name: string }>();

  for (const d of allDocsForMargin) {
    const sign = d.kind === "creditnote" ? -1 : 1;
    const ym = d.issueDate ? String(d.issueDate).slice(0, 7) : null;
    const monthBucket = ym ? margeByMonth.get(ym) : null;
    if (monthBucket) monthBucket.revenue += sign * Number(d.subtotalEur ?? 0);

    const custKey = d.contactId ?? "—";
    const cust = byCustomer.get(custKey) ?? { revenue: 0, cost: 0, name: d.contactName ?? "Onbekend" };

    for (const it of normalizeDocItems(d.items)) {
      const info = it.productId ? prodInfo.get(it.productId) : undefined;
      const units = Number(it.units) || 0;
      const r = sign * lineRevenue(it);
      const cost = sign * (info?.cost ?? 0) * units;
      if (monthBucket) monthBucket.cost += cost;
      if (it.productId && info) {
        const p = byProduct.get(it.productId) ?? { revenue: 0, cost: 0, units: 0, name: info.name, hasCost: info.cost > 0 };
        p.revenue += r;
        p.cost += cost;
        p.units += sign * units;
        byProduct.set(it.productId, p);
        const colKey = info.collection ?? "Overig";
        const col = byCollection.get(colKey) ?? { revenue: 0, cost: 0 };
        col.revenue += r;
        col.cost += cost;
        byCollection.set(colKey, col);
      }
      cust.revenue += r;
      cust.cost += cost;
    }
    byCustomer.set(custKey, cust);
  }

  const margeChart = months.map((m) => {
    const b = margeByMonth.get(m.key)!;
    return { month: m.label, value: Math.round((b.revenue - b.cost) * 100) / 100 };
  });

  const cogs12 = months.reduce((s, m) => s + margeByMonth.get(m.key)!.cost, 0);
  const grossProfit12 = totalRev - cogs12;
  const marginPct12 = totalRev > 0 ? Math.round((grossProfit12 / totalRev) * 100) : null;

  const pct = (r: number, profit: number) => (r > 0 ? Math.round((profit / r) * 100) : null);

  const productMargin = [...byProduct.values()]
    .map((p) => ({ name: p.name, revenue: p.revenue, profit: p.revenue - p.cost, units: p.units, hasCost: p.hasCost }))
    .filter((p) => p.revenue > 0 || p.profit !== 0);
  const topProfitProducts = [...productMargin].sort((a, b) => b.profit - a.profit).slice(0, 12);
  const lowMarginProducts = productMargin
    .filter((p) => p.hasCost && p.revenue > 0)
    .map((p) => ({ ...p, mp: pct(p.revenue, p.profit)! }))
    .sort((a, b) => a.mp - b.mp)
    .slice(0, 8);

  const collectionMargin = [...byCollection.entries()]
    .map(([name, a]) => ({ name, revenue: a.revenue, profit: a.revenue - a.cost, mp: pct(a.revenue, a.revenue - a.cost) }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.profit - a.profit);
  const collectionProfitData: NamedValue[] = collectionMargin.map((c) => ({ name: c.name, value: Math.round(c.profit) }));

  const customerProfitData: NamedValue[] = [...byCustomer.values()]
    .map((c) => ({ name: c.name, value: Math.round(c.revenue - c.cost) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topCustData: NamedValue[] = (topCustomers as any[])
    .filter((r) => r.name && Number(r.revenue) > 0)
    .map((r) => ({ name: r.name as string, value: Number(r.revenue) }));
  const topProdData: NamedValue[] = (((topProductsRows as any).rows ?? topProductsRows) as any[])
    .filter((r) => r.name && Number(r.revenue) > 0)
    .map((r) => ({ name: r.name as string, value: Number(r.revenue) }));
  const supplierData: NamedValue[] = (supplierRows as any[])
    .filter((r) => r.supplier && Number(r.spend) > 0)
    .map((r) => ({ name: prettySupplierName(r.supplier as string), value: Number(r.spend) }));
  const leadSourceData: NamedValue[] = (leadSourceRows as any[])
    .filter((r) => r.source)
    .map((r) => ({ name: r.source as string, value: Number(r.n) }));

  // Aankomende cashflow (per week, eerste 8 wkn)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cashflowBuckets: { label: string; open: number }[] = [];
  for (let i = -1; i < 8; i++) {
    const start = new Date(today);
    start.setDate(today.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
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
  const openInvoicesTotal = cashflowBuckets.reduce((s, b) => s + b.open, 0);

  return {
    months,
    totalRev,
    totalPur,
    grossMargin,
    cogs12,
    grossProfit12,
    marginPct12,
    revenueChart,
    purchaseChart,
    margeChart,
    topProfitProducts,
    lowMarginProducts,
    collectionMargin,
    collectionProfitData,
    customerProfitData,
    topCustData,
    topProdData,
    supplierData,
    leadSourceData,
    openInvoicesCount: openInvoices.length,
    openInvoicesTotal,
    cashflowBuckets,
    pct,
  };
}

export type ReportsData = Awaited<ReturnType<typeof getReportsData>>;
