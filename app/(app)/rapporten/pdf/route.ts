import { auth } from "@/auth";
import { getReportsData } from "@/lib/reports-data";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const d = await getReportsData();

  const vervallen = d.cashflowBuckets.find((b) => b.label === "vervallen")?.open ?? 0;

  const kpis = [
    { label: "Omzet (12 mnd)", value: formatEUR(d.totalRev), hint: "ex. BTW · facturen − credit" },
    { label: "Inkoop (12 mnd)", value: formatEUR(d.totalPur), hint: "ex. BTW · Holded" },
    {
      label: "Bruto-resultaat",
      value: formatEUR(d.totalRev - d.totalPur),
      hint: d.grossMargin != null ? `${d.grossMargin}% van omzet` : undefined,
    },
    { label: "Open facturen", value: String(d.openInvoicesCount), hint: formatEUR(d.openInvoicesTotal) },
    { label: "Kostprijs verkocht", value: formatEUR(d.cogs12), hint: "COGS · 12 mnd" },
    {
      label: "Brutowinst",
      value: formatEUR(d.grossProfit12),
      hint: d.marginPct12 != null ? `${d.marginPct12}% marge` : undefined,
    },
    { label: "Gem. marge", value: d.marginPct12 != null ? `${d.marginPct12}%` : "—", hint: "winst / omzet" },
    { label: "Vervallen facturen", value: formatEUR(vervallen), hint: "te laat · incl. BTW" },
  ];

  const cashflowLabel = (label: string) =>
    label === "vervallen"
      ? "Vervallen"
      : label === "deze wk"
        ? "Deze week"
        : `Over ${label.replace("+", "").replace(" wk", " weken")}`;

  const tables: ReportTable[] = [
    {
      title: "Top klanten — netto-omzet",
      subtitle: "ex. BTW · all-time",
      columns: [
        { header: "Klant", flex: 3 },
        { header: "Omzet", align: "right", flex: 1.4 },
      ],
      rows: d.topCustData.map((r) => [r.name, formatEUR(r.value)]),
      emptyText: "Nog geen klanten met omzet.",
    },
    {
      title: "Top producten — omzet",
      subtitle: "som van factuurregels · ex. BTW",
      columns: [
        { header: "Product", flex: 3 },
        { header: "Omzet", align: "right", flex: 1.4 },
      ],
      rows: d.topProdData.map((r) => [r.name, formatEUR(r.value)]),
      emptyText: "Nog geen verkochte producten.",
    },
    {
      title: "Winst per product",
      subtitle: "top 12 op winst € · op productregels · 12 mnd",
      columns: [
        { header: "Product", flex: 3 },
        { header: "Omzet", align: "right", flex: 1.3 },
        { header: "Winst", align: "right", flex: 1.3 },
        { header: "Marge", align: "right", flex: 0.9 },
      ],
      rows: d.topProfitProducts.map((p) => {
        const mp = d.pct(p.revenue, p.profit);
        return [
          p.name,
          formatEUR(p.revenue),
          formatEUR(p.profit),
          !p.hasCost || mp == null ? "n.v.t." : `${mp}%`,
        ];
      }),
      emptyText: "Nog geen verkochte producten met kostprijs.",
    },
    {
      title: "Winst per collectie",
      subtitle: "winst € · op productregels · 12 mnd",
      columns: [
        { header: "Collectie", flex: 3 },
        { header: "Winst", align: "right", flex: 1.3 },
        { header: "Marge", align: "right", flex: 0.9 },
      ],
      rows: d.collectionMargin.map((c) => [c.name, formatEUR(c.profit), c.mp != null ? `${c.mp}%` : "—"]),
      emptyText: "Nog geen data.",
    },
    {
      title: "Laagste marge / verlieslatend",
      subtitle: "producten met kostprijs · oplopende marge",
      columns: [
        { header: "Product", flex: 3 },
        { header: "Winst", align: "right", flex: 1.3 },
        { header: "Marge", align: "right", flex: 0.9 },
      ],
      rows: d.lowMarginProducts.map((p) => [p.name, formatEUR(p.profit), `${p.mp}%`]),
      emphasizeRow: (i) => d.lowMarginProducts[i]?.profit < 0,
      emptyText: "Geen producten met kostprijs verkocht.",
    },
    {
      title: "Top leveranciers — spend",
      subtitle: "ex. BTW · zonder concepten",
      columns: [
        { header: "Leverancier", flex: 3 },
        { header: "Spend", align: "right", flex: 1.4 },
      ],
      rows: d.supplierData.map((r) => [r.name, formatEUR(r.value)]),
      emptyText: "Nog geen inkoop.",
    },
    {
      title: "Aankomende cashflow — open facturen op vervaldatum",
      subtitle: "incl. BTW · wat de klant nog moet betalen",
      columns: [
        { header: "Periode", flex: 3 },
        { header: "Verwachte ontvangst", align: "right", flex: 1.6 },
      ],
      rows: d.cashflowBuckets.map((b) => [cashflowLabel(b.label), formatEUR(b.open)]),
      emphasizeRow: (i) => d.cashflowBuckets[i]?.label === "vervallen",
    },
  ];

  const buf = await renderReportPdf({
    title: "Financieel overzicht",
    subtitle: "Alle bedragen ex. BTW tenzij vermeld · laatste 12 maanden · inkoop uit Holded-grootboek",
    generatedAt: new Date(),
    kpis,
    tables,
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Habitat-One-rapport-${today}.pdf"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
