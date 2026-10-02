import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LinkButton,
  PageHeader,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { brands, companies, deliveries, documents, holdedSyncMap, products } from "@/lib/db/schema";
import { SubmitButton } from "@/components/submit-button";
import { lineCostEur, lineNet, lineTax, normalizeDocItems } from "@/lib/documents";
import { missingBillingFields } from "@/lib/invoice-validation";
import { labelForCategory } from "@/lib/products";
import { HOOFDSTUKKEN } from "@/lib/price-book";
import { formatDate, formatEUR } from "@/lib/utils";
import {
  applyStockOutFromDocument,
  attachDocumentFiles,
  createAdjustedInvoiceForRemainder,
  createCreditNoteFromInvoice,
  createDeliveryNoteFromDocument,
  createInvoiceFromEstimate,
  createInvoiceFromProforma,
  deleteDocument,
  deleteDocumentAttachment,
  markDocumentSentNoEmail,
  pushDocumentToHoldedAction,
  updateDocumentInHoldedAction,
  reverseStockOutFromDocument,
  setDeliveryNoteDelivered,
  setDocumentStatus,
  signDocumentUploadAction,
  toggleContractRequired,
  toggleReserveEstimate,
  unlockDocument,
} from "../actions";
import { markPickedUp, undoPickedUp } from "../../leveringen/actions";
import { documentFileUrl } from "@/lib/storage";
import { documentKindMeta, documentStatusMeta } from "../../_meta";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { DocumentAttachmentsUploader } from "@/components/document-attachments-uploader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { docNumber: true, kind: true, title: true },
  });
  return {
    title: doc ? `${documentKindMeta[doc.kind]} ${doc.docNumber ?? ""}`.trim() : "Document",
  };
}

