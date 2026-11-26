import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { pdfDateStamp } from "@/lib/pdf-shared";
import { splitLooseCost, splitPurchaseCost } from "@/lib/project-cost-streams";
import { loadProjectFunding } from "@/lib/project-funding";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

/**
 * Intern kostenoverzicht: wat het project ons tot nu toe ÉCHT heeft gekost,
 * uitgesplitst per arbeider/ploeg, per leverancier en per productgroep, met een
 * totaal mét en zónder kozijnen en eigen producten. Zelfde bronnen en
 * indeling als het voorschotoverzicht (projectCostStreams); uren tegen het
 * werkelijk betaalde tarief. Nooit naar de klant.
 */
const r2 = (n: number) => Math.round(n * 100) / 100 || 0;
/** Zelfde naam in andere schrijfwijze samenvoegen ("ahmed Bouzekri", "BRICOMAN, S.L.U."). */
const nameKey = (who: string) => who.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(s\.?l\.?u?\.?|s\.?a\.?)\b/g, " ").replace(/[^a-z0-9à-ü]+/g, " ").trim() || who;
const nicerName = (a: string | undefined, b: string) => (a && /^[A-Z]/.test(a) ? a : b.replace(/^\p{Ll}/u, (c) => c.toUpperCase()));
const GROUP_LABEL: Record<string, string> = {
  windows: "Kozijnen / ramen", railings: "Balustrades", doors: "Deuren", bathroom: "Badkamer",
  lighting: "Verlichting", stone: "Magic Stone", climate: "Warmtepomp / klimaat", plants: "Beplanting",
};

type LaborRow = { name: string; cash: boolean; hours: string; cost: string };
type PoRow = { supplier: string | null; currency: string | null; notes: string | null; items: unknown; subtotal: string | null; tax: string | null; total: string | null };
type CostRow = { supplier: string | null; description: string; category: string; note: string | null; amountEur: string;
  source: (PoRow & { countAsLabor: boolean }) | null };

export async function loadProjectCostBreakdown(projectId: string) {
  const [laborRows, poRows, costRows, funding] = await Promise.all([
    // Zelfde urenselectie als het voorschot: portaaluren pas na goedkeuring.
    db.execute<LaborRow>(sql`select regexp_replace(coalesce(w.name, t.worker_name, 'Onbekend'), '\\s*\\n\\s*', ', ', 'g') as name,
        (t.payment_method = 'cash') as cash, sum(t.hours)::text as hours,
        sum(t.hours * coalesce(t.actual_hourly_cost_eur, t.hourly_cost_eur))::text as cost
      from time_entries t left join workers w on w.id = t.worker_id
      where t.project_id = ${projectId} and not (t.self_logged_at is not null and t.approved_at is null)
      group by 1, 2`),
    db.execute<PoRow>(sql`select supplier, currency, notes, items, subtotal, tax, total from purchase_orders
      where project_id = ${projectId} and not count_as_labor`),
    db.execute<CostRow>(sql`select c.supplier, c.description, c.category, c.note, c.amount_eur as "amountEur",
        case when po.id is null then null else jsonb_build_object('supplier', po.supplier, 'notes', po.notes, 'items', po.items,
          'subtotal', po.subtotal, 'tax', po.tax, 'total', po.total, 'currency', po.currency, 'countAsLabor', po.count_as_labor) end as source
      from project_costs c left join purchase_orders po on po.id = c.purchase_order_id where c.project_id = ${projectId}`),
    loadProjectFunding(projectId, true),
  ]);
  const current = funding.get(projectId);
  if (!current) return null;

  const byWorker = new Map<string, { base: string; cash: boolean; hours: number; cost: number }>();
  for (const l of laborRows) {
    const k = `${nameKey(l.name)}|${l.cash}`, cur = byWorker.get(k);
    byWorker.set(k, { base: nicerName(cur?.base, l.name), cash: l.cash, hours: (cur?.hours ?? 0) + Number(l.hours), cost: r2((cur?.cost ?? 0) + Number(l.cost)) });
  }
  const labor = [...byWorker.values()].map((w) => ({ name: `${w.base}${w.cash ? " (contant)" : ""}`, hours: w.hours, cost: w.cost }))
    .filter((l) => l.cost !== 0 || l.hours !== 0).sort((a, b) => b.cost - a.cost);

  const bySupplier = new Map<string, { name: string; cost: number }>();
  const add = (who: string, v: number) => {
    if (!v) return;
    const key = nameKey(who), cur = bySupplier.get(key);
    bySupplier.set(key, { name: nicerName(cur?.name, who), cost: r2((cur?.cost ?? 0) + v) });
  };
  for (const po of poRows) {
    const s = splitPurchaseCost(po as Parameters<typeof splitPurchaseCost>[0]);
    add(po.supplier?.trim() || "Onbekende leverancier", s.material + s.other);
  }
  for (const c of costRows) {
    const s = splitLooseCost({ ...c, source: c.source as Parameters<typeof splitLooseCost>[0]["source"] });
    add(c.supplier?.trim() || (c.category === "material" ? "Losse materiaalbonnen (geen leverancier)" : "Losse kosten (geen leverancier)"), s.material + s.other);
  }
  const suppliers = [...bySupplier.values()].sort((a, b) => b.cost - a.cost);

  const products = current.own.breakdown.filter((b) => Math.abs(b.booked) >= 0.01)
    .map((b) => ({ name: GROUP_LABEL[b.group] ?? b.label ?? "Overig product", group: b.group, cost: r2(b.booked) }));
  const extraCost = r2(current.own.bookedCost - products.reduce((s, p) => s + p.cost, 0));
  if (Math.abs(extraCost) >= 0.01) products.push({ name: "Meerwerk (kostprijs)", group: "extras", cost: extraCost });

  const laborTotal = r2(labor.reduce((s, l) => s + l.cost, 0));
  const materialTotal = r2(suppliers.reduce((s, x) => s + x.cost, 0));
  const productTotal = r2(products.reduce((s, p) => s + p.cost, 0));
  // Controle tegen de projectstand (zelfde bron); afwijking als aparte regel.
  const expected = r2(current.margins.purchaseCost + current.margins.otherCost);
  const reconcile = r2(expected - materialTotal);
  return {
    labor, laborTotal, laborHours: labor.reduce((s, l) => s + l.hours, 0),
    suppliers, materialTotal: r2(materialTotal + reconcile), reconcile,
    products, productTotal,
    exclProducts: r2(laborTotal + materialTotal + reconcile),
    inclProducts: r2(laborTotal + materialTotal + reconcile + productTotal),
  };
}

