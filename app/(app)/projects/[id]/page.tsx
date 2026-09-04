import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopyLinkButton } from "@/components/copy-link-button";
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
import { TimeEntryForm } from "@/components/time-entry-form";
import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { LayoutDashboard, Wallet, Clock, FileText, Settings, Check, ArrowLeft, RotateCcw, Printer, Send } from "lucide-react";
import { db } from "@/lib/db";
import {
  contacts,
  documents,
  products,
  projectBudgetLines,
  projectCosts,
  projectExtras,
  projectPayments,
  sentEmails,
  projectPhases,
  projects,
  properties,
  purchaseOrders,
  timeEntries,
  users,
  workerPortalLinks,
  workers,
} from "@/lib/db/schema";
import { docOwnShare, docProductMargin, lineCostEur, lineMaterialCostEur, normalizeDocItems } from "@/lib/documents";
import { deliveryTotals } from "@/lib/project-delivery";
import { poExVat, poExVatAmount, poExVatAssumingSpanishVat } from "@/lib/purchase-orders";
import { DEFAULT_LABOR_MARGIN_PCT, DEFAULT_PURCHASE_MARGIN_PCT, deriveAdvanceCover, deriveProjectMargins } from "@/lib/project-financials";
import { coverReceivedEx, receiptExVat as exBtwVanOntvangst } from "@/lib/receipts";
import type { DocumentLineItem } from "@/lib/db/schema";
import { moneyForInput } from "@/lib/parse-money";
import { formatEUR } from "@/lib/utils";
import {
  addProjectCost,
  addProjectPayment,
  addTimeEntry,
  approveAllPendingTimeEntries,
  approveTimeEntry,
  attachDocumentToProject,
  createFinalSettlement,
  createWorkerPortalLink,
  deleteProject,
  deleteProjectCost,
  deleteProjectPayment,
  deleteTimeEntry,
  deleteWorkerPortalLink,
  updateTimeEntry,
  linkPurchaseOrderToProject,
  sendBudgetToClient,
  setPhaseProgress,
  setProjectStatus,
  unlinkPurchaseOrder,
  updateProject,
} from "../actions";
import { AdvanceRequestCard } from "./advance-request-card";
import { ProjectDeliveriesCard } from "./deliveries-card";
import { ProjectExtrasCard } from "./extras-card";
import {
  applyStockOutFromDocument,
  approveEstimateToInvoice,
  cancelSaleReturnStock,
  reverseStockOutFromDocument,
  toggleReserveEstimate,
} from "../../documents/actions";
import { stuurKlantportaalUitnodiging } from "@/app/klant/actions";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    edit?: string;
    // Voorschot opvragen: bedrag/termijn/datum staan in de URL, zodat het
    // concept server-side opgebouwd wordt zonder verborgen toestand.
    vbedrag?: string;
    vtermijn?: string;
    vdatum?: string;
    vmail?: string;
    vstand?: string;
    vrestant?: string;
    lev?: string;
  }>;
}) {
  const { id } = await params;
  const { edit: editEntryId, ...voorschotParams } = await searchParams;
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
        subtotalEur: documents.subtotalEur,
        issueDate: documents.issueDate,
        stockAppliedAt: documents.stockAppliedAt,
        reservedAt: documents.reservedAt,
        deliveredAt: documents.deliveredAt,
      })
      .from(documents)
      .where(eq(documents.projectId, id))
      // Oplopend: de offerte bovenaan en de termijnen in volgorde (1 → 10),
      // in plaats van nieuwste-eerst waardoor termijn 10 bovenaan stond.
      .orderBy(asc(documents.issueDate), asc(documents.createdAt)),
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
    .select({ id: documents.id, kind: documents.kind, status: documents.status, subtotalEur: documents.subtotalEur, totalEur: documents.totalEur, paidEur: documents.paidEur, items: documents.items })
    .from(documents)
    .where(and(eq(documents.projectId, id), inArray(documents.kind, ["estimate", "invoice", "creditnote"])));
  // Aanbetalingen/voorschotten (proforma of als voorschot gemarkeerde factuur).
  const advanceDocs = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      docNumber: documents.docNumber,
      status: documents.status,
      totalEur: documents.totalEur,
      subtotalEur: documents.subtotalEur,
      vatReverseCharge: documents.vatReverseCharge,
      settledAt: documents.advanceSettledAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, id),
        or(eq(documents.kind, "proforma"), eq(documents.isAdvance, true)),
      ),
    )
    .orderBy(desc(documents.createdAt));
  const advPaid = advanceDocs.filter((a) => a.status === "paid");
  const advPaidTotal = advPaid.reduce((s, a) => s + Number(a.totalEur ?? 0), 0);
  const advOpenToSettle = advPaid
    .filter((a) => !a.settledAt)
    .reduce((s, a) => s + Number(a.totalEur ?? 0), 0);

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
  // Kostprijs-lookup uit de catalogus (op productId of SKU/omschrijving).
  const productCostOf = (it: DocumentLineItem) =>
    (it.productId ? pCostById.get(it.productId) : undefined) ??
    (it.description ? pCostBySku.get(it.description.trim()) : undefined);
  // Marge per document: regel-kostprijs > regel-marge% > catalogus-kostprijs.
  const docMarginCost = (items: unknown) => {
    let cost = 0;
    for (const it of normalizeDocItems(items)) {
      const c = lineCostEur(it, productCostOf);
      if (c != null) cost += c;
    }
    return cost;
  };
  // Materiaal-/productkostprijs voor het projecttotaal (arbeid-regels niet — die
  // zitten al in de uren; geen marge%-afleiding).
  const docMaterialCost = (items: unknown) => {
    let cost = 0;
    for (const it of normalizeDocItems(items)) cost += lineMaterialCostEur(it, productCostOf);
    return cost;
  };
  let projRevenue = 0;
  let projCost = 0; // materiaal-/productkostprijs op facturen (gerealiseerd) — arbeid komt uit de uren
  // Eigen producten apart: verkoop én kostprijs per regel, zodat we de ECHTE
  // marge op wat we zelf leveren kunnen tonen (arbeidregels blijven erbuiten).
  let ownRevenue = 0;
  let ownCost = 0;
  let ownUncostedRevenue = 0;
  const marginByDoc = new Map<string, { margin: number; pct: number | null }>();
  // Eigen-productaandeel per document — voor de voorschotdekking: een betaling
  // op een factuur telt maar voor (1 − aandeel) mee als dekking.
  const ownShareByDoc = new Map<string, number>();
  for (const d of marginDocs) {
    const rev = Number(d.subtotalEur ?? 0);
    if (d.kind === "estimate") continue;
    ownShareByDoc.set(d.id, docOwnShare(d.items, rev, productCostOf));
    const marginCost = docMarginCost(d.items);
    marginByDoc.set(d.id, { margin: rev - marginCost, pct: rev > 0 ? Math.round(((rev - marginCost) / rev) * 100) : null });
    // Concepten en geannuleerde documenten tellen niet als omzet (zelfde filter
    // als de projectenlijst) — de marge-badge hierboven blijft wel zichtbaar.
    if (d.status === "draft" || d.status === "void") continue;
    const sign = d.kind === "creditnote" ? -1 : 1;
    projRevenue += sign * rev;
    projCost += sign * docMaterialCost(d.items);
    const pm = docProductMargin(d.items, productCostOf);
    ownRevenue += sign * pm.revenue;
    ownCost += sign * pm.cost;
    ownUncostedRevenue += sign * pm.uncostedRevenue;
  }
  // Producten die op het project zijn geleverd zonder losse factuur: de kostprijs
  // hoort bij de kosten en de VERKOOPPRIJS bij wat we doorbelasten. Zonder dit
  // zou zo'n levering een kale kostenpost zijn en leek de marge te laag.
  const leveringen = await deliveryTotals(id);
  ownRevenue += leveringen.price;
  ownCost += leveringen.cost;
  projCost += leveringen.cost;

  // Meerwerk staat BUITEN de aanneemsom maar moet wél doorbelast worden; de
  // kostprijs (als die is ingevuld) hoort bij de kosten.
  const [meerwerkTotaal] = await db
    .select({
      bedrag: sql<number>`coalesce(sum(${projectExtras.amountEur}), 0)::float8`,
      kost: sql<number>`coalesce(sum(${projectExtras.costEur}), 0)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(projectExtras)
    .where(eq(projectExtras.projectId, id));
  const meerwerkBedrag = Number(meerwerkTotaal?.bedrag ?? 0);
  ownRevenue += meerwerkBedrag;
  ownCost += Number(meerwerkTotaal?.kost ?? 0);
  projCost += Number(meerwerkTotaal?.kost ?? 0);

  // invoiceDocs = alleen facturen/creditnota's (voor de gefactureerd-lijst onderaan).
  const invoiceDocs = marginDocs.filter((d) => d.kind !== "estimate");
  // Openstaand (ex. btw): onbetaalde facturen, subtotaal × onbetaalde fractie.
  let openOutstanding = 0;
  let openInvoiceCount = 0;
  for (const d of marginDocs) {
    if (d.kind !== "invoice") continue;
    if (d.status === "draft" || d.status === "void" || d.status === "paid") continue;
    const total = Number(d.totalEur ?? 0);
    const paid = Number(d.paidEur ?? 0);
    if (total <= paid) continue;
    openOutstanding += total > 0 ? Number(d.subtotalEur ?? 0) * ((total - paid) / total) : 0;
    openInvoiceCount += 1;
  }
  // Let op: géén projRevenue − projCost meer als "marge". Dat telde regels zonder
  // kostprijs (bv. de aanbetaling FAC-2026-0028) als 100% marge. De marge op eigen
  // producten wordt gemeten met docProductMargin — zie `margins` verderop.

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
      // Alleen échte catalogusproducten (met productkoppeling) tellen als
      // gereserveerd/verkocht — werk-regels uit het prijzenboek (stucwerk,
      // containers, …) zijn geen voorraad.
      const key = it.productId;
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
  const [timeRows, costRows, paymentRows, budgetRows, linkedPOs, workerRows, unlinkedPOs, estTotals, phaseRows] =
    await Promise.all([
      db.select().from(timeEntries).where(eq(timeEntries.projectId, id)).orderBy(desc(timeEntries.date)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)).orderBy(desc(projectCosts.date)),
      // Ontvangsten mét het document waar ze uit voortkomen, zodat je ziet welke
      // regels automatisch uit een betaalde factuur komen.
      db
        .select({
          id: projectPayments.id,
          date: projectPayments.date,
          amountEur: projectPayments.amountEur,
          method: projectPayments.method,
          description: projectPayments.description,
          note: projectPayments.note,
          documentId: projectPayments.documentId,
          vatRate: projectPayments.vatRate,
          vatAmountEur: projectPayments.vatAmountEur,
          docNumber: documents.docNumber,
          docSubtotal: documents.subtotalEur,
          docTotal: documents.totalEur,
        })
        .from(projectPayments)
        .leftJoin(documents, eq(documents.id, projectPayments.documentId))
        .where(eq(projectPayments.projectId, id))
        .orderBy(desc(projectPayments.date)),
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
          tax: purchaseOrders.tax,
          items: purchaseOrders.items,
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

  // Portaal-uren tellen pas mee na goedkeuring (kantoor controleert eerst).
  const isPendingEntry = (t: (typeof timeRows)[number]) => t.selfLoggedAt != null && t.approvedAt == null;
  const approvedTimeRows = timeRows.filter((t) => !isPendingEntry(t));
  const pendingTimeRows = timeRows.filter(isPendingEntry);
  const pendingHours = pendingTimeRows.reduce((s, t) => s + Number(t.hours ?? 0), 0);
  const laborHours = approvedTimeRows.reduce((s, t) => s + Number(t.hours ?? 0), 0);
  const laborCost = approvedTimeRows.reduce((s, t) => s + Number(t.hours ?? 0) * Number(t.hourlyCostEur ?? 0), 0);
  // Als uren gekoppelde inkooporders tellen NIET als materiaal (ze zitten al als
  // arbeidskost in de uren via een uren-regel) — anders dubbel.
  const materialPOs = linkedPOs.filter((p) => !p.countAsLabor);
  const poCost = materialPOs.reduce((s, p) => s + poExVatAmount(p), 0); // ex. btw, EUR
  const looseCost = costRows.reduce((s, c) => s + Number(c.amountEur ?? 0), 0);
  const materialCost = poCost + looseCost;

  // Ontvangen betalingen van de klant (incl. btw) — informatief, los van de
  // factuurgebaseerde omzet/marge hierboven.
  // Voorschotverzoeken waar nog iets op openstaat — om een (deel)betaling aan
  // te kunnen hangen. Een klant maakt op een verzoek van € 50.000 soms eerst
  // € 30.000 over; zonder deze koppeling zie je nergens wat er nog moet komen.
  const advanceRequestRows = await db
    .select({
      id: sentEmails.id,
      subject: sentEmails.subject,
      amountEur: sentEmails.amountEur,
      ontvangen: sql<number>`(
        select coalesce(sum(pp.amount_eur), 0)::float8
        from project_payments pp where pp.advance_request_id = ${sentEmails.id}
      )`,
    })
    .from(sentEmails)
    .where(and(eq(sentEmails.projectId, id), like(sentEmails.subject, "Voorschot: %")))
    .orderBy(desc(sentEmails.createdAt))
    .limit(10);
  const openAdvanceRequests = advanceRequestRows
    .map((v) => {
      const gevraagd = v.amountEur != null ? Number(v.amountEur) : 0;
      const open = Math.round((gevraagd - Number(v.ontvangen)) * 100) / 100;
      const termijn = (v.subject ?? "").replace(/^Voorschot:\s*/, "").match(/\d{2}-\d{2}-\d{4}\s+(.*)$/)?.[1];
      return { id: v.id, open, label: `${termijn ?? "voorschot"} — nog ${formatEUR(open)} van ${formatEUR(gevraagd)}` };
    })
    .filter((v) => v.open > 0.01);

  // 15% "marge" betekent hier: 15% van de VERKOOPPRIJS (kost ÷ 0,85), niet 15%
  // bovenop de kostprijs (kost × 1,15). Dat scheelt op Silvestre € 2.179 en werd
  // verward, dus we zetten allebei de getallen erbij.
  const opslagPct = (margePct: number) =>
    margePct >= 100 ? null : Math.round((margePct / (100 - margePct)) * 1000) / 10;

  const receivedTotal = paymentRows.reduce((s, p) => s + Number(p.amountEur ?? 0), 0);
  // Betalingen worden incl. btw geboekt; de samenvattingen rekenen ex. btw.
  // De omrekening per ontvangst (contant, factuurverhouding, 21%-aanname)
  // staat in lib/receipts.ts en wordt gedeeld met de projectenlijst.
  const VAT_DIVISOR = 1.21;
  const receivedTotalEx = paymentRows.reduce((s, p) => s + exBtwVanOntvangst(p), 0);

  /**
   * Voorschotten: geld dat binnen is zonder dat er een eigen factuur tegenover
   * staat. Dat moet op de eindafrekening verrekend worden, anders betaalt de
   * klant twee keer. Ontvangsten die WEL aan een factuur hangen zitten al in
   * "gefactureerd" en tellen hier dus niet mee.
   */
  /**
   * Al gefactureerd maar nog niet betaald. Een verstuurde factuur is geen geld:
   * bij Silvestre staan F260012 en F260013 (samen € 25.056,45 ex. btw) al maanden
   * open. Die horen dus niet bij "al ontvangen".
   */
  const openInvoicedEx = Math.max(0, projRevenue - paymentRows.filter((p) => p.documentId).reduce((s, p) => s + exBtwVanOntvangst(p), 0));

  const voorschottenOnverrekendEx = paymentRows
    .filter((p) => !p.documentId)
    .reduce((s, p) => s + exBtwVanOntvangst(p), 0);

  // Eigen-productkost: gerealiseerd = op facturen; verwacht = het meest complete
  // beeld (offerte als die hoger is dan wat al gefactureerd is). Voorkomt zowel
  // "100% marge" (offerte nog niet gefactureerd) als dubbeltelling.
  const ownProductCostRealized = projCost;
  const realizedCost = laborCost + materialCost + ownProductCostRealized; // kosten tot nu toe

  // Voorschotdekking: schieten wij geld voor? Alleen kasgeld telt (uren + inkoop
  // derden) — eigen voorraadproducten niet, en van betaalde facturen alleen het
  // niet-productdeel. Methodiek: zie deriveAdvanceCover.
  const dekkingOntvangenEx = coverReceivedEx(paymentRows, ownShareByDoc);
  const cover = deriveAdvanceCover({ laborCost, purchaseCost: materialCost, coverReceivedEx: dekkingOntvangenEx });

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
  // Wat de klant al heeft betaald (ontvangsten) telt — net als wat al formeel is
  // gefactureerd — mee als "afgehandeld" richting de aanneemprijs. Zo beweegt
  // "nog te factureren" mee zodra er een ontvangst wordt geboekt.
  // Ontvangsten uit een betaald voorschot-FACTUUR zitten al in projRevenue
  // (gefactureerd) — die niet nogmaals aftrekken richting de aanneemprijs.
  const invoiceAdvanceMarkers = new Set(
    advanceDocs
      .filter((a) => a.kind === "invoice" && a.status === "paid")
      .map((a) => `Voorschot ${a.docNumber ?? ""}`.trim()),
  );
  const receivedFromInvoicedAdvances = paymentRows
    .filter((p) => p.method === "advance" && p.description && invoiceAdvanceMarkers.has(p.description))
    .reduce((s, p) => s + Number(p.amountEur ?? 0), 0);
  // Alleen NIET-gefactureerde voorschotten tellen mee richting de aanneemprijs.
  // Gewone factuurbetalingen zitten al in 'gefactureerd' (projRevenue) — die er
  // óók van aftrekken zou het betaalde bedrag dubbel tellen.
  const advanceReceived = paymentRows
    .filter((p) => p.method === "advance")
    .reduce((s, p) => s + Number(p.amountEur ?? 0), 0);
  const notInvoicedAdvancesEx = Math.max(0, advanceReceived - receivedFromInvoicedAdvances) / VAT_DIVISOR;
  const settledToTarget = projRevenue + notInvoicedAdvancesEx;
  const toInvoice = Math.max(0, targetRevenue - settledToTarget);

  // Resultaat TOT NU TOE = doel − werkelijke (gerealiseerde) kosten tot nu toe.
  // Norm: minimaal 15% marge → kosten mogen max. 85% van het doel zijn (kostenplafond).
  const MIN_MARGIN_PCT = 15;
  const resultToDate = targetRevenue - realizedCost;
  const resultMarginPct = targetRevenue > 0 ? Math.round((resultToDate / targetRevenue) * 100) : null;
  const costRatio = targetRevenue > 0 ? realizedCost / targetRevenue : null;
  const maxCost = targetRevenue * (1 - MIN_MARGIN_PCT / 100); // kostenplafond voor 15% marge
  const costHeadroom = maxCost - realizedCost; // + = ruimte over, − = boven plafond
  const resultTone =
    resultMarginPct == null
      ? "neutral"
      : resultMarginPct < 0
        ? "danger"
        : resultMarginPct < MIN_MARGIN_PCT
          ? "warning"
          : "success";

  // Marge per stroom: uren tegen een norm, eigen producten echt gemeten, inkoop
  // derden puur als kost (die zit in de aanneemprijs, niet in een eigen marge).
  const margins = deriveProjectMargins({
    laborCost,
    laborMarginPct: project.laborMarginPct != null ? Number(project.laborMarginPct) : null,
    productRevenue: ownRevenue,
    productCost: ownCost,
    uncostedProductRevenue: ownUncostedRevenue,
    purchaseCost: materialCost,
    purchaseMarginPct: project.purchaseMarginPct != null ? Number(project.purchaseMarginPct) : null,
  });

  const isConstruction = project.kind === "construction";
  const PAY_LABEL = { cash: "Contant", invoice: "Per factuur" } as const;
  const RECEIVED_METHOD_LABEL: Record<string, string> = {
    cash: "Contant",
    bank: "Bankoverschrijving",
    invoice: "Via factuur",
    advance: "Voorschot",
    other: "Overig",
  };
  const BUDGET_CAT_LABEL: Record<string, string> = {
    labor: "Arbeid",
    material: "Materiaal",
    subcontractor: "Onderaanneming",
    equipment: "Materieel",
    other: "Overig",
  };
  // Begroting-samenvatting voor de compacte kaart (de builder zit op /begroting).
  const budgetLineCount = budgetRows.length;
  const hasBudgetContent = budgetLineCount > 0 || phaseRows.length > 0;
  const begrootMarge = budgetTargetBase - budgetCostTotal;
  const begrootMargePct = budgetTargetBase > 0 ? Math.round((begrootMarge / budgetTargetBase) * 100) : null;
  // Urenportaal-links van dit project (arbeider → persoonlijke invul-link).
  const portalLinkRows = await db
    .select({
      id: workerPortalLinks.id,
      token: workerPortalLinks.token,
      workerId: workerPortalLinks.workerId,
      workerName: workers.name,
    })
    .from(workerPortalLinks)
    .innerJoin(workers, eq(workers.id, workerPortalLinks.workerId))
    .where(eq(workerPortalLinks.projectId, id))
    .orderBy(asc(workers.name));
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const portalBase = `${proto}://${host}/uren`;
  const linkedWorkerIds = new Set(portalLinkRows.map((l) => l.workerId));
  const unlinkedWorkers = workerRows.filter((w) => !linkedWorkerIds.has(w.id));

  const workerOptions = workerRows.map((w) => ({
    value: w.id,
    label: w.name + (w.role ? ` · ${w.role}` : ""),
    rate: Number(w.hourlyCostEur ?? 0),
    hourlyCostEur: w.hourlyCostEur != null ? Number(w.hourlyCostEur) : null,
    hourlyCostCashEur: w.hourlyCostCashEur != null ? Number(w.hourlyCostCashEur) : null,
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
                  <RotateCcw className="size-4" /> Heropenen
                </SubmitButton>
              </form>
            ) : (
              <form action={setProjectStatus.bind(null, id, "completed")}>
                <SubmitButton variant="secondary" pendingLabel="Afronden…">
                  <Check className="size-4" /> Afronden
                </SubmitButton>
              </form>
            )}
            <LinkButton href="/projects" variant="ghost">
              <ArrowLeft className="size-4" /> Overzicht
            </LinkButton>
          </div>
        }
      />

      <TabsRoot
        defaultTab="overzicht"
        ids={["overzicht", "betalingen", "uren", "documenten", "gegevens"]}
        className="flex flex-col"
      >
        <TabsBar
          className="order-2"
          tabs={[
            { id: "overzicht", label: "Overzicht", icon: <LayoutDashboard /> },
            { id: "betalingen", label: "Betalingen", icon: <Wallet /> },
            { id: "uren", label: "Uren & kosten", icon: <Clock /> },
            { id: "documenten", label: "Documenten", icon: <FileText />, badge: linkedDocs.length },
            { id: "gegevens", label: "Gegevens", icon: <Settings /> },
          ]}
        />

        {/* ── Tab: Gegevens — projectinstellingen (bewerken) ── */}
        <TabPanel id="gegevens" className="order-3">
          <Card className="mb-5">
            <CardHeader>
              <CardTitle>Projectgegevens</CardTitle>
              <span className="text-xs text-muted">naam, klant, planning en projectinstellingen</span>
            </CardHeader>
            <CardContent className="p-5">
              <form action={action} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Field
                label="Werf / adres-alias"
                htmlFor="siteAlias"
                hint="voor auto-herkenning van facturen (bv. Cap Negre) — komma-gescheiden"
              >
                <Input id="siteAlias" name="siteAlias" defaultValue={project.siteAlias ?? ""} placeholder="bv. Cap Negre" />
              </Field>
              <Field label="Begrote uren (optioneel)" htmlFor="budgetHours">
                <Input
                  id="budgetHours"
                  name="budgetHours"
                  inputMode="decimal"
                  defaultValue={project.budgetHours ? String(project.budgetHours).replace(".", ",") : ""}
                />
              </Field>
              <Field
                label="Marge op inkoop derden (%)"
                htmlFor="purchaseMarginPct"
                hint={`marge \u00f7 verkoopprijs \u2014 leeg = ${DEFAULT_PURCHASE_MARGIN_PCT}%`}
              >
                <Input
                  id="purchaseMarginPct"
                  name="purchaseMarginPct"
                  inputMode="decimal"
                  placeholder={String(DEFAULT_PURCHASE_MARGIN_PCT)}
                  defaultValue={project.purchaseMarginPct ? String(project.purchaseMarginPct).replace(".", ",") : ""}
                />
              </Field>
              <Field
                label="Marge op uren (%)"
                htmlFor="laborMarginPct"
                hint={`marge ÷ verkoopprijs — leeg = ${DEFAULT_LABOR_MARGIN_PCT}%`}
              >
                <Input
                  id="laborMarginPct"
                  name="laborMarginPct"
                  inputMode="decimal"
                  placeholder={String(DEFAULT_LABOR_MARGIN_PCT)}
                  defaultValue={project.laborMarginPct ? String(project.laborMarginPct).replace(".", ",") : ""}
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
              <Field label="Overeenkomst" htmlFor="contractDate" hint="datum van de aannemingsovereenkomst — komt in de voorschotbrief">
                <Input id="contractDate" name="contractDate" type="date" defaultValue={project.contractDate ?? ""} />
              </Field>
            </div>
            <Field label="Omschrijving" htmlFor="description">
              <Textarea id="description" name="description" rows={3} defaultValue={project.description ?? ""} />
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
        </TabPanel>

        {/* KPI-strip — de kerncijfers, altijd zichtbaar onder de tabbalk */}
        <div className="order-1 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label={contractPrice != null ? "Aanneemprijs" : targetIsImplicit ? "Doel" : "Offerte (doel)"}
            value={formatEUR(targetRevenue)}
            hint="ex. BTW"
            tone="info"
          />
          <StatTile label="Gefactureerd" value={formatEUR(projRevenue)} hint={`nog ${formatEUR(toInvoice)} te doen`} tone="neutral" />
          <StatTile
            label="Ontvangen"
            value={formatEUR(receivedTotalEx)}
            hint={`${paymentRows.length} ${paymentRows.length === 1 ? "betaling" : "betalingen"} · ${formatEUR(receivedTotal)} ontvangen${
              receivedTotal - receivedTotalEx > 0.01 ? `, waarvan ${formatEUR(receivedTotal - receivedTotalEx)} btw` : " · geen btw"
            }`}
            tone={receivedTotalEx > 0 ? "success" : "neutral"}
          />
          <StatTile label="Kosten" value={formatEUR(realizedCost)} hint="uren + inkoop derden + kostprijs eigen voorraad" tone="neutral" />
          {/* "Resultaat" las alsof het verdiend was, terwijl het een vooruitblik
              is: doel − kosten, dus alleen waar als de volle aanneemprijs ook
              echt gefactureerd wordt. Bij Silvestre is daarvan pas € 49.736,80
              gefactureerd, dus dat verschil moet je kunnen zien. */}
          <StatTile
            label="Verwacht resultaat"
            value={`${formatEUR(resultToDate)}${resultMarginPct != null ? ` · ${resultMarginPct}%` : ""}`}
            hint="als de volle aanneemprijs gefactureerd wordt"
            tone={resultTone}
          />
        </div>

        {/* ── Tab: Overzicht — geldstroom, resultaat, begroting ── */}
        <TabPanel id="overzicht" className="order-3">
      <Card id="geldstroom" className="mb-5 scroll-mt-24">
        <CardHeader>
          <CardTitle>Geldstroom dit project</CardTitle>
          <span className="text-xs text-muted">
            wat eruit ging · wat de klant al betaalde · wat er nog gefactureerd moet worden — incl. wat via Creadores liep
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Eruit gegaan (kasgeld)</p>
              <p className="text-lg font-semibold tabular-nums text-danger">− {formatEUR(cover.prefinanced)}</p>
              <p className="text-xs text-muted">uren {formatEUR(laborCost)} + inkoop derden {formatEUR(materialCost)} · ex. btw</p>
            </div>
            {/* Eigen voorraad apart: wel kostprijs, geen kasuitgave — telt dus
                niet mee in "eruit gegaan" en niet in de voorschotdekking. */}
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Eigen voorraad (kostprijs)</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(ownProductCostRealized)}</p>
              <p className="text-xs text-muted">uit eigen voorraad geleverd · geen kasuitgave, telt niet mee in de dekking</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Ontvangen van klant</p>
              <p className="text-lg font-semibold tabular-nums text-success">+ {formatEUR(receivedTotalEx)}</p>
              <p className="text-xs text-muted">
                {paymentRows.length} {paymentRows.length === 1 ? "betaling" : "betalingen"} · ex. btw van{" "}
                {formatEUR(receivedTotal)} ontvangen
                {receivedTotalEx - dekkingOntvangenEx > 0.01
                  ? ` · waarvan ${formatEUR(receivedTotalEx - dekkingOntvangenEx)} voor eigen producten`
                  : ""}
              </p>
            </div>
            {/* Het stoplicht: dekt wat er binnen is de kasuitgaven (uren + inkoop
                derden)? Eigen voorraad staat hier bewust buiten. */}
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Voorschotdekking</p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  cover.tone === "success" ? "text-success" : cover.tone === "warning" ? "text-warning" : "text-danger"
                }`}
              >
                {cover.saldo < 0 ? `− ${formatEUR(-cover.saldo)}` : formatEUR(cover.saldo)}
              </p>
              <p className="text-xs text-muted">
                {cover.status === "gedekt"
                  ? "gedekt door voorschotten en betalingen · ex. btw"
                  : cover.status === "bijna_op"
                    ? "bijna op — nieuw voorschot voorbereiden · ex. btw"
                    : "zelf voorgeschoten · ex. btw"}
                {cover.status !== "gedekt" && (
                  <>
                    {" · "}
                    <Link href="#voorschot-opvragen" className="underline underline-offset-2">
                      nieuw voorschot vragen →
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Nog te factureren</p>
              <p className={`text-lg font-semibold tabular-nums ${toInvoice > 0 ? "text-warning" : ""}`}>{formatEUR(toInvoice)}</p>
              <p className="text-xs text-muted">
                {contractPrice != null ? "aanneemprijs" : "doel"} {formatEUR(targetRevenue)} − gefactureerd {formatEUR(projRevenue)}
                {notInvoicedAdvancesEx > 0 ? ` − voorschotten ${formatEUR(notInvoicedAdvancesEx)}` : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────── Resultaat (P&L) ─────────────── */}
      <Card id="resultaat" className="mb-5 scroll-mt-24">
        <CardHeader>
          <CardTitle>Resultaat — zitten we goed?</CardTitle>
          <span className="text-xs text-muted">
            norm: minimaal {MIN_MARGIN_PCT}% marge van de verkoopprijs (= kostprijs ÷ {(1 - MIN_MARGIN_PCT / 100).toFixed(2).replace(".", ",")}) · alle bedragen ex. BTW
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Doel (omzet)</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(targetRevenue)}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Max. kosten ({MIN_MARGIN_PCT}% marge)</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(maxCost)}</p>
              <p className="text-xs text-muted">kostenplafond</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Kosten tot nu toe</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatEUR(realizedCost)}
                {budgetCostTotal > 0 && (
                  <span className={`ml-2 text-xs font-normal ${realizedCost > budgetCostTotal ? "text-danger" : "text-success"}`}>
                    {realizedCost > budgetCostTotal ? "▲ boven" : "▼ onder"} begroting
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Ruimte tot plafond</p>
              <p className={`text-lg font-semibold tabular-nums ${costHeadroom < 0 ? "text-danger" : "text-success"}`}>
                {costHeadroom < 0 ? `− ${formatEUR(Math.abs(costHeadroom))}` : formatEUR(costHeadroom)}
              </p>
              <p className="text-xs text-muted">{costHeadroom < 0 ? "boven plafond" : "kosten mogen er nog bij"}</p>
            </div>
          </div>
          <div className={`rounded-lg p-3 text-sm ${resultTone === "danger" ? "bg-danger/10 text-danger" : resultTone === "warning" ? "bg-warning/10 text-warning" : resultTone === "neutral" ? "bg-background text-muted" : "bg-success/10 text-success"}`}>
            <span className="font-semibold">
              {resultTone === "danger"
                ? "⚠ Let op — verlies"
                : resultTone === "warning"
                  ? `⚠ Onder de norm — minder dan ${MIN_MARGIN_PCT}% marge`
                  : resultTone === "neutral"
                    ? "Nog geen doel ingesteld"
                    : `✓ Op koers — ${MIN_MARGIN_PCT}%+ marge`}
            </span>{" "}
            Resultaat tot nu toe {formatEUR(resultToDate)}
            {resultMarginPct != null ? ` (${resultMarginPct}% marge)` : ""} ·{" "}
            kosten zijn {costRatio != null ? `${Math.round(costRatio * 100)}%` : "—"} van het doel
            {costHeadroom < 0 ? ` · ${formatEUR(Math.abs(costHeadroom))} boven het ${MIN_MARGIN_PCT}%-plafond` : ` · nog ${formatEUR(costHeadroom)} ruimte tot het plafond`}.
          </div>

          {/* Drie stromen apart: uren (norm), eigen producten (gemeten), inkoop (kost). */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">Uren \u2014 arbeid</p>
                <span className="text-xs text-muted">norm {margins.laborMarginPct}%</span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Kostprijs</dt>
                  <dd className="tabular-nums">{formatEUR(margins.laborCost)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Door te belasten</dt>
                  <dd className="tabular-nums">{formatEUR(margins.laborRevenue)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                  <dt>Marge op uren</dt>
                  <dd className="tabular-nums text-success">
                    {formatEUR(margins.laborMargin)}
                    <span className="ml-1 text-xs font-normal text-muted">{margins.laborMarginPct}%</span>
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">
                {laborHours.toLocaleString("nl-NL")} uur \u00b7 norm, geen gemeten verkoopprijs per uur
              </p>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">Eigen producten</p>
                {margins.productMarginPct != null && (
                  <span className={`text-xs ${margins.productMarginPct < MIN_MARGIN_PCT ? "text-warning" : "text-muted"}`}>
                    {margins.productMarginPct.toFixed(1).replace(".", ",")}%
                  </span>
                )}
              </div>
              {margins.productRevenue > 0 ? (
                <>
                  <dl className="space-y-1 text-sm">
                    {/* Kostprijs bovenaan, net als bij Uren en Inkoop derden:
                        overal eerst wat het ons kost, daaronder wat het opbrengt. */}
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Kostprijs</dt>
                      <dd className="tabular-nums">{formatEUR(margins.productCost)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Gefactureerd</dt>
                      <dd className="tabular-nums">{formatEUR(margins.productRevenue)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                      <dt>Marge op producten</dt>
                      <dd className={`tabular-nums ${margins.productMargin < 0 ? "text-danger" : "text-success"}`}>
                        {formatEUR(margins.productMargin)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    gemeten uit de factuurregels
                    {margins.uncostedProductRevenue > 0
                      ? ` \u00b7 ${formatEUR(margins.uncostedProductRevenue)} zonder kostprijs, niet meegeteld`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Nog niets van onszelf gefactureerd op dit project.
                  {margins.uncostedProductRevenue > 0
                    ? ` ${formatEUR(margins.uncostedProductRevenue)} gefactureerd zonder kostprijs \u2014 vul die op de regels in om de marge te zien.`
                    : ""}
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-background p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">Inkoop derden</p>
                <span className="text-xs text-muted">norm {margins.purchaseMarginPct}%</span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Kostprijs</dt>
                  <dd className="tabular-nums">{formatEUR(margins.purchaseCost)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Door te belasten</dt>
                  <dd className="tabular-nums">{formatEUR(margins.purchaseRevenue)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                  <dt>Marge op inkoop</dt>
                  <dd className="tabular-nums text-success">
                    {formatEUR(margins.purchaseMargin)}
                    <span className="ml-1 text-xs font-normal text-muted">{margins.purchaseMarginPct}%</span>
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">
                inkooporders {formatEUR(poCost)} + losse kosten {formatEUR(looseCost)}
              </p>
            </div>
          </div>

          {/* Wat de klus tot nu toe minimaal moet opbrengen om alle drie de marges te halen. */}
          {margins.totalRevenue > 0 && (
            <div className="rounded-lg border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">Minimaal door te belasten tot nu toe</span>
                <span className="tabular-nums font-semibold">{formatEUR(margins.totalRevenue)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                uren {formatEUR(margins.laborRevenue)} + inkoop {formatEUR(margins.purchaseRevenue)} + eigen producten{" "}
                {formatEUR(margins.productRevenue)} \u00b7 samen {formatEUR(margins.totalMargin)} marge
                {targetRevenue > 0
                  ? margins.totalRevenue > targetRevenue
                    ? ` \u00b7 \u26a0 dat is ${formatEUR(margins.totalRevenue - targetRevenue)} MEER dan de aanneemprijs van ${formatEUR(targetRevenue)}`
                    : ` \u00b7 past binnen de aanneemprijs van ${formatEUR(targetRevenue)} (nog ${formatEUR(targetRevenue - margins.totalRevenue)} ruimte)`
                  : ""}
              </p>
            </div>
          )}

          {/* De vraag die "minimaal door te belasten" oproept: er is al
              gefactureerd en er is al voorgeschoten — wat moet er dan NU nog uit? */}
          {margins.totalRevenue > 0 && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
              <p className="mb-2 font-semibold">Wat moet er nu nog binnenkomen?</p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">
                    Minimaal door te belasten tot nu toe
                    <span className="block text-xs">alle bedragen hier zijn ex. btw</span>
                  </dt>
                  <dd className="tabular-nums">{formatEUR(margins.totalRevenue)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">
                    Al ontvangen
                    <span className="block text-xs">
                      {/* Gefactureerd is géén geld: een verstuurde factuur kan onbetaald
                          zijn. Daarom telt hier wat er ECHT binnen is — betalingen op
                          facturen én voorschotten. */}
                      alle betalingen samen, of ze nu op een factuur kwamen of als voorschot
                    </span>
                  </dt>
                  <dd className="tabular-nums">− {formatEUR(receivedTotalEx)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                  <dt>Nog te ontvangen</dt>
                  <dd className="tabular-nums">{formatEUR(margins.totalRevenue - receivedTotalEx)}</dd>
                </div>
                {openInvoicedEx > 0.01 && (
                  <div className="flex justify-between gap-2 pt-1">
                    <dt className="text-muted">
                      waarvan al gefactureerd, nog niet betaald
                      <span className="block text-xs">openstaande facturen</span>
                    </dt>
                    <dd className="tabular-nums text-warning">{formatEUR(openInvoicedEx)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">nog te factureren</dt>
                  <dd className="tabular-nums">
                    {formatEUR(Math.max(0, margins.totalRevenue - receivedTotalEx - openInvoicedEx))}
                  </dd>
                </div>
              </dl>
              {voorschottenOnverrekendEx > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Op de eindafrekening moet er méér op papier dan er nog binnenkomt:{" "}
                  <strong>{formatEUR(Math.max(0, margins.totalRevenue - projRevenue))}</strong>, want de{" "}
                  {formatEUR(voorschottenOnverrekendEx)} aan voorschotten is wél betaald maar nooit gefactureerd. Die
                  gaat er als verrekening weer af, en de btw over het hele werk wordt dan in één keer afgerekend.
                </p>
              )}
              <form action={createFinalSettlement.bind(null, id)} className="mt-3 space-y-2">
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" name="bundel" className="mt-0.5" />
                  <span>
                    Voorschotten op één regel samenvatten
                    <span className="block text-muted">
                      dan staat er &quot;Reeds ontvangen voorschotten&quot; in plaats van elke betaling apart — de
                      bedragen blijven volledig op de factuur staan
                    </span>
                  </span>
                </label>
                <SubmitButton size="sm" variant="secondary" pendingLabel="Opstellen…">
                  Eindafrekening opstellen
                </SubmitButton>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────── Voortgang per bouwfase ─────────────── */}
      {(() => {
        // Fases uit projectPhases; oudere projecten met alleen budgetregels
        // krijgen de fases daaruit (voortgang 0 — eerste klik maakt de fase aan).
        const bekend = new Set(phaseRows.map((f) => f.name));
        const uitBudget = [...new Set(budgetRows.map((b) => (b.phase ?? "").trim()).filter(Boolean))]
          .filter((naam) => !bekend.has(naam))
          .map((naam) => ({ id: null as string | null, name: naam, progressPct: 0 }));
        const fases = [
          ...phaseRows.map((f) => ({ id: f.id as string | null, name: f.name, progressPct: f.progressPct })),
          ...uitBudget,
        ];
        if (fases.length === 0) return null;
        const gewichtVan = (naam: string) =>
          budgetRows.filter((b) => (b.phase ?? "").trim() === naam).reduce((s, b) => s + Number(b.amountEur ?? 0), 0);
        const gewichten = fases.map((f) => gewichtVan(f.name));
        const totGewicht = gewichten.reduce((s, g) => s + g, 0);
        const totaalPct = Math.round(
          totGewicht > 0
            ? fases.reduce((s, f, i) => s + f.progressPct * gewichten[i], 0) / totGewicht
            : fases.reduce((s, f) => s + f.progressPct, 0) / fases.length,
        );
        const gereed = fases.filter((f) => f.progressPct >= 100).length;
        return (
          <Card className="mb-5">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Voortgang</CardTitle>
                  <span className="text-xs text-muted">
                    {totaalPct}% van het werk gereed{totGewicht > 0 ? " (gewogen naar begrote waarde)" : ""} · {gereed} van{" "}
                    {fases.length} fases afgerond
                  </span>
                </div>
                <LinkButton href={`/projects/${id}/voortgang/pdf`} target="_blank" variant="secondary">
                  <Printer className="size-4" /> Voortgang-PDF voor de klant
                </LinkButton>
              </div>
              {/* Totaalbalk */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                <div className="h-2 rounded-full bg-success transition-all" style={{ width: `${totaalPct}%` }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {fases.map((f, i) => (
                <form
                  key={f.name}
                  action={setPhaseProgress.bind(null, id, f.name, f.progressPct)}
                  className="grid items-center gap-2 sm:grid-cols-[1.4fr_2fr_auto]"
                >
                  <span className={`text-sm ${f.progressPct >= 100 ? "text-muted line-through decoration-success/60" : "font-medium"}`}>
                    {f.progressPct >= 100 && <Check className="mr-1 inline size-3.5 text-success" />}
                    {f.name}
                    {gewichten[i] > 0 && (
                      <span className="ml-2 text-xs font-normal tabular-nums text-muted">
                        {formatEUR(gewichten[i])}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                      <div className="h-2 rounded-full bg-success transition-all" style={{ width: `${f.progressPct}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted">{f.progressPct}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[0, 25, 50, 75].map((p) => (
                      <button
                        key={p}
                        formAction={setPhaseProgress.bind(null, id, f.name, p)}
                        className={`rounded border px-1.5 py-0.5 text-[11px] tabular-nums hover:bg-background ${f.progressPct === p ? "border-success font-semibold" : "text-muted"}`}
                        title={`Zet op ${p}%`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      formAction={setPhaseProgress.bind(null, id, f.name, 100)}
                      className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-background ${f.progressPct >= 100 ? "border-success font-semibold text-success" : "text-muted"}`}
                      title="Fase afvinken (100%)"
                    >
                      ✓ klaar
                    </button>
                  </div>
                </form>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* ─────────────── Begroting (eigen scherm) ─────────────── */}
      <Card className="mb-5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Begroting</CardTitle>
              <span className="text-xs text-muted">
                {hasBudgetContent
                  ? `${phaseRows.length} ${phaseRows.length === 1 ? "fase" : "fases"}${budgetLineCount > 0 ? ` · ${budgetLineCount} ${budgetLineCount === 1 ? "onderdeel" : "onderdelen"}` : ""}${budgetTargetTotal > 0 ? ` · totaal ${formatEUR(budgetTargetTotal)}${begrootMargePct != null ? ` · marge ${begrootMargePct}%` : ""}` : " · uitleg/bestek"}`
                  : "nog geen begroting — bouw 'm per fase op een eigen scherm"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href={`/projects/${id}/begroting`} variant={hasBudgetContent ? "secondary" : "primary"}>
                {hasBudgetContent ? "Begroting openen" : "+ Begroting maken"}
              </LinkButton>
              {hasBudgetContent && (
                <>
                  <LinkButton href={`/projects/${id}/begroting/pdf`} target="_blank" variant="secondary">
                    <Printer className="size-4" /> Printen
                  </LinkButton>
                  <form action={sendBudgetToClient.bind(null, id)}>
                    <SubmitButton variant="secondary" pendingLabel="Versturen…">
                      <Send className="size-4" /> Versturen naar klant
                    </SubmitButton>
                  </form>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

        </TabPanel>

        {/* ── Tab: Betalingen — aanbetalingen + ontvangen ── */}
        <TabPanel id="betalingen" className="order-3">
      {advanceDocs.length > 0 && (
        <Card id="aanbetalingen" className="mb-5 scroll-mt-24">
          <CardHeader>
            <CardTitle>Aanbetalingen / voorschotten</CardTitle>
            <span className="text-xs text-muted">
              {formatEUR(advPaidTotal)} betaald · {formatEUR(advOpenToSettle)} nog te verrekenen op de eindfactuur
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <tr>
                  <Th>Voorschot</Th>
                  <Th>Bedrag</Th>
                  <Th>BTW</Th>
                  <Th>Status</Th>
                  <Th>Verrekend</Th>
                </tr>
              </THead>
              <TBody>
                {advanceDocs.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Link href={`/documents/${a.id}`} className="font-medium hover:underline">
                        {a.docNumber ?? "—"}
                      </Link>
                      <span className="block text-xs text-muted">
                        {a.kind === "proforma" ? "proforma" : a.kind === "fondos" ? "provisión de fondos" : "factuur"}
                      </span>
                    </Td>
                    <Td className="tabular-nums">{formatEUR(Number(a.totalEur ?? 0))}</Td>
                    <Td>{a.kind === "fondos" ? "geen btw" : a.vatReverseCharge ? "verlegd" : "met btw"}</Td>
                    <Td>
                      <Badge tone={a.status === "paid" ? "success" : "neutral"}>
                        {a.status === "paid" ? "Betaald" : a.status === "sent" ? "Verstuurd" : "Concept"}
                      </Badge>
                    </Td>
                    <Td>
                      {a.settledAt ? (
                        <Badge tone="neutral">Verrekend</Badge>
                      ) : a.status === "paid" ? (
                        <span className="text-xs text-warning">nog openstaand</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AdvanceRequestCard
        projectId={id}
        projectName={project.name}
        siteAlias={project.siteAlias}
        contactId={project.contactId}
        contractDate={project.contractDate}
        cover={cover}
        laborCost={laborCost}
        purchaseCost={materialCost}
        ownProductCost={ownProductCostRealized}
        aanneemsom={targetRevenue}
        doorTeBelasten={margins.totalRevenue}
        params={voorschotParams}
      />

      {/* ─────────────── Ontvangen betalingen (van klant) ─────────────── */}
      <Card id="ontvangen" className="mb-5 scroll-mt-24">
        <CardHeader>
          <CardTitle>Ontvangen betalingen</CardTitle>
          <span className="text-xs text-muted">
            wat de klant al heeft betaald · {formatEUR(receivedTotal)} ontvangen, waarvan {formatEUR(receivedTotalEx)} ex.
            btw (contant = geen btw, factuurbetalingen volgen hun eigen factuur) · betaalde facturen komen er automatisch
            bij · telt niet mee in omzet/marge
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentRows.length > 0 && (
            <Table>
              <THead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Omschrijving</Th>
                  <Th>Wijze</Th>
                  <Th className="text-right">Bedrag</Th>
                  <Th className="text-right">waarvan ex. btw</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {paymentRows.map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap">
                      {p.date ? new Date(p.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </Td>
                    <Td>
                      {p.documentId ? (
                        <Link href={`/documents/${p.documentId}`} className="hover:underline">
                          {p.description ?? p.docNumber ?? "—"}
                        </Link>
                      ) : (
                        (p.description ?? "—")
                      )}
                      {p.note ? <span className="block text-xs text-muted">{p.note}</span> : null}
                    </Td>
                    <Td>
                      <Badge tone={p.method === "cash" ? "warning" : p.method === "advance" ? "info" : "neutral"}>
                        {RECEIVED_METHOD_LABEL[p.method] ?? p.method}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums font-medium">{formatEUR(p.amountEur)}</Td>
                    <Td className="text-right tabular-nums text-muted">
                      {formatEUR(exBtwVanOntvangst(p))}
                      {p.vatAmountEur != null ? (
                        <span className="block text-xs">{formatEUR(Number(p.vatAmountEur))} btw</span>
                      ) : p.vatRate != null ? (
                        <span className="block text-xs">{Number(p.vatRate) === 0 ? "geen btw" : `${Number(p.vatRate)}% btw`}</span>
                      ) : p.method === "cash" ? (
                        <span className="block text-xs">geen btw</span>
                      ) : null}
                    </Td>
                    <Td className="text-right">
                      {/* Een ontvangst die uit een betaalde factuur komt kun je hier
                          niet weghalen — hij komt terug bij de volgende synchronisatie.
                          Zet de factuur terug op verstuurd als het niet klopt. */}
                      {p.documentId ? (
                        <span className="text-xs text-muted">via factuur</span>
                      ) : (
                        <form action={deleteProjectPayment.bind(null, id, p.id)}>
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                        </form>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          <form action={addProjectPayment.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.9fr_1.3fr_1.1fr_0.9fr_0.7fr_0.9fr_auto] lg:items-end">
            <Field label="Datum">
              <Input name="date" type="date" />
            </Field>
            <Field label="Omschrijving">
              <Input name="description" placeholder="bijv. factuur F26009 / voorschot" />
            </Field>
            {/* Deelbetaling op een voorschotverzoek: dan loopt de stand
                "nog open" bij Voorschot opvragen mee. */}
            <Field label="Hoort bij" hint={openAdvanceRequests.length ? "voorschotverzoek" : "geen open verzoek"}>
              <Select name="advanceRequestId" defaultValue="" disabled={openAdvanceRequests.length === 0}>
                <option value="">— los —</option>
                {openAdvanceRequests.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wijze">
              <Select name="method" defaultValue="bank">
                <option value="bank">Bankoverschrijving</option>
                <option value="cash">Contant</option>
                <option value="invoice">Via factuur</option>
                <option value="advance">Voorschot</option>
                <option value="other">Overig</option>
              </Select>
            </Field>
            <Field label="BTW" hint="leeg = systeem beslist">
              <Select name="vatRate" defaultValue="">
                <option value="">automatisch</option>
                <option value="0">geen btw</option>
                <option value="21">21%</option>
                <option value="10">10%</option>
              </Select>
            </Field>
            <Field label="Bedrag (€)">
              <Input name="amountEur" inputMode="decimal" required placeholder="0,00" />
            </Field>
            <Field label="BTW-bedrag (€)" hint="bij gemengde tarieven">
              <Input name="vatAmountEur" inputMode="decimal" className="text-right" placeholder="—" />
            </Field>
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Betaling</SubmitButton>
          </form>
        </CardContent>
      </Card>

        </TabPanel>

        {/* ── Tab: Uren & kosten ── */}
        <TabPanel id="uren" className="order-3">
        <div className="grid gap-5">
          <ProjectDeliveriesCard
            projectId={id}
            voorschottenEx={voorschottenOnverrekendEx}
            fout={voorschotParams.lev}
          />
          <ProjectExtrasCard projectId={id} />
          {/* Uren */}
          <Card id="uren" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>Uren — arbeid</CardTitle>
              <span className="text-xs text-muted">
                {laborHours.toLocaleString("nl-NL")} uur · {formatEUR(laborCost)} kosten
                {project.budgetHours ? ` · begroot ${Number(project.budgetHours).toLocaleString("nl-NL")} u` : ""}
                {laborCost > 0
                  ? ` · door te belasten ${formatEUR(margins.laborRevenue)} — ${margins.laborMarginPct}% marge op de verkoopprijs = ${formatEUR(margins.laborMargin)} (oftewel ${opslagPct(margins.laborMarginPct)}% bovenop de kostprijs)`
                  : ""}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingTimeRows.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm">
                  <span>
                    ⏱ <strong>{pendingTimeRows.length}</strong> portaal-regel{pendingTimeRows.length === 1 ? "" : "s"} (
                    {pendingHours.toLocaleString("nl-NL")} uur) te controleren — tellen nog niet mee in de kosten.
                  </span>
                  <form action={approveAllPendingTimeEntries.bind(null, id)}>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                      Alles goedkeuren
                    </SubmitButton>
                  </form>
                </div>
              )}
              {timeRows.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>Arbeider</Th>
                      <Th className="text-right">Uren</Th>
                      <Th className="text-right">Tarief</Th>
                      <Th className="text-right">Kosten</Th>
                      <Th />
                    </tr>
                  </THead>
                  <TBody>
                    {timeRows.map((t) => {
                      if (t.id === editEntryId) {
                        // Bewerk-modus: hele regel als één formulier (datum/uren/tarief).
                        return (
                          <Tr key={t.id} className="bg-amber-50/50">
                            <Td colSpan={6} className="p-3">
                              <form action={updateTimeEntry.bind(null, id, t.id)} className="flex flex-wrap items-end gap-3">
                                <input type="hidden" name="note" defaultValue={t.note ?? ""} />
                                <div className="text-sm">
                                  <span className="block text-xs text-muted">Arbeider</span>
                                  <span className="font-medium">{t.workerName ?? "—"}</span>
                                </div>
                                <Field label="Datum">
                                  <Input type="date" name="date" defaultValue={String(t.date).slice(0, 10)} />
                                </Field>
                                <Field label="Uren">
                                  <Input name="hours" defaultValue={moneyForInput(t.hours)} inputMode="decimal" className="w-24 text-right tabular-nums" />
                                </Field>
                                <Field label="Tarief (€/u)">
                                  {/* Zonder opschonen staat hier "3800.000000" — en dat
                                      werd bij opslaan 3,8 miljard. Zie lib/parse-money.ts. */}
                                  <Input name="hourlyCostEur" defaultValue={moneyForInput(t.hourlyCostEur)} inputMode="decimal" className="w-24 text-right tabular-nums" />
                                </Field>
                                <SubmitButton size="sm" variant="secondary" pendingLabel="…">Opslaan</SubmitButton>
                                <Link href={`/projects/${id}#uren`} className="px-2 py-2 text-xs text-muted hover:underline">
                                  Annuleer
                                </Link>
                                <p className="w-full text-xs text-muted">Kosten = uren × tarief — wordt na opslaan herberekend.</p>
                              </form>
                            </Td>
                          </Tr>
                        );
                      }
                      const pending = isPendingEntry(t);
                      return (
                        <Tr key={t.id} className={pending ? "bg-amber-50/60" : undefined}>
                          <Td className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</Td>
                          <Td>
                            {t.workerName ?? "—"}
                            {pending && <Badge tone="warning" className="ml-2">te controleren</Badge>}
                            {t.note ? <span className="block text-xs text-muted">{t.note}</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums">{Number(t.hours).toLocaleString("nl-NL")}</Td>
                          <Td className="text-right tabular-nums text-muted">{formatEUR(t.hourlyCostEur)}</Td>
                          <Td className="text-right tabular-nums font-medium">{formatEUR(Number(t.hours) * Number(t.hourlyCostEur))}</Td>
                          <Td className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {pending && (
                                <form action={approveTimeEntry.bind(null, id, t.id)}>
                                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                                    Goedkeuren
                                  </SubmitButton>
                                </form>
                              )}
                              <Link href={`/projects/${id}?edit=${t.id}#uren`} title="Bewerk" className="rounded px-1.5 py-1 text-muted hover:bg-muted/50">
                                ✎
                              </Link>
                              <form action={deleteTimeEntry.bind(null, id, t.id)}>
                                <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                              </form>
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              )}
              {workerRows.length === 0 ? (
                <p className="text-sm text-muted">
                  Voeg eerst arbeiders toe in <Link href="/ploeg" className="text-accent hover:underline">Ploeg</Link>.
                </p>
              ) : (
                <TimeEntryForm workers={workerOptions} action={addTimeEntry.bind(null, id)} />
              )}

              {/* Urenportaal: verwijs een arbeider/ploegbaas naar dit project — hij
                  krijgt een persoonlijke link en kan alleen hier uren invullen. */}
              <div className="mt-5 border-t pt-4">
                <p className="mb-2 text-sm font-medium">
                  Urenportaal{" "}
                  <span className="font-normal text-muted">
                    — persoonlijke invul-link per arbeider, alleen voor dit project (deel via WhatsApp)
                  </span>
                </p>
                {portalLinkRows.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {portalLinkRows.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-28">{l.workerName}</span>
                        <CopyLinkButton url={`${portalBase}/${l.token}`} />
                        <form action={deleteWorkerPortalLink.bind(null, id, l.id)}>
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                            Intrekken
                          </SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                {unlinkedWorkers.length > 0 ? (
                  <form action={createWorkerPortalLink.bind(null, id)} className="flex flex-wrap items-end gap-2">
                    <Field label="Arbeider / ploegbaas">
                      <Combobox
                        name="workerId"
                        placeholder="Zoek een arbeider…"
                        options={unlinkedWorkers.map((w) => ({
                          value: w.id,
                          label: w.name,
                          hint: w.role ?? undefined,
                        }))}
                      />
                    </Field>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                      + Link aanmaken
                    </SubmitButton>
                  </form>
                ) : (
                  portalLinkRows.length === 0 && (
                    <p className="text-sm text-muted">
                      Voeg eerst arbeiders toe in{" "}
                      <Link href="/ploeg" className="text-accent hover:underline">Ploeg</Link>.
                    </p>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          {/* Kosten & inkoop */}
          <Card id="kosten" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>Kosten &amp; inkoop</CardTitle>
              <span className="text-xs text-muted">
                gekoppelde inkoop {formatEUR(poCost)} + losse kosten {formatEUR(looseCost)} = {formatEUR(materialCost)}
                {" · alle bedragen ex. btw"}
                {` · door te belasten ${formatEUR(margins.purchaseRevenue)} — ${margins.purchaseMarginPct}% marge op de verkoopprijs = ${formatEUR(margins.purchaseMargin)} (oftewel ${opslagPct(margins.purchaseMarginPct)}% bovenop de kostprijs)`}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkedPOs.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Gekoppelde inkooporders</p>
                  <Table>
                    <TBody>
                      {linkedPOs.map((p) => {
                        // Uren-PO's worden als arbeid geboekt MET de 21%-aanname als de btw
                        // ontbreekt; toon hier dus hetzelfde bedrag als wat er meetelt.
                        const ex = p.countAsLabor
                          ? (() => {
                              const a = poExVatAssumingSpanishVat(p);
                              return { amount: a.amount, vatUnknown: false, vatAssumed: a.vatAssumed };
                            })()
                          : { ...poExVat(p), vatAssumed: false };
                        return (
                        <Tr key={p.id}>
                          <Td>
                            <Link href={`/inkooporders/${p.id}`} className="text-accent hover:underline">{p.supplier}</Link>
                            {p.reference ? <span className="ml-1 text-xs text-muted">{p.reference}</span> : null}
                            {p.countAsLabor ? <span className="ml-1 text-xs text-muted">· telt als uren</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatEUR(ex.amount)}
                            {ex.vatUnknown ? (
                              <Link
                                href={`/inkooporders/${p.id}/edit`}
                                className="ml-1 cursor-help text-xs text-warning"
                                title="Op deze inkooporder staat geen btw/subtotaal — dit bedrag is het factuurtotaal en zit er dus mogelijk incl. btw in. Vul het subtotaal (ex. btw) in."
                              >
                                btw?
                              </Link>
                            ) : ex.vatAssumed ? (
                              <Link
                                href={`/inkooporders/${p.id}/edit`}
                                className="ml-1 cursor-help text-xs text-muted"
                                title={`Geen btw uitgelezen — ex. btw afgeleid van het factuurtotaal ${formatEUR(p.total)} met 21% aangenomen, net als bij de urenboeking. Vul het echte subtotaal in om de aanname te vervangen.`}
                              >
                                21%?
                              </Link>
                            ) : null}
                          </Td>
                          <Td className="text-right">
                            <form action={unlinkPurchaseOrder.bind(null, id, p.id)}>
                              <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">ontkoppel</SubmitButton>
                            </form>
                          </Td>
                        </Tr>
                        );
                      })}
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
              <form action={addProjectCost.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.9fr_1fr_1.6fr_0.9fr_0.9fr_0.9fr_auto] lg:items-end">
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
                <Field label="Doorbelast (€)" hint="klantprijs ex. btw — leeg = kost + marge">
                  <Input name="chargeEur" inputMode="decimal" placeholder="auto" />
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
                    <Combobox
                      name="purchaseOrderId"
                      clearable
                      placeholder="— kies of zoek een inkooporder —"
                      options={unlinkedPOs.map((p) => ({
                        value: p.id,
                        label: `${p.supplier}${p.reference ? ` · ${p.reference}` : ""} — ${formatEUR(poExVatAmount(p))} ex. btw`,
                      }))}
                    />
                  </Field>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">Koppelen</SubmitButton>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
        </TabPanel>

        {/* ── Gegevens-tab (vervolg): metadata ── */}
        <TabPanel id="gegevens" className="order-3">
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

          {project.contactId && (
            <Card className="mt-5">
              <CardHeader>
                <CardTitle>Klantportaal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted">
                  De klant volgt op <span className="font-mono text-xs">/klant</span> de voortgang en betalingen
                  (alleen klantprijzen) en kan er zelf ontbrekende gegevens aanvullen (adres, NIF/NIE, telefoon).
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={stuurKlantportaalUitnodiging.bind(null, id, false)}>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Versturen…">
                      ✉️ Portaal-uitnodiging mailen
                    </SubmitButton>
                  </form>
                  <form action={stuurKlantportaalUitnodiging.bind(null, id, true)}>
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Versturen…" title="Stuurt de uitnodiging naar jouw eigen mailadres; de knop logt in als de klant zodat je ziet wat die ziet.">
                      🧪 Testversie naar mijzelf
                    </SubmitButton>
                  </form>
                </div>
              </CardContent>
            </Card>
          )}
        </TabPanel>

        {/* ── Tab: Documenten — facturen, offertes, producten ── */}
        <TabPanel id="documenten" className="order-3">
          <Card id="documenten" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>Documenten in dit project</CardTitle>
              <span className="text-xs text-muted">{linkedDocs.length}</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {invoiceDocs.length > 0 && margins.productRevenue > 0 && (
                <div className="rounded-md bg-background px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Marge op eigen producten (gefactureerd)</span>
                    <span
                      className={`tabular-nums font-medium ${margins.productMargin < 0 ? "text-danger" : "text-foreground"}`}
                    >
                      {formatEUR(margins.productMargin)}
                      {margins.productMarginPct != null
                        ? ` · ${margins.productMarginPct.toFixed(1).replace(".", ",")}%`
                        : ""}
                    </span>
                  </div>
                  {margins.uncostedProductRevenue > 0 && (
                    <p className="mt-1 text-muted">
                      {formatEUR(margins.uncostedProductRevenue)} gefactureerd zonder kostprijs (bv. een
                      aanbetaling) — niet meegeteld, anders zou dat als 100% marge tellen.
                    </p>
                  )}
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
                  href={`/documents/new?kind=fondos&projectId=${id}${project.contactId ? `&contactId=${project.contactId}` : ""}${project.propertyId ? `&propertyId=${project.propertyId}` : ""}`}
                  variant="ghost"
                  className="text-xs"
                  title="Voorschotdocument zonder btw voor particulieren/buitenlandse klanten — eerst langs Paco"
                >
                  + Provisión de fondos
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
                  <Combobox
                    name="documentId"
                    className="flex-1"
                    placeholder="Zoek een bestaande factuur/offerte om te koppelen…"
                    options={unlinkedDocs.map((d) => {
                      const k = d.kind === "invoice" ? "Factuur" : d.kind === "estimate" ? "Offerte" : "Creditnota";
                      return {
                        value: d.id,
                        label: `${k} ${d.docNumber ?? "(geen nr.)"}${d.title ? ` — ${d.title}` : ""} · € ${Number(d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      };
                    })}
                  />
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
                            € {Number(d.subtotalEur ?? d.totalEur ?? 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            ex. btw
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
        </TabPanel>
      </TabsRoot>
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