const STATUS_OPTIONS = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const { id } = await params;
  const sp = await searchParams;
  const pakbonId = typeof sp.pakbon === "string" ? sp.pakbon : null;
  const pakbonDoc = pakbonId
    ? await db.query.documents.findFirst({
        where: eq(documents.id, pakbonId),
        columns: { id: true, docNumber: true },
      })
    : null;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: { columns: { id: true, name: true, email: true, taxId: true, companyId: true, addressLine: true, postalCode: true, city: true, country: true } },
      company: { columns: { id: true, name: true, vatNumber: true, addressLine: true, postalCode: true, city: true, country: true } },
      deal: { columns: { id: true, title: true } },
      property: { columns: { id: true, title: true } },
      project: { columns: { id: true, name: true } },
    },
  });
  if (!doc) notFound();

  // Bijlagen (kozijn-tekeningen e.d.) + korte-termijn download-links.
  const attachments = doc.attachments ?? [];
  const attachmentLinks = await Promise.all(
    attachments.map(async (a) => ({ ...a, url: await documentFileUrl(a.path) })),
  );

  const holdedMap = await db.query.holdedSyncMap.findFirst({
    where: and(eq(holdedSyncMap.entityType, "document"), eq(holdedSyncMap.localId, id)),
  });

  // Offerte ↔ factuur-koppeling: welke facturen zijn van deze offerte gemaakt
  // (incl. deelfacturen), en — voor een factuur — uit welke offerte komt hij.
  const linkedDocs =
    doc.kind === "estimate"
      ? await db.query.documents.findMany({
          where: and(eq(documents.sourceDocumentId, id), ne(documents.status, "void")),
          columns: {
            id: true,
            kind: true,
            docNumber: true,
            title: true,
            status: true,
            totalEur: true,
            paidEur: true,
            issueDate: true,
            coveredPhase: true,
          },
          orderBy: [asc(documents.issueDate)],
        })
      : [];
  // Facturen tellen als "gefactureerd"; proforma-voorschotten los tonen.
  const linkedInvoices = linkedDocs.filter((d) => d.kind === "invoice");
  // Nieuwe voorschotten zijn 'fondos'; oude proforma's blijven zichtbaar.
  const linkedVoorschotten = linkedDocs.filter((d) => d.kind === "proforma" || d.kind === "fondos");
  const sourceEstimate =
    (doc.kind === "invoice" || doc.kind === "proforma") && doc.sourceDocumentId
      ? await db.query.documents.findFirst({
          where: eq(documents.id, doc.sourceDocumentId),
          // `kind` erbij: een aangepaste factuur verwijst naar een FACTUUR als
          // bron, en dat vraagt een ander label dan "gemaakt van offerte".
          columns: { id: true, docNumber: true, status: true, kind: true },
        })
      : null;

  // Verrekening: creditnota's die bij deze factuur horen, en een eventuele
  // aangepaste factuur die dit document vervangt. Concept-/afgewezen
  // creditnota's tellen niet mee in het verrekende bedrag (nooit verstuurd).
  const linkedCreditNotes =
    doc.kind === "invoice"
      ? await db.query.documents.findMany({
          where: and(
            eq(documents.sourceDocumentId, id),
            eq(documents.kind, "creditnote"),
            ne(documents.status, "void"),
          ),
          columns: { id: true, docNumber: true, status: true, totalEur: true },
          orderBy: [asc(documents.issueDate)],
        })
      : [];
  const creditedEur = linkedCreditNotes
    .filter((c) => c.status !== "draft" && c.status !== "rejected")
    .reduce((s, c) => s + Number(c.totalEur ?? 0), 0);
  const restNaCredit = Math.max(
    0,
    Number(doc.totalEur ?? 0) - Number(doc.paidEur ?? 0) - creditedEur,
  );
  const replacementInvoices =
    doc.kind === "invoice"
      ? await db.query.documents.findMany({
          where: and(
            eq(documents.sourceDocumentId, id),
            eq(documents.kind, "invoice"),
            ne(documents.status, "void"),
          ),
          columns: { id: true, docNumber: true, status: true },
        })
      : [];
  // Pakbonnen die bij deze factuur horen (met afgeleverd-status).
  const linkedDeliveryNotes =
    doc.kind === "invoice"
      ? await db.query.documents.findMany({
          where: and(
            eq(documents.sourceDocumentId, id),
            eq(documents.kind, "deliverynote"),
            ne(documents.status, "void"),
          ),
          columns: { id: true, docNumber: true, deliveredAt: true },
          orderBy: [asc(documents.issueDate)],
        })
      : [];

  // De levering die bij deze factuur hoort (gepland, afgehaald of "geen levering
  // nodig"). Zolang die ontbreekt staat de factuur op het dashboard bij
  // "te plannen leveringen".
  const linkedDelivery =
    doc.kind === "invoice"
      ? await db.query.deliveries.findFirst({
          where: eq(deliveries.documentId, id),
          columns: { id: true, method: true, status: true, deliveredAt: true },
        })
      : null;

  // Hoeveel van de offerte is al gefactureerd? (voor deelfacturen)
  const invoicedTotal = linkedInvoices.reduce((s, inv) => s + Number(inv.totalEur ?? 0), 0);
  const estimateTotal = Number(doc.totalEur ?? 0);
  const invoicedPct = estimateTotal > 0 ? Math.round((invoicedTotal / estimateTotal) * 100) : 0;
  const fullyInvoiced =
    doc.kind === "estimate" && estimateTotal > 0 && invoicedTotal >= estimateTotal - 0.01;
  const remainingPct = Math.min(100, Math.max(1, 100 - invoicedPct));

  const items = normalizeDocItems(doc.items);

  // Fases op deze offerte: groepeer regels op `phase`. Per fase: subtotaal (ex. BTW
  // na korting) en of er al een factuur voor bestaat (coveredPhase op een factuur).
  const coveredPhases = new Set(
    linkedInvoices.map((inv) => inv.coveredPhase).filter((p): p is string => !!p),
  );
  const phaseMap = new Map<string, { subtotal: number; lines: number }>();
  if (doc.kind === "estimate") {
    for (const it of items) {
      const key = (it.phase ?? "").trim();
      if (!key) continue;
      const net = (Number(it.units) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discount) || 0) / 100);
      const e = phaseMap.get(key) ?? { subtotal: 0, lines: 0 };
      e.subtotal += net;
      e.lines += 1;
      phaseMap.set(key, e);
    }
  }
  const phaseLabelMap = new Map(
    (Array.isArray(doc.phases) ? doc.phases : []).map((p) => [p.key, p.label]),
  );
  // In bouwvolgorde (de hoofdstuk-volgorde van het prijzenboek), niet
  // alfabetisch: sloopwerk bovenaan, eigen producten onderaan. Onbekende
  // fases sluiten alfabetisch achteraan aan.
  const bouwvolgorde = new Map(HOOFDSTUKKEN.map((h, i) => [h as string, i]));
  const phaseList = [...phaseMap.entries()]
    .map(([key, v]) => ({ key, label: phaseLabelMap.get(key) ?? key, ...v, covered: coveredPhases.has(key) }))
    .sort((a, b) => {
      const ia = bouwvolgorde.get(a.label) ?? bouwvolgorde.get(a.key) ?? 999;
      const ib = bouwvolgorde.get(b.label) ?? bouwvolgorde.get(b.key) ?? 999;
      return ia !== ib ? ia - ib : a.label.localeCompare(b.label, "nl", { numeric: true });
    });

  // Marge (intern): kostprijs per regel via gekoppeld product (id of SKU). Komt
  // NIET op de klant-PDF — alleen zichtbaar voor jullie op deze pagina.
  const itemProductIds = [...new Set(items.map((it) => it.productId).filter(Boolean) as string[])];
  const itemSkus = [...new Set(items.map((it) => it.description?.trim()).filter(Boolean) as string[])];
  const costRows =
    itemProductIds.length || itemSkus.length
      ? await db.query.products.findMany({
          where: or(
            itemProductIds.length ? inArray(products.id, itemProductIds) : undefined,
            itemSkus.length ? inArray(products.sku, itemSkus) : undefined,
          ),
          columns: { id: true, sku: true, name: true, costEur: true, stockQty: true, stockMin: true, brandId: true },
        })
      : [];
  // Merken die we niet op voorraad houden (Brauer): daar is "niet op voorraad"
  // de normale toestand, geen waarschuwing. Ze horen besteld te worden zodra de
  // klant akkoord is.
  const merkIds = [...new Set(costRows.map((p) => p.brandId).filter((v): v is string => !!v))];
  const bestelMerken = merkIds.length
    ? await db.query.brands.findMany({
        where: and(inArray(brands.id, merkIds), eq(brands.orderOnDemand, true)),
        columns: { id: true, name: true },
      })
    : [];
  const bestelMerkNaam = new Map(bestelMerken.map((b) => [b.id, b.name]));
  const costById = new Map(costRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const costBySku = new Map(
    costRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]),
  );
  // Voorraad per product (op id én sku) — voor de tekort-waarschuwing.
  type StockInfo = { sku: string | null; name: string; stock: number; min: number; merk: string | null };
  const stockByKey = new Map<string, StockInfo>();
  for (const p of costRows) {
    const info: StockInfo = {
      sku: p.sku,
      name: p.name,
      stock: Number(p.stockQty ?? 0),
      min: Number(p.stockMin ?? 0),
      merk: p.brandId ? (bestelMerkNaam.get(p.brandId) ?? null) : null,
    };
    stockByKey.set(p.id, info);
    if (p.sku) stockByKey.set(p.sku, info);
  }
  // Regels met te weinig / (bijna) geen voorraad t.o.v. het bestelde aantal.
  // Niet tonen zodra de voorraad van dit document al is afgeboekt — dan is de
  // verkoop al uit de voorraad gehaald en zou de melding dubbel tellen.
  // Ook niet op creditnota's/fondos: die verbruiken geen voorraad (een
  // creditnota boekt juist terug), dus "nodig X / bestellen" slaat daar nergens op.
  const consumesStock = doc.kind !== "creditnote" && doc.kind !== "fondos";
  const lowStock = (doc.stockAppliedAt || !consumesStock ? [] : items)
    .map((it) => {
      const info = it.productId
        ? stockByKey.get(it.productId)
        : it.description
          ? stockByKey.get(it.description.trim())
          : undefined;
      if (!info || !info.sku) return null;
      const units = Number(it.units) || 0;
      // Alleen melden als deze regel de voorraad onder 0 zou brengen.
      if (info.stock - units >= 0) return null;
      const toOrder = Math.round((units - info.stock) * 100) / 100; // tot terug op 0
      return { name: (it.name || info.name).trim(), sku: info.sku, stock: info.stock, units, toOrder, merk: info.merk };
    })
    .filter(
      (x): x is { name: string; sku: string; stock: number; units: number; toOrder: number; merk: string | null } => !!x,
    );
  // Wat van een besteld-op-order merk komt is géén tekort: dat hóórt besteld te
  // worden. Pas als de klant akkoord is, is het een taak.
  const bestelRegels = lowStock.filter((p) => p.merk);
  const echtTekort = lowStock.filter((p) => !p.merk);
  const klantAkkoord =
    doc.acceptedAt != null ||
    doc.status === "accepted" ||
    doc.status === "paid" ||
    doc.kind === "invoice" ||
    doc.kind === "proforma";
  const bestelMerkenInDoc = [...new Set(bestelRegels.map((p) => p.merk).filter((v): v is string => !!v))];
  // Marge alleen berekenen over regels waarvoor we een kostprijs kennen — anders
  // telt een regel zonder kostprijs als 100% marge en wordt het percentage te hoog.
  let docCost = 0;
  let costedRevenue = 0;
  let costedLines = 0;
  const productCostOf = (it: (typeof items)[number]) =>
    (it.productId ? costById.get(it.productId) : undefined) ??
    (it.description ? costBySku.get(it.description.trim()) : undefined);
  for (const it of items) {
    const cost = lineCostEur(it, productCostOf); // regel-kostprijs > marge% > catalogus
    if (cost != null) {
      docCost += cost;
      costedRevenue += lineNet(it);
      costedLines++;
    }
  }
  const docMargin = costedRevenue - docCost;
  const docMarginPct = costedRevenue > 0 ? Math.round((docMargin / costedRevenue) * 100) : null;
  const marginComplete = items.length > 0 && costedLines === items.length;

  // Begroting (intern): de calculatie achter een gecalculeerde offerte —
  // verkoop, kost en marge per bouwfase, met de regels eronder uitklapbaar.
  // Bij akkoord worden precies deze fases de budgetregels van het project.
  const begrotingPerFase = phaseList.map((f) => {
    const regels = items
      .filter((it) => (it.phase ?? "").trim() === f.key)
      .map((it) => ({
        name: it.name,
        units: Number(it.units) || 0,
        unit: it.unit,
        verkoop: lineNet(it),
        kost: lineCostEur(it, productCostOf),
      }));
    const verkoop = regels.reduce((s, r) => s + r.verkoop, 0);
    const kost = regels.reduce((s, r) => s + (r.kost ?? 0), 0);
    const kostCompleet = regels.every((r) => r.kost != null);
    return { ...f, regels, verkoop, kost, kostCompleet };
  });
  const begroting = begrotingPerFase.length
    ? {
        verkoop: begrotingPerFase.reduce((s, f) => s + f.verkoop, 0),
        kost: begrotingPerFase.reduce((s, f) => s + f.kost, 0),
        kostCompleet: begrotingPerFase.every((f) => f.kostCompleet),
      }
    : null;

  const partyName = doc.contact?.name ?? doc.company?.name ?? null;
  const kindLabel = uiT(documentKindMeta[doc.kind]);
  // Facturatie-check: welke verplichte klantgegevens ontbreken (blokkeert versturen).
  // Bedrijf: van de factuur zelf, anders dat van het contact (zakelijke klant) —
  // zelfde volgorde als de PDF-route, anders vraagt de check een NIE/BSN van een SL.
  const billingCompany =
    doc.company ??
    (doc.contact?.companyId
      ? await db.query.companies.findFirst({
          where: eq(companies.id, doc.contact.companyId),
          columns: { name: true, vatNumber: true, addressLine: true, postalCode: true, city: true, country: true },
        })
      : null);
  const invoiceMissing =
    doc.kind === "invoice" || doc.kind === "creditnote" ? missingBillingFields(doc.contact, billingCompany) : [];

  // Alleen facturen met productregels kunnen daadwerkelijk geleverd of opgehaald
  // worden — een factuur voor uren heeft niets om mee te geven.
  const hasProductLines = items.some((it) => it.productId && it.units);
  const isPickedUp = linkedDelivery?.method === "ophalen" && linkedDelivery.status === "geleverd";

  const changeStatus = setDocumentStatus.bind(null, id);
  const removeDoc = deleteDocument.bind(null, id);
  const makeInvoice = createInvoiceFromEstimate.bind(null, id);
  const reserveAction = toggleReserveEstimate.bind(null, id);
  const contractAction = toggleContractRequired.bind(null, id);
  const unlockAction = unlockDocument.bind(null, id);
  const makeDeliveryNote = createDeliveryNoteFromDocument.bind(null, id);
  const makeCreditNote = createCreditNoteFromInvoice.bind(null, id);
  const makeAdjustedInvoice = createAdjustedInvoiceForRemainder.bind(null, id);

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const publicUrl = doc.acceptToken ? `${proto}://${host}/offerte/${doc.acceptToken}` : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {kindLabel} {doc.docNumber ?? ""}
            <Badge tone={documentStatusMeta[doc.status].tone}>
              {uiT(documentStatusMeta[doc.status].label)}
            </Badge>
            {linkedInvoices.length > 0 && <Badge tone="success">{uiT("Gefactureerd")}</Badge>}
          </span>
        }
        subtitle={doc.title ?? (partyName ? uiT("Voor {v0}", { v0: partyName }) : undefined)}
        actions={
          <>
            <Link href={doc.kind === "invoice" ? "/invoices" : "/quotes"} className="text-sm text-muted hover:underline">
              {uiT("← Terug")} </Link>
            <a
              href={`/documents/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              PDF
            </a>
            <LinkButton href={`/documents/${id}/edit`} variant="secondary">
              {uiT("Bewerken")} </LinkButton>
          </>
        }
      />

      {typeof sp.fout === "string" && sp.fout && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
          ⚠ {sp.fout}
        </div>
      )}

      {invoiceMissing.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <strong>{uiT("Klantgegevens onvolledig")}</strong> {uiT("— deze factuur kan niet verstuurd of goedgekeurd worden. Ontbreekt:")}{" "}
            <strong>{invoiceMissing.join(", ")}</strong>.
          </span>
          {doc.contact?.id && (
            <LinkButton href={`/contacts/${doc.contact.id}/edit`} variant="secondary" className="shrink-0 text-xs">
              {uiT("Klant aanvullen")} </LinkButton>
          )}
        </div>
      )}

      {/* Besteld-op-order merken: zolang de offerte nog loopt is dit niets om te
          melden — pas bij akkoord wordt het een taak. */}
      {bestelRegels.length > 0 && (
        <div
          className={`mb-4 rounded-lg border p-4 ${
            klantAkkoord ? "border-amber-200 bg-amber-50" : "border-border bg-background"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className={`text-sm font-medium ${klantAkkoord ? "text-amber-900" : "text-muted"}`}>
              {klantAkkoord
                ? uiT("📦 {v0} artikel{v1} nog te bestellen bij {v2}", { v0: bestelRegels.length, v1: bestelRegels.length === 1 ? "" : "en", v2: bestelMerkenInDoc.join(" en ") })
                : uiT("{v0} artikel{v1} van {v2} — wordt op bestelling geleverd", { v0: bestelRegels.length, v1: bestelRegels.length === 1 ? "" : "en", v2: bestelMerkenInDoc.join(" en ") })}
            </p>
            {klantAkkoord && (
              <LinkButton
                href={`/bestellen?q=${encodeURIComponent(bestelRegels[0].sku)}`}
                variant="primary"
                className="text-xs"
              >
                {uiT("→ Bestellen")} </LinkButton>
            )}
          </div>
          <ul className={`space-y-1 text-xs ${klantAkkoord ? "text-amber-900" : "text-muted"}`}>
            {bestelRegels.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono opacity-70">{p.sku}</span>
                <span className="opacity-80">· {p.units} {uiT("stuks")}</span>
              </li>
            ))}
          </ul>
          {!klantAkkoord && (
            <p className="mt-2 text-xs text-muted">
              {uiT("Zodra de klant akkoord is, staat hier de bestelopdracht.")} </p>
          )}
        </div>
      )}

      {echtTekort.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-amber-900">
              ⚠️ {echtTekort.length} {uiT(echtTekort.length === 1 ? "product" : "producten")} {uiT("(bijna) niet op voorraad")} </p>
            <LinkButton
              href={`/bestellen?q=${encodeURIComponent(echtTekort[0].sku)}`}
              variant="primary"
              className="text-xs"
            >
              {uiT("→ Bestellen")} </LinkButton>
          </div>
          <ul className="space-y-1 text-xs text-amber-900">
            {echtTekort.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-amber-700">{p.sku}</span>
                <span className="text-amber-700">
                  {uiT("· voorraad")} {p.stock}{uiT(", nodig")} {p.units}
                </span>
                {p.toOrder > 0 && (
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium">
                    {uiT("minimaal bestellen:")} {p.toOrder}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pakbonDoc && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <span>
            {uiT("✓ Pakbon")} <strong>{pakbonDoc.docNumber ?? ""}</strong> {uiT("klaargezet met dezelfde regels (zonder prijzen).")} </span>
          <Link href={`/documents/${pakbonDoc.id}`} className="font-medium text-accent hover:underline">
            {uiT("Open pakbon →")} </Link>
        </div>
      )}

      {doc.kind === "estimate" && linkedInvoices.length > 0 && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-4">
          <p className="mb-2 text-sm font-medium">
            {uiT("Gefactureerd —")} {linkedInvoices.length} {uiT(linkedInvoices.length === 1 ? "factuur" : "facturen")} {uiT("van deze offerte")} </p>
          <ul className="space-y-1.5 text-sm">
            {linkedInvoices.map((inv) => {
              const total = Number(inv.totalEur ?? 0);
              const paid = Number(inv.paidEur ?? 0);
              const betaling =
                paid >= total && total > 0
                  ? "✓ betaald"
                  : paid > 0
                    ? `deels betaald (${formatEUR(paid)})`
                    : "nog niet betaald";
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/documents/${inv.id}`} className="font-medium text-accent hover:underline">
                    {inv.docNumber ?? uiT("(concept)")}
                  </Link>
                  <Badge tone={documentStatusMeta[inv.status].tone}>
                    {uiT(documentStatusMeta[inv.status].label)}
                  </Badge>
                  <span className="tabular-nums">{formatEUR(total)}</span>
                  <span className="text-muted">· {betaling}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(doc.kind === "invoice" || doc.kind === "proforma") && sourceEstimate && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">
            {sourceEstimate.kind === "invoice"
              ? uiT("Aangepaste factuur — vervangt")
              : doc.kind === "proforma"
                ? uiT("Voorschot bij offerte")
                : uiT("Gemaakt van offerte")}
          </span>
          <Link href={`/documents/${sourceEstimate.id}`} className="font-medium text-accent hover:underline">
            {sourceEstimate.docNumber ?? (sourceEstimate.kind === "invoice" ? uiT("(factuur)") : uiT("(offerte)"))} →
          </Link>
        </div>
      )}

      {doc.kind === "invoice" && linkedCreditNotes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">{uiT("Verrekening:")}</span>
          {linkedCreditNotes.map((cn) => (
            <Link key={cn.id} href={`/documents/${cn.id}`} className="font-medium text-accent hover:underline">
              {cn.docNumber ?? uiT("(creditnota)")} ({formatEUR(-Number(cn.totalEur ?? 0))}
              {cn.status === "draft" ? uiT(" · concept") : ""}) →
            </Link>
          ))}
          <span className={restNaCredit <= 0.01 ? "font-medium text-success" : "text-muted"}>
            {restNaCredit <= 0.01
              ? uiT("✓ volledig verrekend — er staat niets meer open")
              : uiT("nog {v0} open na verrekening", { v0: formatEUR(restNaCredit) })}
          </span>
        </div>
      )}

      {doc.kind === "invoice" && replacementInvoices.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">{uiT("Vervangen door aangepaste factuur")}</span>
          {replacementInvoices.map((f) => (
            <Link key={f.id} href={`/documents/${f.id}`} className="font-medium text-accent hover:underline">
              {f.docNumber ?? uiT("(factuur)")}
              {f.status === "draft" ? uiT(" (concept)") : ""} →
            </Link>
          ))}
        </div>
      )}

      {doc.kind === "invoice" && linkedDeliveryNotes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">{uiT(linkedDeliveryNotes.length === 1 ? "Pakbon" : "Pakbonnen")}:</span>
          {linkedDeliveryNotes.map((p) => (
            <Link key={p.id} href={`/documents/${p.id}`} className="flex items-center gap-1.5 hover:underline">
              <span className="font-medium">{p.docNumber ?? uiT("pakbon")}</span>
              {p.deliveredAt ? (
                <Badge tone="success">{uiT("Afgeleverd")} {formatDate(p.deliveredAt, uiDateLocale)}</Badge>
              ) : (
                <Badge tone="neutral">{uiT("Niet afgeleverd")}</Badge>
              )}
            </Link>
          ))}
        </div>
      )}

      {sp.voorraad === "dubbel" && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {uiT("⚠ Voorraad is voor deze deal al afgeboekt")} {typeof sp.doc === "string" && sp.doc ? (
            <> {uiT("op")} <strong>{sp.doc}</strong></>
          ) : (
            uiT(" op een ander document")
          )}{" "}
          {uiT("— niet nogmaals afgeboekt, zodat je niet dubbel telt.")} </div>
      )}

      {doc.kind === "invoice" &&
        !doc.stockAppliedAt &&
        items.some((it) => it.productId && it.units) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span className="text-warning">
              {uiT("⚠ Voorraad voor deze factuur is nog niet afgeboekt. Dit gebeurt automatisch zodra de factuur verzonden of betaald is — of doe het nu meteen:")} </span>
            <form action={applyStockOutFromDocument.bind(null, id)}>
              <SubmitButton size="sm" variant="primary" pendingLabel={uiT("Bezig…")}>
                {uiT("→ Voorraad afboeken")} </SubmitButton>
            </form>
          </div>
        )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Gegevens")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">{uiT("Klant")}</dt>
                <dd>
                  {doc.contact ? (
                    <Link href={`/contacts/${doc.contact.id}`} className="hover:underline">
                      {doc.contact.name}
                    </Link>
                  ) : (
                    partyName ?? "—"
                  )}
                </dd>
                <dt className="text-muted">{uiT("Deal")}</dt>
                <dd>
                  {doc.deal ? (
                    <Link href={`/deals/${doc.deal.id}`} className="hover:underline">
                      {doc.deal.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">{uiT("Pand")}</dt>
                <dd>
                  {doc.property ? (
                    <Link href={`/properties/${doc.property.id}`} className="hover:underline">
                      {doc.property.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">{uiT("Project")}</dt>
                <dd>
                  {doc.project ? (
                    <Link href={`/projects/${doc.project.id}`} className="hover:underline">
                      {doc.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">{uiT("Datum")}</dt>
                <dd>{formatDate(doc.issueDate, uiDateLocale)}</dd>
                <dt className="text-muted">{uiT("Vervaldatum")}</dt>
                <dd>{formatDate(doc.dueDate, uiDateLocale)}</dd>
                <dt className="text-muted">{uiT("Betaald")}</dt>
                <dd className="tabular-nums">{formatEUR(doc.paidEur)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Versturen & status")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <LinkButton href={`/documents/${id}/verzenden`} size="sm">
                {doc.sentAt ? uiT("Opnieuw versturen") : uiT("Versturen naar klant")}
              </LinkButton>

              {sp.verzonden === "bezig" && (
                <p className="rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
                  {uiT("📨 De mail wordt op de achtergrond verstuurd — je kunt gewoon verder. In de tijdlijn verschijnt zo de bevestiging.")} </p>
              )}
              {sp.verzonden === "verzonden" && (
                <p className="rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
                  {uiT("✓ Mail verstuurd naar de klant.")} </p>
              )}
              {sp.verzonden === "geenmail" && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  {uiT("De klant-link is aangemaakt, maar de mail kon niet verstuurd worden.")} </p>
              )}
              {sp.verzonden === "geenadres" && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  {uiT("Verstuurd zonder mail — dit contact heeft geen e-mailadres.")} </p>
              )}

              {doc.sentAt && (
                <div className="space-y-1.5 rounded-md bg-background px-3 py-2">
                  <p className="text-muted">
                    {uiT("Verstuurd op")} <span className="text-foreground">{formatDate(doc.sentAt, uiDateLocale)}</span>
                  </p>
                  {publicUrl && (
                    <p className="break-all">
                      {uiT("Klant-link:")}{" "}
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {publicUrl}
                      </a>
                    </p>
                  )}
                  {publicUrl && doc.requiresContract && (
                    <p className="break-all">
                      {uiT("Overeenkomst:")}{" "}
                      <a
                        href={`${publicUrl}/contract`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {publicUrl}{uiT("/contract")} </a>
                    </p>
                  )}
                  {doc.signature ? (
                    <div className="font-medium text-success">
                      <p>
                        {uiT("✍️ Ondertekend door")} {doc.signature.name} {uiT("op")} {formatDate(doc.signature.signedAt, uiDateLocale)}
                      </p>
                      <p className="text-[11px] font-normal text-muted">
                        {doc.signature.email} {uiT("· IP")} {doc.signature.ip ?? uiT("onbekend")} {uiT("· vingerafdruk")}{" "}
                        {doc.signature.snapshotSha256.slice(0, 12)} {uiT("· versie")} {doc.signature.termsVersion}
                      </p>
                      <a
                        href={`/documents/${id}/contract/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-normal text-accent hover:underline"
                      >
                        {uiT("↓ Getekende overeenkomst (PDF)")} </a>
                    </div>
                  ) : doc.acceptedAt ? (
                    <p className="font-medium text-success">
                      {uiT("✓ Geaccepteerd door klant op")} {formatDate(doc.acceptedAt, uiDateLocale)}
                    </p>
                  ) : doc.rejectedAt ? (
                    <p className="text-danger">
                      {uiT("Afgewezen op")} {formatDate(doc.rejectedAt, uiDateLocale)}
                      {doc.rejectReason ? ` — ${doc.rejectReason}` : ""}
                    </p>
                  ) : (
                    <p className="text-muted">{uiT("Nog geen reactie van de klant.")}</p>
                  )}
                </div>
              )}

              {doc.kind === "estimate" && !doc.signature && (
                <form action={contractAction} className="rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">
                    {doc.requiresContract ? uiT("✓ Contract vereist") : uiT("Contract vereist")}
                  </p>
                  <p className="mb-2 text-[11px] text-muted">
                    {doc.requiresContract
                      ? uiT("De klant ondertekent een aannemingsovereenkomst — met bevestiging per onderwerp (meerwerk, onvoorziene kosten, stelposten, betaling) in plaats van één klik op akkoord.")
                      : uiT("Zet dit aan bij een volledige verbouwing: de klant tekent dan een overeenkomst in plaats van alleen op 'akkoord' te klikken.")}
                  </p>
                  <SubmitButton size="sm" variant={doc.requiresContract ? "ghost" : "secondary"} pendingLabel={uiT("Bezig…")}>
                    {doc.requiresContract ? uiT("Contract niet nodig") : uiT("✍️ Contract vereisen")}
                  </SubmitButton>
                </form>
              )}

              {doc.lockedAt && !doc.unlockedAt && (
                <form action={unlockAction} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
                  <p className="text-xs font-medium text-warning">{uiT("🔒 Op slot — ondertekend door de klant")}</p>
                  <p className="mb-2 text-[11px] text-muted">
                    {uiT("Bewerken en verwijderen zijn geblokkeerd. Ontgrendelen kan met een reden; die wordt vastgelegd in de tijdlijn.")} </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      name="reason"
                      required
                      placeholder={uiT("Reden voor ontgrendelen")}
                      className="min-w-48 flex-1 rounded-md border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                    <SubmitButton size="sm" variant="ghost" pendingLabel={uiT("Bezig…")}>
                      {uiT("Ontgrendelen")} </SubmitButton>
                  </div>
                </form>
              )}

              {doc.unlockedAt && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning">
                  {uiT("Ontgrendeld op")} {formatDate(doc.unlockedAt, uiDateLocale)} {uiT("— het getekende exemplaar blijft ongewijzigd bewaard; wijzigingen hier gelden niet met terugwerkende kracht.")} </p>
              )}

              {doc.kind === "estimate" && (
                <form action={reserveAction} className="rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">
                    {doc.reservedAt ? uiT("✓ Producten gereserveerd") : uiT("Producten reserveren")}
                  </p>
                  <p className="mb-2 text-[11px] text-muted">
                    {doc.reservedAt
                      ? uiT("Sinds {v0} — telt mee als gereserveerde voorraad op het dashboard.", { v0: formatDate(doc.reservedAt, uiDateLocale) })
                      : uiT("Zet de producten alvast op gereserveerd, zodat je op het dashboard ziet wat besteld moet worden.")}
                  </p>
                  <SubmitButton size="sm" variant={doc.reservedAt ? "ghost" : "secondary"} pendingLabel={uiT("Bezig…")}>
                    {doc.reservedAt ? uiT("Reservering opheffen") : uiT("🔖 Reserveren")}
                  </SubmitButton>
                </form>
              )}

              {doc.kind === "proforma" && (
                <form action={createInvoiceFromProforma.bind(null, id)} className="rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">{uiT("Omzetten naar factuur")}</p>
                  <p className="mb-2 text-[11px] text-muted">
                    {uiT("Maak van dit voorschot een echte factuur (mét btw) — hier gaat de btw pas lopen.")} </p>
                  <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                    {uiT("→ Factuur maken")} </SubmitButton>
                </form>
              )}

              {doc.kind === "estimate" && (
                <div className="rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">{uiT("Voorschotten bij deze offerte")}</p>
                  {linkedVoorschotten.length > 0 ? (
                    <ul className="mb-2 mt-1 space-y-1">
                      {linkedVoorschotten.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link href={`/documents/${v.id}`} className="text-accent hover:underline">
                            {v.docNumber}
                          </Link>
                          <span className="flex items-center gap-2">
                            <Badge tone={v.status === "paid" ? "success" : "neutral"}>
                              {v.status === "paid" ? uiT("betaald") : uiT("open")}
                            </Badge>
                            <span className="tabular-nums">{formatEUR(v.totalEur)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-2 text-[11px] text-muted">
                      {uiT("Een voorschot dat aan deze offerte hangt en op de eindfactuur wordt verrekend.")} </p>
                  )}
                  <LinkButton
                    href={`/documents/new?kind=fondos&sourceDocumentId=${id}${doc.projectId ? `&projectId=${doc.projectId}` : ""}${doc.contactId ? `&contactId=${doc.contactId}` : ""}`}
                    size="sm"
                    variant="secondary"
                  >
                    {uiT("+ Provisión de fondos")} </LinkButton>
                </div>
              )}

              {/* Gecalculeerde offerte mét betalingsschema: factureren volgt de
                  termijnen — exact dezelfde lijst als in de calculator. De
                  termijn-proforma's worden bij akkoord klaargezet. */}
              {doc.kind === "estimate" && Array.isArray(doc.paymentSchedule) && doc.paymentSchedule.length > 0 && (
                <div className="space-y-2 rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">{uiT("Factureren per termijn (betalingsschema)")}</p>
                  {doc.paymentSchedule.map((t, i) => {
                    const proforma = linkedVoorschotten.find((v) => v.title?.startsWith(`Termijn ${i + 1} —`));
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {t.pct}% {t.label}
                          </p>
                          <p className="text-xs text-muted">{uiT("Termijn")} {i + 1} · {formatEUR(t.amountEur)} {uiT("ex. BTW")}</p>
                        </div>
                        {proforma ? (
                          <Link href={`/documents/${proforma.id}`} className="text-sm text-accent hover:underline">
                            {proforma.docNumber}
                          </Link>
                        ) : (
                          <Badge tone="neutral">{uiT("bij akkoord")}</Badge>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-muted">
                    {uiT("Bij akkoord op de offerte worden de termijn-proforma's automatisch op het project klaargezet — versturen en factureren doe je per termijn vanaf de proforma.")} </p>
                </div>
              )}

              {doc.kind === "estimate" && !(Array.isArray(doc.paymentSchedule) && doc.paymentSchedule.length > 0) && phaseList.length > 0 && (
                <div className="space-y-2 rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">{uiT("Factureren per fase")}</p>
                  {phaseList.map((ph) => (
                    <div key={ph.key} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{ph.label}</p>
                        <p className="text-xs text-muted">
                          {ph.lines} {uiT(ph.lines === 1 ? "regel" : "regels")} · {formatEUR(ph.subtotal)} {uiT("ex. BTW")} </p>
                      </div>
                      {ph.covered ? (
                        <Badge tone="success">{uiT("✓ Gefactureerd")}</Badge>
                      ) : (
                        <form action={makeInvoice}>
                          <input type="hidden" name="phase" value={ph.key} />
                          <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                            {uiT("→ Factuur")} </SubmitButton>
                        </form>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted">
                    {uiT("Of factureer hieronder een percentage van de hele offerte.")} </p>
                </div>
              )}

              {doc.kind === "estimate" && fullyInvoiced && (
                <div className="rounded-md bg-background px-3 py-2.5 text-xs text-muted">
                  {uiT(linkedInvoices.length === 1 ? "✓ Volledig gefactureerd ({pct}%). Zie de gekoppelde factuur bovenaan." : "✓ Volledig gefactureerd ({pct}%). Zie de gekoppelde facturen bovenaan.", { pct: invoicedPct })} </div>
              )}

              {doc.kind === "estimate" && !fullyInvoiced && (
                <form action={makeInvoice} className="space-y-2 rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">{uiT("Factuur maken van deze offerte")}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      name="percentage"
                      defaultValue={String(remainingPct)}
                      min="1"
                      max="100"
                      step="1"
                      className="w-20 text-right"
                    />
                    <span className="text-sm text-muted">%</span>
                    <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                      {uiT("→ Maak factuur")} </SubmitButton>
                  </div>
                  <p className="text-xs text-muted">
                    {invoicedPct > 0
                      ? uiT("Al {v0}% gefactureerd — dit maakt een factuur voor de rest.", { v0: invoicedPct })
                      : uiT("Bijv. 50 voor een aanbetaling; maak daarna een tweede factuur voor het restant.")}
                  </p>
                </form>
              )}
              {doc.kind !== "deliverynote" && doc.kind !== "creditnote" && doc.kind !== "fondos" && (
                <form action={makeDeliveryNote}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                    {uiT("→ Maak pakbon")} </SubmitButton>
                </form>
              )}
              {doc.kind === "invoice" && hasProductLines && (
                <div className="space-y-1">
                  {isPickedUp ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-success">
                        {uiT("🤝 Afgehaald")}{linkedDelivery?.deliveredAt ? uiT(" op {v0}", { v0: formatDate(linkedDelivery.deliveredAt, uiDateLocale) }) : ""}
                      </span>
                      <form action={undoPickedUp.bind(null, id)}>
                        <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                          {uiT("Ongedaan maken")} </SubmitButton>
                      </form>
                    </div>
                  ) : linkedDelivery ? (
                    <p className="text-xs text-muted">
                      {uiT("Levering staat ingepland —")}{" "}
                      <Link href="/leveringen" className="text-accent hover:underline">
                        {uiT("bekijk op leveringen")} </Link>
                    </p>
                  ) : (
                    <form action={markPickedUp.bind(null, id)}>
                      <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                        {uiT("🤝 Markeer als afgehaald")} </SubmitButton>
                      <p className="mt-1 text-xs text-muted">
                        {uiT("Klant heeft het meegenomen — haalt deze factuur van “te plannen leveringen” af.")} </p>
                    </form>
                  )}
                </div>
              )}
              {doc.kind === "invoice" && (
                <form action={makeCreditNote}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                    {uiT("→ Maak creditnota")} </SubmitButton>
                </form>
              )}
              {doc.kind === "invoice" &&
                creditedEur > 0.01 &&
                restNaCredit > 0.01 &&
                replacementInvoices.length === 0 && (
                  <form action={makeAdjustedInvoice}>
                    <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                      {uiT("→ Aangepaste factuur (restant")} {formatEUR(restNaCredit)})
                    </SubmitButton>
                    <p className="mt-1 text-xs text-muted">
                      {uiT("Deze factuur is deels gecrediteerd. Dit crediteert ook het restant en zet een aangepaste conceptfactuur klaar met alle originele regels — beide blijven concept totdat jij ze controleert en verstuurt.")} </p>
                  </form>
                )}
              {(doc.kind === "deliverynote" || doc.kind === "invoice") && doc.stockAppliedAt && (
                <div className="space-y-1">
                  <p className="text-xs text-success">
                    {uiT("✓ Voorraad afgeboekt op")} {new Date(doc.stockAppliedAt).toLocaleDateString(uiDateLocale, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <form action={reverseStockOutFromDocument.bind(null, id)}>
                    <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel={uiT("Bezig…")}>
                      {uiT("Voorraad-afboeking ongedaan maken")} </SubmitButton>
                  </form>
                </div>
              )}
              {doc.kind === "deliverynote" ? (
                // Een pakbon is een leverdocument: alleen klaargezet → afgeleverd.
                <div className="pt-1">
                  {doc.deliveredAt ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-success">
                        {uiT("✓ Afgeleverd op")} {formatDate(doc.deliveredAt, uiDateLocale)}
                      </span>
                      <form action={setDeliveryNoteDelivered.bind(null, id, false)}>
                        <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                          {uiT("Ongedaan maken")} </SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <form action={setDeliveryNoteDelivered.bind(null, id, true)}>
                      <SubmitButton size="sm" variant="primary" pendingLabel={uiT("Bezig…")}>
                        {uiT("→ Markeer als afgeleverd")} </SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <>
                  {(doc.kind === "invoice" || doc.kind === "creditnote" || doc.kind === "fondos") &&
                    doc.status === "draft" && (
                      <form action={markDocumentSentNoEmail.bind(null, id)} className="pt-1">
                        <SubmitButton size="sm" variant="primary" pendingLabel={uiT("Bezig…")}>
                          {uiT("✓ Markeer als verstuurd (zonder mail)")} </SubmitButton>
                        <p className="mt-1 text-[11px] text-muted">
                          {uiT("Voor wanneer je het document persoonlijk of per app hebt afgegeven")} {doc.kind === "fondos"
                            ? uiT(" — geen voorraadeffect.")
                            : uiT(" — boekt ook de voorraad {v0}.", { v0: doc.kind === "creditnote" ? "terug" : "af" })}
                        </p>
                      </form>
                    )}
                  <form action={changeStatus} className="flex items-center gap-2 pt-1">
                    <Select name="status" defaultValue={doc.status} className="flex-1">
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {uiT(documentStatusMeta[s].label)}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Bezig…")}>
                      {uiT("Status bijwerken")} </SubmitButton>
                  </form>
                  <form action={changeStatus}>
                    <input type="hidden" name="status" value="paid" />
                    <SubmitButton size="sm" variant="ghost" pendingLabel={uiT("Bezig…")}>
                      {uiT("Markeer betaald")} </SubmitButton>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          {doc.kind === "fondos" && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle>{uiT("Provisión de fondos")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p>
                  {uiT("Voorschotdocument —")} <strong>{uiT("géén factuur")}</strong> {uiT("en geen BTW-vermelding (procedure boekhouder). Blijft buiten Holded en buiten de FAC-reeks.")} </p>
                <p className="text-xs text-muted">
                  {uiT("⚠️ Altijd eerst ter controle naar Paco sturen vóórdat het naar de klant gaat.")} </p>
              </CardContent>
            </Card>
          )}

          {doc.isExternal && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle>{uiT("Externe factuur")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {uiT("Factuur van een andere administratie (bv. Creadores) — alleen ter registratie op het project. Wordt bewust")} <strong>{uiT("niet")}</strong> {uiT("naar Habitats Holded gepusht.")} </CardContent>
            </Card>
          )}

          {doc.kind !== "fondos" && !doc.isExternal && (
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Holded")}</CardTitle>
              {(holdedMap || doc.holdedId) && <Badge tone="success">{uiT("✓ gekoppeld")}</Badge>}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {sp.holded === "ok" && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
                  {uiT("Naar Holded gepusht")}{typeof sp.hid === "string" ? uiT(" (id {v0})", { v0: sp.hid }) : ""}.
                </p>
              )}
              {typeof sp.holdedError === "string" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
                  {uiT("Mislukt:")} {sp.holdedError}
                </p>
              )}
              {sp.holdedUpdate === "ok" && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
                  {uiT("Factuur bijgewerkt in Holded.")} </p>
              )}
              {holdedMap || doc.holdedId ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <dt className="text-muted">{uiT("Holded-id")}</dt>
                    <dd className="font-mono text-xs">{holdedMap?.holdedId ?? doc.holdedId}</dd>
                    <dt className="text-muted">{uiT("Laatste sync")}</dt>
                    <dd>{formatDate(holdedMap?.lastSyncedAt, uiDateLocale)}</dd>
                  </dl>
                  <form action={updateDocumentInHoldedAction.bind(null, id)} className="mt-1">
                    <SubmitButton variant="secondary" size="sm" pendingLabel={uiT("Bijwerken…")}>
                      {uiT("Bijwerken in Holded")} </SubmitButton>
                  </form>
                  <p className="text-xs text-muted">
                    {uiT("Stuurt de huidige versie naar Holded. Lukt alleen zolang de factuur daar nog niet definitief is.")} </p>
                </>
              ) : (
                <>
                  <p className="text-muted">{uiT("Nog niet naar Holded gepusht.")}</p>
                  {!process.env.HOLDED_API_KEY && (
                    <p className="text-xs text-warning">
                      {uiT("⚠️ HOLDED_API_KEY niet ingesteld — push faalt tot de sleutel op de server staat.")} </p>
                  )}
                  <form action={pushDocumentToHoldedAction.bind(null, id)}>
                    <SubmitButton variant="primary" size="sm" pendingLabel={uiT("Pushen…")}>
                      {uiT("Push naar Holded")} </SubmitButton>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
          )}

          {(doc.kind === "estimate" || doc.status === "draft") && (
            <form action={removeDoc}>
              <ConfirmSubmit
                message={uiT("{v0} {v1} definitief verwijderen?", { v0: kindLabel, v1: doc.docNumber ?? "" })}
                className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
              >
                {kindLabel} {uiT("verwijderen")} </ConfirmSubmit>
            </form>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{uiT("Regels")}</CardTitle>
            </CardHeader>
            {items.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">{uiT("Geen regels.")}</p>
              </CardContent>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <Th>{uiT("Omschrijving")}</Th>
                      <Th>{uiT("Categorie")}</Th>
                      <Th className="text-right">{uiT("Aantal")}</Th>
                      <Th className="text-right">{uiT("Prijs")}</Th>
                      <Th className="text-right">{uiT("Korting")}</Th>
                      <Th className="text-right">{uiT("BTW%")}</Th>
                      <Th className="text-right">{uiT("Netto")}</Th>
                      <Th className="text-right">{uiT("BTW")}</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {items.map((it, i) => (
                      <Tr key={i}>
                        <Td>
                          <span className="font-medium">{it.name}</span>
                          {it.description && (
                            <span className="block text-xs text-muted">{it.description}</span>
                          )}
                        </Td>
                        <Td className="text-muted">{labelForCategory(it.category)}</Td>
                        <Td className="text-right tabular-nums">{it.units}{it.unit ? ` ${it.unit}` : ""}</Td>
                        <Td className="text-right tabular-nums">{formatEUR(it.price)}</Td>
                        <Td className="text-right tabular-nums text-muted">
                          {it.discount ? `${it.discount}%` : "—"}
                        </Td>
                        <Td className="text-right tabular-nums">{it.taxRate ?? 0}%</Td>
                        <Td className="text-right tabular-nums">{formatEUR(lineNet(it))}</Td>
                        <Td className="text-right tabular-nums text-muted">
                          {formatEUR(lineTax(it))}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                <div className="border-t px-5 py-4">
                  <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">{uiT("Subtotaal")}</span>
                      <span className="tabular-nums">{formatEUR(doc.subtotalEur)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">{uiT("BTW")}</span>
                      <span className="tabular-nums">{formatEUR(doc.taxEur)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 text-base font-semibold">
                      <span>{uiT("Totaal")}</span>
                      <span className="tabular-nums">{formatEUR(doc.totalEur)}</span>
                    </div>
                    {costedRevenue > 0 && (
                      <div
                        className={`mt-2 flex justify-between border-t pt-2 text-xs ${docMargin < 0 ? "text-danger" : "text-muted"}`}
                      >
                        <span title={uiT("Interne brutomarge — staat niet op de klant-PDF")}>
                          {uiT("Marge (intern)")} {!marginComplete ? uiT(" · {v0}/{v1} regels", { v0: costedLines, v1: items.length }) : ""}
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatEUR(docMargin)}
                          {docMarginPct != null ? ` · ${docMarginPct}%` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </Card>

          {begroting && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>{uiT("Begroting (intern)")}</CardTitle>
                <span className="text-xs text-muted">
                  {uiT("verkoop · kost · marge per bouwfase — staat niet op de klant-PDF")} </span>
              </CardHeader>
              <CardContent>
                <div className="hidden grid-cols-[1.8fr_1fr_1fr_1.2fr] gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted sm:grid">
                  <span>{uiT("Fase")}</span>
                  <span className="text-right">{uiT("Verkoop")}</span>
                  <span className="text-right">{uiT("Kost")}</span>
                  <span className="text-right">{uiT("Marge")}</span>
                </div>
                {begrotingPerFase.map((f) => {
                  const marge = f.verkoop - f.kost;
                  const pct = f.verkoop > 0 ? (marge / f.verkoop) * 100 : null;
                  return (
                    <details key={f.key} className="group border-b last:border-b-0">
                      <summary className="grid cursor-pointer list-none items-center gap-2 rounded px-2 py-2 text-sm hover:bg-background/60 sm:grid-cols-[1.8fr_1fr_1fr_1.2fr]">
                        <span className="font-medium">
                          <span className="mr-1.5 inline-block text-xs text-muted transition-transform group-open:rotate-90">▸</span>
                          {f.label}
                          <span className="ml-1.5 text-xs font-normal text-muted">
                            {f.lines} {f.lines === 1 ? uiT("regel") : uiT("regels")}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">{formatEUR(f.verkoop)}</span>
                        <span className="text-right tabular-nums text-muted">{formatEUR(f.kost)}</span>
                        <span className={`text-right tabular-nums font-medium ${marge < 0 ? "text-danger" : ""}`}>
                          {formatEUR(marge)}
                          {pct != null ? ` · ${pct.toFixed(0)}%` : ""}
                          {!f.kostCompleet && (
                            <span className="ml-1 font-normal text-muted" title={uiT("Niet elke regel heeft een kostprijs — de echte marge ligt lager")}>
                              *
                            </span>
                          )}
                        </span>
                      </summary>
                      <div className="space-y-1 px-2 pb-2.5 pl-7">
                        {f.regels.map((r, i) => (
                          <div key={i} className="grid items-baseline gap-2 text-xs text-muted sm:grid-cols-[1.8fr_1fr_1fr_1.2fr]">
                            <span>
                              {r.name}
                              <span className="text-muted/70"> — {r.units}{r.unit ? ` ${r.unit}` : uiT("×")}</span>
                            </span>
                            <span className="text-right tabular-nums">{formatEUR(r.verkoop)}</span>
                            <span className="text-right tabular-nums">{r.kost != null ? formatEUR(r.kost) : "—"}</span>
                            <span className="text-right tabular-nums">
                              {r.kost != null ? formatEUR(r.verkoop - r.kost) : uiT("kost onbekend")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
                <div className="grid items-center gap-2 px-2 pt-2.5 text-sm font-semibold sm:grid-cols-[1.8fr_1fr_1fr_1.2fr]">
                  <span>{uiT("Totaal (ex btw)")}</span>
                  <span className="text-right tabular-nums">{formatEUR(begroting.verkoop)}</span>
                  <span className="text-right tabular-nums">{formatEUR(begroting.kost)}</span>
                  <span className={`text-right tabular-nums ${begroting.verkoop - begroting.kost < 0 ? "text-danger" : ""}`}>
                    {formatEUR(begroting.verkoop - begroting.kost)}
                    {begroting.verkoop > 0
                      ? ` · ${(((begroting.verkoop - begroting.kost) / begroting.verkoop) * 100).toFixed(1).replace(".", ",")}%`
                      : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {begroting.kostCompleet ? "" : uiT("* Regels zonder kostprijs tellen als € 0 kost — de echte marge ligt daar lager. ")}
                  {uiT("Bij akkoord worden deze fases automatisch de budgetregels van het project; de nacalculatie op het project vergelijkt ze daarna met de werkelijke kosten.")} </p>
              </CardContent>
            </Card>
          )}

          {doc.notes && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>{uiT("Notities")}</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{doc.notes}</CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{uiT("Tekeningen / bijlagen")}</CardTitle>
              <span className="text-xs text-muted">{uiT("PDF-bestanden (bv. kozijn-tekeningen) — worden meegestuurd in de mail naar de klant")}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachmentLinks.length === 0 ? (
                <p className="text-sm text-muted">{uiT("Nog geen bijlagen.")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {attachmentLinks.map((a) => (
                    <li key={a.path} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            {a.name}
                          </a>
                        ) : (
                          a.name
                        )}
                        <span className="ml-2 text-xs text-muted">{(a.size / 1024).toFixed(0)} {uiT("kB")}</span>
                      </span>
                      <form action={deleteDocumentAttachment.bind(null, doc.id, a.path)}>
                        <ConfirmSubmit
                          message={uiT("Bijlage \"{v0}\" verwijderen?", { v0: a.name })}
                          className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                          {uiT("Verwijderen")} </ConfirmSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <DocumentAttachmentsUploader
                documentId={doc.id}
                signAction={signDocumentUploadAction}
                attachAction={attachDocumentFiles}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