export async function renderProjectCostBreakdownPdf(projectId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { name: true } });
  if (!project) return null;
  const b = await loadProjectCostBreakdown(projectId);
  if (!b) return null;
  const E = formatEUR, H = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
  const tables: ReportTable[] = [
    {
      title: "1. Arbeid per arbeider of ploeg",
      subtitle: "Tegen wat de arbeider echt kreeg (werkelijk betaald tarief), niet het doorberekende tarief.",
      columns: [{ header: "Arbeider / ploeg", flex: 4 }, { header: "Uren", flex: 1, align: "right" }, { header: "Kosten", flex: 1.5, align: "right" }],
      rows: [...b.labor.map((l) => [l.name, H(l.hours), E(l.cost)]), ["Totaal arbeid", H(b.laborHours), E(b.laborTotal)]],
      emphasizeRow: (r) => r === b.labor.length,
    },
    {
      title: "2. Materialen en diensten per leverancier",
      subtitle: "Bouwmaterialen, inkoop derden, architect, onderaannemers, huur en vervoer. Zonder kozijnen en eigen producten.",
      columns: [{ header: "Leverancier", flex: 4 }, { header: "Kosten", flex: 1.5, align: "right" }],
      rows: [...b.suppliers.map((s) => [s.name, E(s.cost)]),
        ...(Math.abs(b.reconcile) >= 0.01 ? [["Afronding / toerekening", E(b.reconcile)]] : []),
        ["Totaal materialen en diensten", E(b.materialTotal)]],
      emphasizeRow: (r) => r === b.suppliers.length + (Math.abs(b.reconcile) >= 0.01 ? 1 : 0),
    },
    {
      title: "3. Kozijnen en eigen producten",
      columns: [{ header: "Productgroep", flex: 4 }, { header: "Kosten", flex: 1.5, align: "right" }],
      rows: [...b.products.map((p) => [p.name, E(p.cost)]), ["Totaal kozijnen en eigen producten", E(b.productTotal)]],
      emphasizeRow: (r) => r === b.products.length,
      emptyText: "Geen eigen producten geboekt.",
    },
    {
      title: "4. Totaal",
      columns: [{ header: "Omschrijving", flex: 4 }, { header: "Kosten", flex: 1.5, align: "right" }],
      rows: [["Arbeid", E(b.laborTotal)], ["Materialen en diensten", E(b.materialTotal)],
        ["Totaal zonder kozijnen en eigen producten", E(b.exclProducts)], ["Kozijnen en eigen producten", E(b.productTotal)],
        ["Totaal met kozijnen en eigen producten", E(b.inclProducts)]],
      emphasizeRow: (r) => r === 2 || r === 4,
    },
  ];
  const buffer = await renderReportPdf({
    title: `${project.name}: kostenoverzicht intern`,
    subtitle: "Wat het project ons tot nu toe echt heeft gekost · alleen intern · bedragen ex. btw",
    generatedAt: new Date(), typography: "readable",
    kpis: [
      { label: "Zonder kozijnen en eigen producten", value: E(b.exclProducts) },
      { label: "Met kozijnen en eigen producten", value: E(b.inclProducts) },
      { label: "Uren", value: H(b.laborHours) },
    ],
    tables,
  });
  return { buffer, filename: `kostenoverzicht-intern-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pdfDateStamp()}.pdf` };
}
