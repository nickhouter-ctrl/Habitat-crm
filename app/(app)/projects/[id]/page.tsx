import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
} from "@/components/ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import {
  contacts,
  documents,
  products,
  projectBudgetLines,
  projectCosts,
  projectPhases,
  projects,
  properties,
  purchaseOrders,
  timeEntries,
  users,
  workers,
} from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { formatEUR } from "@/lib/utils";
import {
  addBudgetLine,
  addProjectCost,
  addProjectPhase,
  addTimeEntry,
  attachDocumentToProject,
  createEstimateFromBudget,
  deleteBudgetLine,
  deleteProject,
  deleteProjectCost,
  deleteProjectPhase,
  deleteTimeEntry,
  linkPurchaseOrderToProject,
  setProjectStatus,
  unlinkPurchaseOrder,
  updateProject,
} from "../actions";
import {
  applyStockOutFromDocument,
  approveEstimateToInvoice,
  cancelSaleReturnStock,
  reverseStockOutFromDocument,
  toggleReserveEstimate,
} from "../../documents/actions";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  const [contactOpts, ownerOpts, propertyOpts, linkedDocs, unlinkedDocs] = await Promise.all([
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.email)),
    db.select({ id: properties.id, title: properties.title }).from(properties).orderBy(asc(properties.title)),
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        status: documents.status,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
        issueDate: documents.issueDate,
        stockAppliedAt: documents.stockAppliedAt,
        reservedAt: documents.reservedAt,
        deliveredAt: documents.deliveredAt,
      })
      .from(documents)
      .where(eq(documents.projectId, id))
      .orderBy(desc(documents.issueDate), desc(documents.createdAt)),
    // Documenten die nog niet aan een project hangen — om hier te koppelen.
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        docNumber: documents.docNumber,
        title: documents.title,
        totalEur: documents.totalEur,
      })
      .from(documents)
      .where(and(isNull(documents.projectId), inArray(documents.kind, ["invoice", "estimate", "creditnote"])))
      .orderBy(desc(documents.issueDate), desc(documents.createdAt))
      .limit(500),
  ]);

  // Marge per project (intern): omzet − kostprijs van regels. We halen ook de
  // OFFERTE (estimate) op, zodat de prognose de productkostprijs op de offerte
  // meeneemt — ook vóór er gefactureerd is (anders lijkt de marge 100%).
  const marginDocs = await db
    .select({ id: documents.id, kind: documents.kind, status: documents.status, subtotalEur: documents.subtotalEur, items: documents.items })
    .from(documents)
    .where(and(eq(documents.projectId, id), inArray(documents.kind, ["estimate", "invoice", "creditnote"])));
  const allPids = new Set<string>();
  const allSkus = new Set<string>();
  for (const d of marginDocs) {
    for (const it of normalizeDocItems(d.items)) {
      if (it.productId) allPids.add(it.productId);
      if (it.description?.trim()) allSkus.add(it.description.trim());
    }
  }
  const projCostRows =
    allPids.size || allSkus.size
      ? await db.query.products.findMany({
          where: or(
            allPids.size ? inArray(products.id, [...allPids]) : undefined,
            allSkus.size ? inArray(products.sku, [...allSkus]) : undefined,
          ),
          columns: { id: true, sku: true, costEur: true },
        })
      : [];
  const pCostById = new Map(projCostRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const pCostBySku = new Map(
    projCostRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]),
  );
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
  let projRevenue = 0;
  let projCost = 0; // kostprijs eigen producten op facturen (gerealiseerd)
  let offerteProductCost = 0; // kostprijs eigen producten op de offerte(s)
  const marginByDoc = new Map<string, { margin: number; pct: number | null }>();
  for (const d of marginDocs) {
    const rev = Number(d.subtotalEur ?? 0);
    const cost = lineCost(d.items);
    if (d.kind === "estimate") {
      if (d.status !== "void" && d.status !== "rejected") offerteProductCost += cost;
      continue;
    }
    marginByDoc.set(d.id, { margin: rev - cost, pct: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null });
    const sign = d.kind === "creditnote" ? -1 : 1;
    projRevenue += sign * rev;
    projCost += sign * cost;
  }
  // invoiceDocs = alleen facturen/creditnota's (voor de gefactureerd-lijst onderaan).
  const invoiceDocs = marginDocs.filter((d) => d.kind !== "estimate");
  const projMargin = projRevenue - projCost;
  const projMarginPct = projRevenue > 0 ? Math.round((projMargin / projRevenue) * 100) : null;

  // Producten in dit project: gereserveerd (uit gemarkeerd-gereserveerde offertes) vs.
  // verkocht (uit facturen − creditnota's). Geeft inzicht in wat er naar de klus
  // gaat én wat er voor het project is gereserveerd.
  const projDocItems = await db
    .select({
      kind: documents.kind,
      status: documents.status,
      reservedAt: documents.reservedAt,
      items: documents.items,
    })
    .from(documents)
    .where(and(eq(documents.projectId, id), inArray(documents.kind, ["estimate", "invoice", "creditnote"])));
  type Agg = {
    name: string;
    productId: string | null;
    reserved: number;
    sold: number;
    reservedAmt: number;
    soldAmt: number;
  };
  const prodAgg = new Map<string, Agg>();
  for (const d of projDocItems) {
    for (const it of normalizeDocItems(d.items)) {
      const key = it.productId || it.description?.trim() || it.name?.trim();
      if (!key || !it.units) continue;
      const entry =
        prodAgg.get(key) ??
        ({
          name: (it.name || it.description || "—").trim(),
          productId: it.productId ?? null,
          reserved: 0,
          sold: 0,
          reservedAmt: 0,
          soldAmt: 0,
        } satisfies Agg);
      const u = Number(it.units) || 0;
      const amt = (Number(it.price) || 0) * u;
      // Gereserveerd = geaccepteerde offertes én offertes die handmatig op
      // 'gereserveerd' zijn gezet (reservedAt). Wat al verkocht (gefactureerd) is
      // wordt hieronder via 'sold' weer afgetrokken (reservedNet).
      if (d.kind === "estimate" && (d.status === "accepted" || d.reservedAt)) {
        entry.reserved += u;
        entry.reservedAmt += amt;
      } else if (d.kind === "invoice") {
        entry.sold += u;
        entry.soldAmt += amt;
      } else if (d.kind === "creditnote") {
        entry.sold -= u;
        entry.soldAmt -= amt;
      }
      prodAgg.set(key, entry);
    }
  }
  // Foto's ophalen voor de gekoppelde producten.
  const aggPids = [...prodAgg.values()].map((p) => p.productId).filter((x): x is string => !!x);
  const imgRows = aggPids.length
    ? await db
        .select({ id: products.id, imageUrl: products.imageUrl })
        .from(products)
        .where(inArray(products.id, aggPids))
    : [];
  const imgById = new Map(imgRows.map((r) => [r.id, r.imageUrl]));
  // Gereserveerd telt alleen wat nog niet verkocht is (reservering − verkocht).
  const aggList = [...prodAgg.values()].map((p) => ({
    ...p,
    image: p.productId ? (imgById.get(p.productId) ?? null) : null,
    reservedNet: Math.max(0, p.reserved - p.sold),
    reservedNetAmt: p.reserved > 0 ? Math.max(0, p.reserved - p.sold) * (p.reservedAmt / p.reserved) : 0,
  }));
  const reservedProducts = aggList
    .filter((p) => p.reservedNet > 0)
    .sort((a, b) => b.reservedNet - a.reservedNet);
  const soldProducts = aggList.filter((p) => p.sold !== 0).sort((a, b) => b.sold - a.sold);

  // Een offerte die al tot een factuur (zelfde bedrag) heeft geleid telt niet
  // meer als reservering — toon 'm dan als "Gefactureerd" zonder omzet-knop.
  const invoiceTotalsForConv = linkedDocs
    .filter((d) => d.kind === "invoice" && d.status !== "void")
    .map((d) => Number(d.totalEur ?? 0));
  const isEstimateConverted = (total: number) =>
    invoiceTotalsForConv.some((t) => Math.abs(t - total) <= 0.02);

  // ─────────── Job-costing: uren (arbeid), kosten/inkoop, begroting, doel ───────────
  const [timeRows, costRows, budgetRows, linkedPOs, workerRows, unlinkedPOs, estTotals, phaseRows] =
    await Promise.all([
      db.select().from(timeEntries).where(eq(timeEntries.projectId, id)).orderBy(desc(timeEntries.date)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)).orderBy(desc(projectCosts.date)),
      db
        .select()
        .from(projectBudgetLines)
        .where(eq(projectBudgetLines.projectId, id))
        .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt)),
      db.select().from(purchaseOrders).where(eq(purchaseOrders.projectId, id)).orderBy(desc(purchaseOrders.orderDate)),
      db.select().from(workers).where(eq(workers.active, true)).orderBy(asc(workers.name)),
      db
        .select({
          id: purchaseOrders.id,
          supplier: purchaseOrders.supplier,
          reference: purchaseOrders.reference,
          total: purchaseOrders.total,
          subtotal: purchaseOrders.subtotal,
          status: purchaseOrders.status,
        })
        .from(purchaseOrders)
        .where(and(isNull(purchaseOrders.projectId), eq(purchaseOrders.currency, "EUR")))
        .orderBy(desc(purchaseOrders.orderDate))
        .limit(200),
      db
        .select({ subtotalEur: documents.subtotalEur })
        .from(documents)
        .where(and(eq(documents.projectId, id), eq(documents.kind, "estimate"))),
      db.select().from(projectPhases).where(eq(projectPhases.projectId, id)).orderBy(asc(projectPhases.sortOrder)),
    ]);

  const laborHours = timeRows.reduce((s, t) => s + Number(t.hours ?? 0), 0);
  const laborCost = timeRows.reduce((s, t) => s + Number(t.hours ?? 0) * Number(t.hourlyCostEur ?? 0), 0);
  const poCost = linkedPOs.reduce((s, p) => s + Number(p.subtotal ?? p.total ?? 0), 0); // ex. BTW, EUR
  const looseCost = costRows.reduce((s, c) => s + Number(c.amountEur ?? 0), 0);
  const materialCost = poCost + looseCost;

  // Eigen-productkost: gerealiseerd = op facturen; verwacht = het meest complete
  // beeld (offerte als die hoger is dan wat al gefactureerd is). Voorkomt zowel
  // "100% marge" (offerte nog niet gefactureerd) als dubbeltelling.
  const ownProductCostRealized = projCost;
  const ownProductCostExpected = Math.max(projCost, offerteProductCost);
  const realizedCost = laborCost + materialCost + ownProductCostRealized;
  const totalCost = laborCost + materialCost + ownProductCostExpected; // verwachte totale kosten

  // Begroting: targetprijzen (verkoop) + geraamde kosten per onderdeel.
  const budgetTargetBase = budgetRows.reduce((s, b) => s + Number(b.amountEur ?? 0), 0);
  const budgetCostTotal = budgetRows.reduce((s, b) => s + Number(b.estimatedCostEur ?? 0), 0);
  const contingencyPct = project.contingencyPct != null ? Number(project.contingencyPct) : 0;
  const contingencyAmt = contingencyPct > 0 ? Math.round(budgetTargetBase * (contingencyPct / 100) * 100) / 100 : 0;
  const budgetTargetTotal = budgetTargetBase + contingencyAmt;

  // Doel/omzetbaseline: aanneemprijs > begroting-targettotaal > offertetotaal.
  // Is er geen expliciet doel maar wél al gefactureerd, dan is het doel minstens
  // wat er gefactureerd is (anders zou het doel 0 zijn naast 40k omzet).
  const estimateSubtotal = estTotals.reduce((s, e) => s + Number(e.subtotalEur ?? 0), 0);
  const contractPrice = project.contractPriceEur != null ? Number(project.contractPriceEur) : null;
  const explicitTarget =
    contractPrice ?? (budgetTargetTotal > 0 ? budgetTargetTotal : estimateSubtotal > 0 ? estimateSubtotal : null);
  const targetRevenue = explicitTarget != null ? Math.max(explicitTarget, projRevenue) : projRevenue;
  const targetIsImplicit = explicitTarget == null;
  const toInvoice = Math.max(0, targetRevenue - projRevenue);

  // Resultaat: gerealiseerd (gefactureerd − gerealiseerde kosten) en verwacht (doel − verwachte kosten).
  const realizedProfit = projRevenue - realizedCost;
  const expectedProfit = targetRevenue - totalCost;
  const expectedMarginPct = targetRevenue > 0 ? Math.round((expectedProfit / targetRevenue) * 100) : null;
  const costRatio = targetRevenue > 0 ? totalCost / targetRevenue : null;
  const resultTone = expectedProfit < 0 ? "danger" : expectedMarginPct != null && expectedMarginPct < 10 ? "warning" : "success";

  const isConstruction = project.kind === "construction";
  const PAY_LABEL = { cash: "Contant", invoice: "Per factuur" } as const;
  const BUDGET_CAT_LABEL: Record<string, string> = {
    labor: "Arbeid",
    material: "Materiaal",
    subcontractor: "Onderaanneming",
    equipment: "Materieel",
    other: "Overig",
  };
  // Begroting in blokken: één blok per fase (met z'n onderdelen), plus een blok
  // voor onderdelen zonder (gekende) fase. Elk blok heeft z'n eigen toevoeg-form.
  const phaseNames = phaseRows.map((p) => p.name);
  const linesOfPhase = (name: string) => budgetRows.filter((b) => (b.phase ?? "").trim() === name);
  const ungroupedBudget = budgetRows.filter((b) => !phaseNames.includes((b.phase ?? "").trim()));
  type BudgetBlock = {
    key: string;
    title: string;
    description: string | null;
    plannedWeeks: string | null;
    phaseValue: string;
    lines: typeof budgetRows;
  };
  const budgetBlocks: BudgetBlock[] = phaseRows.map((p) => ({
    key: p.id,
    title: p.name,
    description: p.description,
    plannedWeeks: p.plannedWeeks,
    phaseValue: p.name,
    lines: linesOfPhase(p.name),
  }));
  if (ungroupedBudget.length > 0 || phaseRows.length === 0) {
    budgetBlocks.push({
      key: "_geen",
      title: "Zonder fase",
      description: phaseRows.length === 0 ? "voeg onderdelen toe, of maak eerst fases aan" : null,
      plannedWeeks: null,
      phaseValue: "",
      lines: ungroupedBudget,
    });
  }
  const begrootMarge = budgetTargetBase - budgetCostTotal;
  const begrootMargePct = budgetTargetBase > 0 ? Math.round((begrootMarge / budgetTargetBase) * 100) : null;
  const workerOptions = workerRows.map((w) => ({
    value: w.id,
    label: w.name + (w.role ? ` · ${w.role}` : ""),
    rate: Number(w.hourlyCostEur ?? 0),
  }));

  const contactOptions: ComboOption[] = contactOpts.map((c) => ({ value: c.id, label: c.name }));
  const ownerOptions: ComboOption[] = ownerOpts.map((u) => ({ value: u.id, label: u.name ?? u.email }));
  const propertyOptions: ComboOption[] = propertyOpts.map((p) => ({ value: p.id, label: p.title }));

  const action = updateProject.bind(null, id);
  const remove = deleteProject.bind(null, id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ background: project.color ?? "#9ca3af" }}
            />
            {project.name}
            {project.holdedProjectId ? (
              <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Holded
              </span>
            ) : null}
            <Badge
              tone={
                project.status === "active" ? "success" : project.status === "completed" ? "info" : "neutral"
              }
            >
              {project.status === "active" ? "Actief" : project.status === "completed" ? "Afgerond" : "Gearchiveerd"}
            </Badge>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {project.status === "completed" ? (
              <form action={setProjectStatus.bind(null, id, "active")}>
                <SubmitButton variant="secondary" pendingLabel="…">
                  Heropenen
                </SubmitButton>
              </form>
            ) : (
              <form action={setProjectStatus.bind(null, id, "completed")}>
                <SubmitButton variant="secondary" pendingLabel="Afronden…">
                  ✓ Afronden
                </SubmitButton>
              </form>
            )}
            <LinkButton href="/projects" variant="ghost">
              ← Overzicht
            </LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={contractPrice != null ? "Aanneemprijs" : targetIsImplicit ? "Doel (= gefactureerd)" : "Offerte (doel)"}
          value={formatEUR(targetRevenue)}
          hint={contractPrice != null ? "afgesproken · ex. BTW" : targetIsImplicit ? "nog geen offerte/aanneemprijs" : "offertetotaal · ex. BTW"}
          tone="info"
        />
        <StatTile label="Gefactureerd" value={formatEUR(projRevenue)} hint="ex. BTW" tone="neutral" />
        <StatTile label="Nog te factureren" value={formatEUR(toInvoice)} tone={toInvoice > 0 ? "warning" : "neutral"} />
        <StatTile label="Totale kosten (verwacht)" value={formatEUR(totalCost)} hint="arbeid + inkoop + eigen producten" tone="neutral" />
        <StatTile label="Arbeid" value={formatEUR(laborCost)} hint={`${laborHours.toLocaleString("nl-NL")} uur`} tone="neutral" />
        <StatTile label="Inkoop / materiaal" value={formatEUR(materialCost)} hint="gekoppelde inkoop + kostenregels" tone="neutral" />
        <StatTile
          label="Eigen producten"
          value={formatEUR(ownProductCostExpected)}
          hint={offerteProductCost > projCost ? "kostprijs op offerte" : "kostprijs op facturen"}
          tone="neutral"
        />
        <StatTile
          label="Verwacht resultaat"
          value={`${formatEUR(expectedProfit)}${expectedMarginPct != null ? ` · ${expectedMarginPct}%` : ""}`}
          hint="doel − verwachte kosten"
          tone={resultTone}
        />
      </div>

      {/* ─────────────── Resultaat (P&L) ─────────────── */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Resultaat — zitten we goed?</CardTitle>
          <span className="text-xs text-muted">begroot → werkelijk → gefactureerd · alle bedragen ex. BTW</span>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Doel (omzet)</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(targetRevenue)}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Begrote kosten</p>
              <p className="text-lg font-semibold tabular-nums">{budgetCostTotal > 0 ? formatEUR(budgetCostTotal) : "—"}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Werkelijke kosten</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatEUR(realizedCost)}
                {budgetCostTotal > 0 && (
                  <span className={`ml-2 text-xs font-normal ${realizedCost > budgetCostTotal ? "text-danger" : "text-success"}`}>
                    {realizedCost > budgetCostTotal ? "▲ boven" : "▼ onder"} begroting ({formatEUR(Math.abs(realizedCost - budgetCostTotal))})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className={`rounded-lg p-3 text-sm ${resultTone === "danger" ? "bg-danger/10 text-danger" : resultTone === "warning" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
            <span className="font-semibold">
              {resultTone === "danger" ? "⚠ Let op — verwacht verlies" : resultTone === "warning" ? "⚠ Krappe marge" : "✓ Op koers"}
            </span>{" "}
            Verwacht resultaat {formatEUR(expectedProfit)}
            {expectedMarginPct != null ? ` (${expectedMarginPct}% marge)` : ""} ·{" "}
            kosten zijn {costRatio != null ? `${Math.round(costRatio * 100)}%` : "—"} van het doel ·{" "}
            gerealiseerd (gefactureerd − kosten): {formatEUR(realizedProfit)}.
          </div>
        </CardContent>
      </Card>

      {/* ─────────────── Bouw: begroting, uren, kosten ─────────────── */}
      <details open={isConstruction} className="group mb-5">
        <summary className="mb-3 cursor-pointer list-none text-lg font-semibold marker:content-none">
          <span className="inline-flex items-center gap-2">
            <span className="text-muted transition group-open:rotate-90">▶</span>
            Begroting, uren &amp; kosten
            <span className="text-xs font-normal text-muted">
              {isConstruction ? "(bouwproject)" : "(klik om te openen)"}
            </span>
          </span>
        </summary>

        <div className="grid gap-5">
          {/* Fases */}
          <Card>
            <CardHeader>
              <CardTitle>Fases</CardTitle>
              <span className="text-xs text-muted">wat er per fase gebeurt — sturen de begroting & facturatie aan</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {phaseRows.length > 0 && (
                <div className="space-y-2">
                  {phaseRows.map((ph) => (
                    <div key={ph.id} className="rounded-md border bg-background px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{ph.name}</p>
                          {ph.description ? <p className="text-xs text-muted">{ph.description}</p> : null}
                          {ph.plannedWeeks ? <p className="text-[11px] text-muted">🗓 {ph.plannedWeeks}</p> : null}
                        </div>
                        <form action={deleteProjectPhase.bind(null, id, ph.id)}>
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form action={addProjectPhase.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_auto] lg:items-end">
                <Field label="Fase">
                  <Input name="name" required placeholder="bijv. Fase 1 — Sloop" />
                </Field>
                <Field label="Wat gebeurt er">
                  <Input name="description" placeholder="bijv. sloop & strippen, afvoeren puin" />
                </Field>
                <Field label="Planning (optioneel)">
                  <Input name="plannedWeeks" placeholder="bijv. Week 1–3 · 2 weken" />
                </Field>
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Fase</SubmitButton>
              </form>
            </CardContent>
          </Card>

          {/* Begroting */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Begroting</CardTitle>
                  <span className="text-xs text-muted">
                    targetprijs {formatEUR(budgetTargetTotal)} · geraamde kost {formatEUR(budgetCostTotal)} ·{" "}
                    begrote marge {formatEUR(begrootMarge)}
                    {begrootMargePct != null ? ` (${begrootMargePct}%)` : ""}
                  </span>
                </div>
                {budgetRows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <LinkButton href={`/projects/${id}/begroting/pdf`} target="_blank" variant="secondary" size="sm">
                      📄 Print begroting
                    </LinkButton>
                    <form action={createEstimateFromBudget.bind(null, id)}>
                      <SubmitButton size="sm" variant="primary" pendingLabel="Bezig…">
                        → Maak offerte van begroting
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {phaseRows.length === 0 && (
                <p className="rounded-md bg-background px-3 py-2 text-sm text-muted">
                  Maak eerst hierboven een <strong>fase</strong> aan (bijv. “Fase 1 — Sloop”). Daarna voeg je per fase
                  meerdere onderdelen met een prijs toe.
                </p>
              )}

              {/* Eén blok per fase: koptekst + onderdelen + een mini-formulier om een onderdeel toe te voegen. */}
              {budgetBlocks.map((blk) => {
                const lines = blk.lines;
                const tTotal = lines.reduce((s, b) => s + Number(b.amountEur ?? 0), 0);
                const cTotal = lines.reduce((s, b) => s + Number(b.estimatedCostEur ?? 0), 0);
                return (
                  <div key={blk.key} className="overflow-hidden rounded-lg border">
                    <div className="flex items-baseline justify-between gap-2 bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{blk.title}</p>
                        {blk.description ? <p className="text-xs text-muted">{blk.description}</p> : null}
                        {blk.plannedWeeks ? <p className="text-[11px] text-muted">🗓 {blk.plannedWeeks}</p> : null}
                      </div>
                      {lines.length > 0 && (
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatEUR(tTotal)}</p>
                      )}
                    </div>

                    {lines.length > 0 && (
                      <Table>
                        <THead>
                          <tr>
                            <Th>Onderdeel</Th>
                            <Th className="text-right">Targetprijs</Th>
                            <Th className="text-right">Kost</Th>
                            <Th className="text-right">Marge</Th>
                            <Th />
                          </tr>
                        </THead>
                        <TBody>
                          {lines.map((b) => {
                            const t = Number(b.amountEur ?? 0);
                            const c = b.estimatedCostEur != null ? Number(b.estimatedCostEur) : null;
                            const mp = c != null && t > 0 ? Math.round(((t - c) / t) * 100) : null;
                            return (
                              <Tr key={b.id}>
                                <Td>
                                  <span className="font-medium">{b.description}</span>
                                  {b.isStelpost && <Badge tone="warning" className="ml-2">stelpost</Badge>}
                                  {(b.section || (b.quantity && b.unitPriceEur)) && (
                                    <span className="block text-xs text-muted">
                                      {b.section ? b.section : ""}
                                      {b.section && b.quantity && b.unitPriceEur ? " · " : ""}
                                      {b.quantity && b.unitPriceEur
                                        ? `${Number(b.quantity).toLocaleString("nl-NL")} × ${formatEUR(b.unitPriceEur)}`
                                        : ""}
                                    </span>
                                  )}
                                </Td>
                                <Td className="text-right tabular-nums font-medium">{formatEUR(t)}</Td>
                                <Td className="text-right tabular-nums text-muted">{c != null ? formatEUR(c) : "—"}</Td>
                                <Td className="text-right tabular-nums">{c != null ? `${formatEUR(t - c)}${mp != null ? ` · ${mp}%` : ""}` : "—"}</Td>
                                <Td className="text-right">
                                  <form action={deleteBudgetLine.bind(null, id, b.id)}>
                                    <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                                  </form>
                                </Td>
                              </Tr>
                            );
                          })}
                          {cTotal > 0 && (
                            <Tr>
                              <Td className="text-xs text-muted">Subtotaal kost / marge</Td>
                              <Td />
                              <Td className="text-right text-xs tabular-nums text-muted">{formatEUR(cTotal)}</Td>
                              <Td className="text-right text-xs tabular-nums text-muted">{formatEUR(tTotal - cTotal)}</Td>
                              <Td />
                            </Tr>
                          )}
                        </TBody>
                      </Table>
                    )}

                    {/* Mini-formulier: onderdeel toevoegen aan déze fase (geen fase overtypen). */}
                    <form
                      action={addBudgetLine.bind(null, id)}
                      className="flex flex-wrap items-end gap-2 border-t bg-surface px-3 py-2.5"
                    >
                      <input type="hidden" name="phase" value={blk.phaseValue} />
                      <Field label="Onderdeel" className="min-w-[12rem] flex-1">
                        <Input name="description" required placeholder="bijv. Sloop binnenwanden" />
                      </Field>
                      <Field label="Targetprijs €" className="w-32">
                        <Input name="amountEur" inputMode="decimal" required placeholder="0,00" />
                      </Field>
                      <Field label="Kost € (optie)" className="w-28">
                        <Input name="estimatedCostEur" inputMode="decimal" placeholder="0,00" />
                      </Field>
                      <label className="flex items-center gap-1.5 pb-2 text-sm">
                        <input type="checkbox" name="isStelpost" className="size-4" /> stelpost
                      </label>
                      <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ onderdeel</SubmitButton>
                    </form>
                  </div>
                );
              })}

              {budgetRows.length > 0 && (
                <div className="ml-auto w-full max-w-sm space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Subtotaal targetprijs</span>
                    <span className="tabular-nums">{formatEUR(budgetTargetBase)}</span>
                  </div>
                  {contingencyAmt > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">Onvoorzien ({contingencyPct}%)</span>
                      <span className="tabular-nums">{formatEUR(contingencyAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Totaal (= doel)</span>
                    <span className="tabular-nums">{formatEUR(budgetTargetTotal)}</span>
                  </div>
                  {budgetCostTotal > 0 && (
                    <>
                      <div className="flex justify-between text-muted">
                        <span>Totaal geraamde kost</span>
                        <span className="tabular-nums">{formatEUR(budgetCostTotal)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-success">
                        <span>Begrote marge</span>
                        <span className="tabular-nums">
                          {formatEUR(begrootMarge)}
                          {begrootMargePct != null ? ` · ${begrootMargePct}%` : ""}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Uren */}
          <Card>
            <CardHeader>
              <CardTitle>Uren — arbeid</CardTitle>
              <span className="text-xs text-muted">
                {laborHours.toLocaleString("nl-NL")} uur · {formatEUR(laborCost)} kosten
                {project.budgetHours ? ` · begroot ${Number(project.budgetHours).toLocaleString("nl-NL")} u` : ""}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeRows.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>Arbeider</Th>
                      <Th className="text-right">Uren</Th>
                      <Th className="text-right">Tarief</Th>
                      <Th className="text-right">Kosten</Th>
                      <Th>Betaling</Th>
                      <Th />
                    </tr>
                  </THead>
                  <TBody>
                    {timeRows.map((t) => (
                      <Tr key={t.id}>
                        <Td className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</Td>
                        <Td>{t.workerName ?? "—"}{t.note ? <span className="block text-xs text-muted">{t.note}</span> : null}</Td>
                        <Td className="text-right tabular-nums">{Number(t.hours).toLocaleString("nl-NL")}</Td>
                        <Td className="text-right tabular-nums text-muted">{formatEUR(t.hourlyCostEur)}</Td>
                        <Td className="text-right tabular-nums font-medium">{formatEUR(Number(t.hours) * Number(t.hourlyCostEur))}</Td>
                        <Td><Badge tone={t.paymentMethod === "cash" ? "warning" : "neutral"}>{PAY_LABEL[t.paymentMethod]}</Badge></Td>
                        <Td className="text-right">
                          <form action={deleteTimeEntry.bind(null, id, t.id)}>
                            <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
              {workerRows.length === 0 ? (
                <p className="text-sm text-muted">
                  Voeg eerst arbeiders toe in <Link href="/ploeg" className="text-accent hover:underline">Ploeg</Link>.
                </p>
              ) : (
                <form action={addTimeEntry.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.9fr_1fr_auto] lg:items-end">
                  <Field label="Arbeider">
                    <Select name="workerId" required>
                      {workerOptions.map((w) => (
                        <option key={w.value} value={w.value}>{w.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Uren">
                    <Input name="hours" inputMode="decimal" required placeholder="8" />
                  </Field>
                  <Field label="Datum">
                    <Input name="date" type="date" required />
                  </Field>
                  <Field label="Betaling">
                    <Select name="paymentMethod" defaultValue="cash">
                      <option value="cash">Contant</option>
                      <option value="invoice">Per factuur</option>
                    </Select>
                  </Field>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Uren</SubmitButton>
                  <Field label="Tarief (€/u) — leeg = standaard" className="lg:col-span-2">
                    <Input name="hourlyCostEur" inputMode="decimal" placeholder="overschrijf tarief" />
                  </Field>
                  <Field label="Notitie" className="lg:col-span-3">
                    <Input name="note" placeholder="optioneel" />
                  </Field>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Kosten & inkoop */}
          <Card>
            <CardHeader>
              <CardTitle>Kosten &amp; inkoop</CardTitle>
              <span className="text-xs text-muted">
                gekoppelde inkoop {formatEUR(poCost)} + losse kosten {formatEUR(looseCost)} = {formatEUR(materialCost)}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkedPOs.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Gekoppelde inkooporders</p>
                  <Table>
                    <TBody>
                      {linkedPOs.map((p) => (
                        <Tr key={p.id}>
                          <Td>
                            <Link href={`/inkooporders/${p.id}`} className="text-accent hover:underline">{p.supplier}</Link>
                            {p.reference ? <span className="ml-1 text-xs text-muted">{p.reference}</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatEUR(p.subtotal ?? p.total)}</Td>
                          <Td className="text-right">
                            <form action={unlinkPurchaseOrder.bind(null, id, p.id)}>
                              <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">ontkoppel</SubmitButton>
                            </form>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
              {costRows.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>Categorie</Th>
                      <Th>Omschrijving</Th>
                      <Th className="text-right">Bedrag</Th>
                      <Th>Betaling</Th>
                      <Th />
                    </tr>
                  </THead>
                  <TBody>
                    {costRows.map((c) => (
                      <Tr key={c.id}>
                        <Td className="whitespace-nowrap">{new Date(c.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</Td>
                        <Td>{BUDGET_CAT_LABEL[c.category] ?? c.category}</Td>
                        <Td>{c.description}{c.supplier ? <span className="block text-xs text-muted">{c.supplier}</span> : null}</Td>
                        <Td className="text-right tabular-nums font-medium">{formatEUR(c.amountEur)}</Td>
                        <Td><Badge tone={c.paymentMethod === "cash" ? "warning" : "neutral"}>{PAY_LABEL[c.paymentMethod]}</Badge></Td>
                        <Td className="text-right">
                          <form action={deleteProjectCost.bind(null, id, c.id)}>
                            <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
              <form action={addProjectCost.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.9fr_1fr_1.6fr_0.9fr_0.9fr_auto] lg:items-end">
                <Field label="Datum">
                  <Input name="date" type="date" required />
                </Field>
                <Field label="Categorie">
                  <Select name="category" defaultValue="material">
                    <option value="material">Materiaal</option>
                    <option value="subcontractor">Onderaanneming</option>
                    <option value="equipment">Materieel</option>
                    <option value="other">Overig</option>
                  </Select>
                </Field>
                <Field label="Omschrijving">
                  <Input name="description" required placeholder="bijv. tegels + lijm" />
                </Field>
                <Field label="Bedrag (€)">
                  <Input name="amountEur" inputMode="decimal" required placeholder="0,00" />
                </Field>
                <Field label="Betaling">
                  <Select name="paymentMethod" defaultValue="invoice">
                    <option value="cash">Contant</option>
                    <option value="invoice">Per factuur</option>
                  </Select>
                </Field>
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Kost</SubmitButton>
              </form>
              {unlinkedPOs.length > 0 && (
                <form action={linkPurchaseOrderToProject.bind(null, id)} className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <Field label="Bestaande inkooporder koppelen" className="flex-1">
                    <Select name="purchaseOrderId" defaultValue="">
                      <option value="">— kies inkooporder —</option>
                      {unlinkedPOs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.supplier}{p.reference ? ` · ${p.reference}` : ""} — {formatEUR(p.subtotal ?? p.total)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">Koppelen</SubmitButton>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </details>

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="p-5">
            <form action={action} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Naam" htmlFor="name">
                  <Input id="name" name="name" required defaultValue={project.name} />
                </Field>
                <Field label="Code (optioneel)" htmlFor="code" hint="korte projectcode, bv. VER">
                  <Input id="code" name="code" defaultValue={project.code ?? ""} />
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={project.status}>
                    <option value="active">Actief</option>
                    <option value="completed">Afgerond</option>
                    <option value="archived">Gearchiveerd</option>
                  </Select>
                </Field>
                <Field label="Soort project" htmlFor="kind" hint="bouw toont uren, kosten & begroting">
                  <Select id="kind" name="kind" defaultValue={project.kind}>
                    <option value="sales">Verkoop (producten)</option>
                    <option value="construction">Bouw / werkzaamheden</option>
                  </Select>
                </Field>
                <Field label="Aanneemprijs (€, ex. BTW)" htmlFor="contractPriceEur" hint="leeg = offertetotaal als doel">
                  <Input
                    id="contractPriceEur"
                    name="contractPriceEur"
                    inputMode="decimal"
                    defaultValue={project.contractPriceEur ? String(project.contractPriceEur).replace(".", ",") : ""}
                  />
                </Field>
                <Field label="Begrote uren (optioneel)" htmlFor="budgetHours">
                  <Input
                    id="budgetHours"
                    name="budgetHours"
                    inputMode="decimal"
                    defaultValue={project.budgetHours ? String(project.budgetHours).replace(".", ",") : ""}
                  />
                </Field>
                <Field label="Verantwoordelijke" htmlFor="ownerId">
                  <Combobox
                    name="ownerId"
                    options={ownerOptions}
                    defaultValue={project.ownerId ?? ""}
                    placeholder="— geen — / kies medewerker"
                    clearable
                  />
                </Field>
                <Field label="Klant" htmlFor="contactId">
                  <Combobox
                    name="contactId"
                    options={contactOptions}
                    defaultValue={project.contactId ?? ""}
                    placeholder="— geen — / zoek contact"
                    clearable
                  />
                </Field>
                <Field label="Pand (optioneel)" htmlFor="propertyId">
                  <Combobox
                    name="propertyId"
                    options={propertyOptions}
                    defaultValue={project.propertyId ?? ""}
                    placeholder="— geen — / zoek pand"
                    clearable
                  />
                </Field>
                <Field label="Startdatum" htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" defaultValue={project.startDate ?? ""} />
                </Field>
                <Field label="Einddatum (gepland)" htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" defaultValue={project.endDate ?? ""} />
                </Field>
              </div>
              <Field label="Omschrijving" htmlFor="description">
                <Textarea id="description" name="description" rows={4} defaultValue={project.description ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <SubmitButton pendingLabel="Opslaan…">Opslaan</SubmitButton>
                {!project.holdedProjectId && (
                  <ConfirmSubmit
                    formAction={remove}
                    message="Dit project definitief verwijderen?"
                    pendingLabel="Verwijderen…"
                    className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    Project verwijderen
                  </ConfirmSubmit>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Aangemaakt</span>
                <span>{new Date(project.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Bijgewerkt</span>
                <span>{new Date(project.updatedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {project.holdedProjectId && (
                <div className="flex justify-between gap-3 border-t pt-1.5">
                  <span className="text-muted">Holded-ID</span>
                  <span className="truncate font-mono text-xs">{project.holdedProjectId}</span>
                </div>
              )}
              {project.code && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Code</span>
                  <span className="font-medium">{project.code}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documenten in dit project</CardTitle>
              <span className="text-xs text-muted">{linkedDocs.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {invoiceDocs.length > 0 && (
                <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs">
                  <span className="text-muted">Marge (intern · gefactureerd)</span>
                  <span
                    className={`tabular-nums font-medium ${projMargin < 0 ? "text-danger" : "text-foreground"}`}
                  >
                    €{" "}
                    {projMargin.toLocaleString("nl-NL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {projMarginPct != null ? ` · ${projMarginPct}%` : ""}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <LinkButton
                  href={`/documents/new?kind=estimate&projectId=${id}${project.contactId ? `&contactId=${project.contactId}` : ""}${project.propertyId ? `&propertyId=${project.propertyId}` : ""}`}
                  variant="secondary"
                  className="text-xs"
                >
                  + Nieuwe offerte
                </LinkButton>
                <LinkButton
                  href={`/documents/new?kind=invoice&projectId=${id}${project.contactId ? `&contactId=${project.contactId}` : ""}${project.propertyId ? `&propertyId=${project.propertyId}` : ""}`}
                  variant="ghost"
                  className="text-xs"
                >
                  + Nieuwe factuur
                </LinkButton>
              </div>

              {/* Bestaand document (factuur/offerte) aan dit project koppelen. */}
              {unlinkedDocs.length > 0 && (
                <form action={attachDocumentToProject.bind(null, id)} className="flex items-center gap-2 rounded-md bg-background px-2 py-2">
                  <Select name="documentId" defaultValue="" className="h-8 flex-1 text-xs" required>
                    <option value="" disabled>
                      Bestaande factuur/offerte koppelen…
                    </option>
                    {unlinkedDocs.map((d) => {
                      const k = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : "Creditnota";
                      return (
                        <option key={d.id} value={d.id}>
                          {k} {d.docNumber ?? "(geen nr.)"}
                          {d.title ? ` — ${d.title}` : ""} · €{" "}
                          {Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </option>
                      );
                    })}
                  </Select>
                  <SubmitButton pendingLabel="Koppelen…" className="h-8 px-3 text-xs">
                    Koppel
                  </SubmitButton>
                </form>
              )}

              {linkedDocs.length === 0 ? (
                <p className="text-muted">
                  Nog niets gekoppeld — gebruik de knoppen hierboven, of kies dit project in het projectveld bij het bewerken van een bestaand document.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedDocs.map((d) => {
                    const kindLabel = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : d.kind === "creditnote" ? "Creditnota" : d.kind === "deliverynote" ? "Pakbon" : d.kind;
                    const isSale = d.kind === "invoice" || d.kind === "deliverynote";
                    const voided = d.status === "void";
                    const booked = !!d.stockAppliedAt;
                    return (
                      <li key={d.id} className="rounded-md border border-border/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/documents/${d.id}`} className="truncate hover:underline">
                            <span className="font-medium">{kindLabel}</span>{" "}
                            <span className="text-muted">{d.docNumber ?? "(geen nr.)"}</span>
                            {d.title && <span className="ml-1 text-xs text-muted">— {d.title}</span>}
                          </Link>
                          <span className={`shrink-0 text-xs tabular-nums ${voided ? "text-muted line-through" : "text-muted"}`}>
                            € {Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {(d.kind === "invoice" || d.kind === "creditnote") && marginByDoc.has(d.id) && (
                          <div className="mt-0.5 text-[11px] text-muted">
                            Marge:{" "}
                            <span className={marginByDoc.get(d.id)!.margin < 0 ? "font-medium text-danger" : "font-medium text-foreground"}>
                              € {marginByDoc.get(d.id)!.margin.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {marginByDoc.get(d.id)!.pct != null ? ` · ${marginByDoc.get(d.id)!.pct}%` : ""}
                            </span>
                          </div>
                        )}
                        {isSale && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {d.kind === "deliverynote" ? (
                              d.deliveredAt ? (
                                <Badge tone="success">Afgeleverd</Badge>
                              ) : (
                                <Badge tone="neutral">Niet afgeleverd</Badge>
                              )
                            ) : voided ? (
                              <Badge tone="danger">Geannuleerd</Badge>
                            ) : booked ? (
                              <>
                                <Badge tone="success">Voorraad afgeboekt</Badge>
                                <ConfirmSubmit
                                  formAction={reverseStockOutFromDocument.bind(null, d.id)}
                                  message="Voorraad-afboeking terugdraaien? De stuks komen weer in voorraad."
                                  pendingLabel="…"
                                  className="rounded px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-muted/50"
                                >
                                  Terugdraaien
                                </ConfirmSubmit>
                              </>
                            ) : (
                              <ConfirmSubmit
                                formAction={applyStockOutFromDocument.bind(null, d.id)}
                                message="Voorraad van deze factuur nu afboeken?"
                                pendingLabel="…"
                                className="rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50"
                              >
                                Voorraad afboeken
                              </ConfirmSubmit>
                            )}
                            {!voided && (
                              <ConfirmSubmit
                                formAction={cancelSaleReturnStock.bind(null, d.id)}
                                message="Deze verkoop annuleren? De factuur wordt op 'geannuleerd' gezet en de voorraad komt terug."
                                pendingLabel="Annuleren…"
                                className="rounded px-2 py-0.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10"
                              >
                                Annuleren
                              </ConfirmSubmit>
                            )}
                          </div>
                        )}
                        {d.kind === "estimate" && d.status !== "rejected" && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {isEstimateConverted(Number(d.totalEur ?? 0)) ? (
                              <Badge tone="success">Gefactureerd</Badge>
                            ) : (
                              <>
                                {(d.status === "accepted" || d.reservedAt) && (
                                  <Badge tone="info">Gereserveerd</Badge>
                                )}
                                {d.status !== "accepted" && (
                                  <ConfirmSubmit
                                    formAction={toggleReserveEstimate.bind(null, d.id)}
                                    message={
                                      d.reservedAt
                                        ? "Reservering opheffen? De producten tellen dan niet meer als gereserveerd."
                                        : "Deze offerte-producten reserveren? Ze tellen dan mee als gereserveerde voorraad (dashboard + bestellijst)."
                                    }
                                    pendingLabel="Bezig…"
                                    className="rounded px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50"
                                  >
                                    {d.reservedAt ? "Reservering opheffen" : "🔖 Reserveren"}
                                  </ConfirmSubmit>
                                )}
                                <ConfirmSubmit
                                  formAction={approveEstimateToInvoice.bind(null, d.id)}
                                  message="Een factuur aanmaken van deze offerte? De gereserveerde producten gaan naar verkocht; je belandt op de nieuwe factuur om te versturen."
                                  pendingLabel="Bezig…"
                                  className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                                >
                                  {d.status === "accepted" ? "→ Factuur maken (verkopen)" : "✓ Goedkeuren → factuur"}
                                </ConfirmSubmit>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {(reservedProducts.length > 0 || soldProducts.length > 0) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Gereserveerd</CardTitle>
              <span className="text-xs text-muted">
                {reservedProducts.length} {reservedProducts.length === 1 ? "product" : "producten"}
              </span>
            </CardHeader>
            {reservedProducts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Niets gereserveerd — uit geaccepteerde offertes.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Aantal</Th>
                    <Th className="text-right">Bedrag</Th>
                  </tr>
                </THead>
                <TBody>
                  {reservedProducts.map((p, i) => (
                    <Tr key={i}>
                      <Td>
                        <ProductCell image={p.image} name={p.name} />
                      </Td>
                      <Td className="text-right tabular-nums text-warning">{p.reservedNet}</Td>
                      <Td className="text-right tabular-nums text-muted">{euro(p.reservedNetAmt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted">
              Uit geaccepteerde offertes; keur een offerte goed om naar verkocht te boeken.
            </p>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Verkocht</CardTitle>
              <span className="text-xs text-muted">
                {soldProducts.length} {soldProducts.length === 1 ? "product" : "producten"}
              </span>
            </CardHeader>
            {soldProducts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Nog niets verkocht — uit facturen.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Aantal</Th>
                    <Th className="text-right">Bedrag</Th>
                  </tr>
                </THead>
                <TBody>
                  {soldProducts.map((p, i) => (
                    <Tr key={i}>
                      <Td>
                        <ProductCell image={p.image} name={p.name} />
                      </Td>
                      <Td className="text-right tabular-nums text-success">{p.sold}</Td>
                      <Td className="text-right tabular-nums text-muted">{euro(p.soldAmt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted">Uit facturen (minus creditnota&apos;s).</p>
          </Card>
        </div>
      )}
    </>
  );
}

function euro(n: number): string {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProductCell({ image, name }: { image: string | null; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-9 w-9 shrink-0 rounded border border-border object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded border border-border bg-muted" />
      )}
      <span className="font-medium">{name}</span>
    </div>
  );
}
