import { sql } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

// db.execute geeft per driver soms { rows } en soms direct een array terug.
function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (((res as any)?.rows ?? res) as T[]) ?? [];
}
const num = (v: unknown) => Number(v ?? 0);
const pct = (sale: number, margin: number) => (sale > 0 ? Math.round((margin / sale) * 100) : null);

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const [overallRes, byCollectionRes, topValueRes, lowStockRes] = await Promise.all([
    // Identieke definitie als de Producten-pagina: totaal = alle producten,
    // voorraadwaarde over álle producten (order-only uitgesloten, géén is_active-
    // filter). 'zonder foto' gebruikt wél is_active (net als de pagina).
    db.execute(sql`
      select
        count(*) as total_n,
        coalesce(sum(case when availability <> 'order_only' then coalesce(cost_eur,0)*coalesce(stock_qty,0) else 0 end),0) as cost_val,
        coalesce(sum(case when availability <> 'order_only' then coalesce(price_eur,0)*coalesce(stock_qty,0) else 0 end),0) as sale_val,
        count(*) filter (where is_active and image_url is null) as no_photo,
        count(*) filter (where is_active and availability <> 'order_only' and stock_min is not null and coalesce(stock_qty,0) < stock_min) as low_stock,
        count(*) filter (where is_active and coalesce(stock_qty,0) <= 0 and components is null and availability <> 'order_only') as to_order,
        count(distinct collection) filter (where collection is not null) as collections
      from products
    `),
    db.execute(sql`
      select coalesce(collection,'Overig') as collection,
             count(*) as n,
             coalesce(sum(case when availability <> 'order_only' then coalesce(cost_eur,0)*coalesce(stock_qty,0) else 0 end),0) as cost_val,
             coalesce(sum(case when availability <> 'order_only' then coalesce(price_eur,0)*coalesce(stock_qty,0) else 0 end),0) as sale_val
      from products
      group by collection
      order by cost_val desc
    `),
    db.execute(sql`
      select name, sku, coalesce(stock_qty,0) as qty,
             coalesce(cost_eur,0)*coalesce(stock_qty,0) as cost_val
      from products
      where availability <> 'order_only' and coalesce(stock_qty,0) > 0
      order by cost_val desc
      limit 15
    `),
    db.execute(sql`
      select name, coalesce(stock_qty,0) as qty, stock_min
      from products
      where is_active = true and availability <> 'order_only'
        and stock_min is not null and coalesce(stock_qty,0) < stock_min
      order by (coalesce(stock_qty,0) - stock_min) asc
      limit 20
    `),
  ]);

  const o = rowsOf(overallRes)[0] ?? {};
  const costVal = num(o.cost_val);
  const saleVal = num(o.sale_val);
  const margin = saleVal - costVal;
  const marginPct = pct(saleVal, margin);

  const kpis = [
    { label: "Producten (totaal)", value: String(num(o.total_n)), hint: "in de catalogus" },
    { label: "Voorraadwaarde (kostprijs)", value: formatEUR(costVal), hint: "kostprijs × voorraad" },
    { label: "Voorraadwaarde (verkoop)", value: formatEUR(saleVal), hint: "verkoopprijs × voorraad" },
    {
      label: "Totale marge (voorraad)",
      value: formatEUR(margin),
      hint: marginPct != null ? `${marginPct}% · verkoop − kostprijs` : undefined,
    },
    { label: "Lage voorraad", value: String(num(o.low_stock)), hint: "onder de drempel" },
    { label: "Te bestellen", value: String(num(o.to_order)), hint: "niet op voorraad" },
    { label: "Zonder foto", value: String(num(o.no_photo)), hint: "actief · ontbreekt op de site" },
    { label: "Collecties", value: String(num(o.collections)), hint: "in de catalogus" },
  ];

  const byCol = rowsOf(byCollectionRes);
  const topValue = rowsOf(topValueRes);
  const lowStock = rowsOf(lowStockRes);

  const tables: ReportTable[] = [
    {
      title: "Voorraadwaarde per collectie",
      subtitle: "alle producten · order-only uitgesloten",
      columns: [
        { header: "Collectie", flex: 2.4 },
        { header: "#", align: "right", flex: 0.7 },
        { header: "Kostprijs", align: "right", flex: 1.3 },
        { header: "Verkoop", align: "right", flex: 1.3 },
        { header: "Marge", align: "right", flex: 0.9 },
      ],
      rows: byCol.map((c) => {
        const cv = num(c.cost_val);
        const sv = num(c.sale_val);
        const mp = pct(sv, sv - cv);
        return [
          String(c.collection ?? "Overig"),
          String(num(c.n)),
          formatEUR(cv),
          formatEUR(sv),
          mp != null ? `${mp}%` : "—",
        ];
      }),
      emptyText: "Nog geen producten.",
    },
    {
      title: "Hoogste voorraadwaarde",
      subtitle: "top 15 op kostprijs × voorraad",
      columns: [
        { header: "Product", flex: 2.8 },
        { header: "SKU", flex: 1.2 },
        { header: "Voorraad", align: "right", flex: 0.9 },
        { header: "Waarde (kostprijs)", align: "right", flex: 1.4 },
      ],
      rows: topValue.map((p) => [
        String(p.name ?? ""),
        String(p.sku ?? "—"),
        String(num(p.qty)),
        formatEUR(num(p.cost_val)),
      ]),
      emptyText: "Nog geen voorraad.",
    },
    {
      title: "Lage voorraad — bijbestellen",
      subtitle: "onder de ingestelde drempel · order-only uitgesloten",
      columns: [
        { header: "Product", flex: 3 },
        { header: "Voorraad", align: "right", flex: 1 },
        { header: "Drempel", align: "right", flex: 1 },
        { header: "Tekort", align: "right", flex: 1 },
      ],
      rows: lowStock.map((p) => {
        const qty = num(p.qty);
        const min = num(p.stock_min);
        return [String(p.name ?? ""), String(qty), String(min), String(Math.max(0, min - qty))];
      }),
      emphasizeRow: (i) => num(lowStock[i]?.qty) <= 0,
      emptyText: "Geen producten onder de voorraaddrempel.",
    },
  ];

  const buf = await renderReportPdf({
    title: "Productoverzicht",
    subtitle: "Voorraad, waarde en marge · momentopname",
    generatedAt: new Date(),
    kpis,
    tables,
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Habitat-One-producten-${today}.pdf"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
