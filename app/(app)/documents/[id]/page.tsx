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
import { documents, holdedSyncMap, products } from "@/lib/db/schema";
import { SubmitButton } from "@/components/submit-button";
import { lineNet, lineTax, normalizeDocItems } from "@/lib/documents";
import { labelForCategory } from "@/lib/products";
import { formatDate, formatEUR } from "@/lib/utils";
import {
  applyStockOutFromDocument,
  createDeliveryNoteFromDocument,
  createInvoiceFromEstimate,
  deleteDocument,
  pushDocumentToHoldedAction,
  reverseStockOutFromDocument,
  setDeliveryNoteDelivered,
  setDocumentStatus,
  toggleReserveEstimate,
} from "../actions";
import { documentKindMeta, documentStatusMeta } from "../../_meta";
import { ConfirmSubmit } from "@/components/confirm-submit";

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
      contact: { columns: { id: true, name: true, email: true } },
      company: { columns: { id: true, name: true } },
      deal: { columns: { id: true, title: true } },
      property: { columns: { id: true, title: true } },
      project: { columns: { id: true, name: true } },
    },
  });
  if (!doc) notFound();

  const holdedMap = await db.query.holdedSyncMap.findFirst({
    where: and(eq(holdedSyncMap.entityType, "document"), eq(holdedSyncMap.localId, id)),
  });

  // Offerte ↔ factuur-koppeling: welke facturen zijn van deze offerte gemaakt
  // (incl. deelfacturen), en — voor een factuur — uit welke offerte komt hij.
  const linkedInvoices =
    doc.kind === "estimate"
      ? await db.query.documents.findMany({
          where: and(eq(documents.sourceDocumentId, id), ne(documents.status, "void")),
          columns: {
            id: true,
            docNumber: true,
            status: true,
            totalEur: true,
            paidEur: true,
            issueDate: true,
          },
          orderBy: [asc(documents.issueDate)],
        })
      : [];
  const sourceEstimate =
    doc.kind === "invoice" && doc.sourceDocumentId
      ? await db.query.documents.findFirst({
          where: eq(documents.id, doc.sourceDocumentId),
          columns: { id: true, docNumber: true, status: true },
        })
      : null;
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

  // Hoeveel van de offerte is al gefactureerd? (voor deelfacturen)
  const invoicedTotal = linkedInvoices.reduce((s, inv) => s + Number(inv.totalEur ?? 0), 0);
  const estimateTotal = Number(doc.totalEur ?? 0);
  const invoicedPct = estimateTotal > 0 ? Math.round((invoicedTotal / estimateTotal) * 100) : 0;
  const fullyInvoiced =
    doc.kind === "estimate" && estimateTotal > 0 && invoicedTotal >= estimateTotal - 0.01;
  const remainingPct = Math.min(100, Math.max(1, 100 - invoicedPct));

  const items = normalizeDocItems(doc.items);

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
          columns: { id: true, sku: true, name: true, costEur: true, stockQty: true, stockMin: true },
        })
      : [];
  const costById = new Map(costRows.map((p) => [p.id, Number(p.costEur ?? 0)]));
  const costBySku = new Map(
    costRows.filter((p) => p.sku).map((p) => [p.sku as string, Number(p.costEur ?? 0)]),
  );
  // Voorraad per product (op id én sku) — voor de tekort-waarschuwing.
  type StockInfo = { sku: string | null; name: string; stock: number; min: number };
  const stockByKey = new Map<string, StockInfo>();
  for (const p of costRows) {
    const info: StockInfo = {
      sku: p.sku,
      name: p.name,
      stock: Number(p.stockQty ?? 0),
      min: Number(p.stockMin ?? 0),
    };
    stockByKey.set(p.id, info);
    if (p.sku) stockByKey.set(p.sku, info);
  }
  // Regels met te weinig / (bijna) geen voorraad t.o.v. het bestelde aantal.
  // Niet tonen zodra de voorraad van dit document al is afgeboekt — dan is de
  // verkoop al uit de voorraad gehaald en zou de melding dubbel tellen.
  const lowStock = (doc.stockAppliedAt ? [] : items)
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
      return { name: (it.name || info.name).trim(), sku: info.sku, stock: info.stock, units, toOrder };
    })
    .filter(
      (x): x is { name: string; sku: string; stock: number; units: number; toOrder: number } => !!x,
    );
  // Marge alleen berekenen over regels waarvoor we een kostprijs kennen — anders
  // telt een regel zonder kostprijs als 100% marge en wordt het percentage te hoog.
  let docCost = 0;
  let costedRevenue = 0;
  let costedLines = 0;
  for (const it of items) {
    const cost =
      (it.productId ? costById.get(it.productId) : undefined) ??
      (it.description ? costBySku.get(it.description.trim()) : undefined);
    if (cost != null && cost > 0) {
      docCost += cost * (Number(it.units) || 0);
      costedRevenue += lineNet(it);
      costedLines++;
    }
  }
  const docMargin = costedRevenue - docCost;
  const docMarginPct = costedRevenue > 0 ? Math.round((docMargin / costedRevenue) * 100) : null;
  const marginComplete = items.length > 0 && costedLines === items.length;

  const partyName = doc.contact?.name ?? doc.company?.name ?? null;
  const kindLabel = documentKindMeta[doc.kind];

  const changeStatus = setDocumentStatus.bind(null, id);
  const removeDoc = deleteDocument.bind(null, id);
  const makeInvoice = createInvoiceFromEstimate.bind(null, id);
  const reserveAction = toggleReserveEstimate.bind(null, id);
  const makeDeliveryNote = createDeliveryNoteFromDocument.bind(null, id);

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
              {documentStatusMeta[doc.status].label}
            </Badge>
            {linkedInvoices.length > 0 && <Badge tone="success">Gefactureerd</Badge>}
          </span>
        }
        subtitle={doc.title ?? (partyName ? `Voor ${partyName}` : undefined)}
        actions={
          <>
            <Link href={doc.kind === "invoice" ? "/invoices" : "/quotes"} className="text-sm text-muted hover:underline">
              ← Terug
            </Link>
            <a
              href={`/documents/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              PDF
            </a>
            <LinkButton href={`/documents/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      {lowStock.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-amber-900">
              ⚠️ {lowStock.length} product{lowStock.length === 1 ? "" : "en"} (bijna) niet op voorraad
            </p>
            <LinkButton
              href={`/bestellen?q=${encodeURIComponent(lowStock[0].sku)}`}
              variant="primary"
              className="text-xs"
            >
              → Bestellen
            </LinkButton>
          </div>
          <ul className="space-y-1 text-xs text-amber-900">
            {lowStock.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-amber-700">{p.sku}</span>
                <span className="text-amber-700">
                  · voorraad {p.stock}, nodig {p.units}
                </span>
                {p.toOrder > 0 && (
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium">
                    minimaal bestellen: {p.toOrder}
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
            ✓ Pakbon <strong>{pakbonDoc.docNumber ?? ""}</strong> klaargezet met dezelfde regels (zonder prijzen).
          </span>
          <Link href={`/documents/${pakbonDoc.id}`} className="font-medium text-accent hover:underline">
            Open pakbon →
          </Link>
        </div>
      )}

      {doc.kind === "estimate" && linkedInvoices.length > 0 && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-4">
          <p className="mb-2 text-sm font-medium">
            Gefactureerd — {linkedInvoices.length} factu{linkedInvoices.length === 1 ? "ur" : "ren"} van deze offerte
          </p>
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
                    {inv.docNumber ?? "(concept)"}
                  </Link>
                  <Badge tone={documentStatusMeta[inv.status].tone}>
                    {documentStatusMeta[inv.status].label}
                  </Badge>
                  <span className="tabular-nums">{formatEUR(total)}</span>
                  <span className="text-muted">· {betaling}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {doc.kind === "invoice" && sourceEstimate && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">Gemaakt van offerte</span>
          <Link href={`/documents/${sourceEstimate.id}`} className="font-medium text-accent hover:underline">
            {sourceEstimate.docNumber ?? "(offerte)"} →
          </Link>
        </div>
      )}

      {doc.kind === "invoice" && linkedDeliveryNotes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted">Pakbon{linkedDeliveryNotes.length === 1 ? "" : "nen"}:</span>
          {linkedDeliveryNotes.map((p) => (
            <Link key={p.id} href={`/documents/${p.id}`} className="flex items-center gap-1.5 hover:underline">
              <span className="font-medium">{p.docNumber ?? "pakbon"}</span>
              {p.deliveredAt ? (
                <Badge tone="success">Afgeleverd {formatDate(p.deliveredAt)}</Badge>
              ) : (
                <Badge tone="neutral">Niet afgeleverd</Badge>
              )}
            </Link>
          ))}
        </div>
      )}

      {sp.voorraad === "dubbel" && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          ⚠ Voorraad is voor deze deal al afgeboekt
          {typeof sp.doc === "string" && sp.doc ? (
            <> op <strong>{sp.doc}</strong></>
          ) : (
            " op een ander document"
          )}{" "}
          — niet nogmaals afgeboekt, zodat je niet dubbel telt.
        </div>
      )}

      {doc.kind === "invoice" &&
        !doc.stockAppliedAt &&
        items.some((it) => it.productId && it.units) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span className="text-warning">
              ⚠ Voorraad voor deze factuur is nog niet afgeboekt. Dit gebeurt automatisch zodra
              de factuur verzonden of betaald is — of doe het nu meteen:
            </span>
            <form action={applyStockOutFromDocument.bind(null, id)}>
              <SubmitButton size="sm" variant="primary" pendingLabel="Bezig…">
                → Voorraad afboeken
              </SubmitButton>
            </form>
          </div>
        )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Klant</dt>
                <dd>
                  {doc.contact ? (
                    <Link href={`/contacts/${doc.contact.id}`} className="hover:underline">
                      {doc.contact.name}
                    </Link>
                  ) : (
                    partyName ?? "—"
                  )}
                </dd>
                <dt className="text-muted">Deal</dt>
                <dd>
                  {doc.deal ? (
                    <Link href={`/deals/${doc.deal.id}`} className="hover:underline">
                      {doc.deal.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Pand</dt>
                <dd>
                  {doc.property ? (
                    <Link href={`/properties/${doc.property.id}`} className="hover:underline">
                      {doc.property.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Project</dt>
                <dd>
                  {doc.project ? (
                    <Link href={`/projects/${doc.project.id}`} className="hover:underline">
                      {doc.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">Datum</dt>
                <dd>{formatDate(doc.issueDate)}</dd>
                <dt className="text-muted">Vervaldatum</dt>
                <dd>{formatDate(doc.dueDate)}</dd>
                <dt className="text-muted">Betaald</dt>
                <dd className="tabular-nums">{formatEUR(doc.paidEur)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versturen & status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <LinkButton href={`/documents/${id}/verzenden`} size="sm">
                {doc.sentAt ? "Opnieuw versturen" : "Versturen naar klant"}
              </LinkButton>

              {sp.verzonden === "bezig" && (
                <p className="rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
                  📨 De mail wordt op de achtergrond verstuurd — je kunt gewoon verder. In de
                  tijdlijn verschijnt zo de bevestiging.
                </p>
              )}
              {sp.verzonden === "verzonden" && (
                <p className="rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
                  ✓ Mail verstuurd naar de klant.
                </p>
              )}
              {sp.verzonden === "geenmail" && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  De klant-link is aangemaakt, maar de mail kon niet verstuurd worden.
                </p>
              )}
              {sp.verzonden === "geenadres" && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  Verstuurd zonder mail — dit contact heeft geen e-mailadres.
                </p>
              )}

              {doc.sentAt && (
                <div className="space-y-1.5 rounded-md bg-background px-3 py-2">
                  <p className="text-muted">
                    Verstuurd op <span className="text-foreground">{formatDate(doc.sentAt)}</span>
                  </p>
                  {publicUrl && (
                    <p className="break-all">
                      Klant-link:{" "}
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {publicUrl}
                      </a>
                    </p>
                  )}
                  {doc.acceptedAt ? (
                    <p className="font-medium text-success">
                      ✓ Geaccepteerd door klant op {formatDate(doc.acceptedAt)}
                    </p>
                  ) : doc.rejectedAt ? (
                    <p className="text-danger">
                      Afgewezen op {formatDate(doc.rejectedAt)}
                      {doc.rejectReason ? ` — ${doc.rejectReason}` : ""}
                    </p>
                  ) : (
                    <p className="text-muted">Nog geen reactie van de klant.</p>
                  )}
                </div>
              )}

              {doc.kind === "estimate" && (
                <form action={reserveAction} className="rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">
                    {doc.reservedAt ? "✓ Producten gereserveerd" : "Producten reserveren"}
                  </p>
                  <p className="mb-2 text-[11px] text-muted">
                    {doc.reservedAt
                      ? `Sinds ${formatDate(doc.reservedAt)} — telt mee als gereserveerde voorraad op het dashboard.`
                      : "Zet de producten alvast op gereserveerd, zodat je op het dashboard ziet wat besteld moet worden."}
                  </p>
                  <SubmitButton size="sm" variant={doc.reservedAt ? "ghost" : "secondary"} pendingLabel="Bezig…">
                    {doc.reservedAt ? "Reservering opheffen" : "🔖 Reserveren"}
                  </SubmitButton>
                </form>
              )}

              {doc.kind === "estimate" && fullyInvoiced && (
                <div className="rounded-md bg-background px-3 py-2.5 text-xs text-muted">
                  ✓ Volledig gefactureerd ({invoicedPct}%). Zie de gekoppelde factu
                  {linkedInvoices.length === 1 ? "ur" : "ren"} bovenaan.
                </div>
              )}

              {doc.kind === "estimate" && !fullyInvoiced && (
                <form action={makeInvoice} className="space-y-2 rounded-md bg-background px-3 py-2.5">
                  <p className="text-xs font-medium text-muted">Factuur maken van deze offerte</p>
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
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Bezig…">
                      → Maak factuur
                    </SubmitButton>
                  </div>
                  <p className="text-xs text-muted">
                    {invoicedPct > 0
                      ? `Al ${invoicedPct}% gefactureerd — dit maakt een factuur voor de rest.`
                      : "Bijv. 50 voor een aanbetaling; maak daarna een tweede factuur voor het restant."}
                  </p>
                </form>
              )}
              {doc.kind !== "deliverynote" && (
                <form action={makeDeliveryNote}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Bezig…">
                    → Maak pakbon
                  </SubmitButton>
                </form>
              )}
              {(doc.kind === "deliverynote" || doc.kind === "invoice") && doc.stockAppliedAt && (
                <div className="space-y-1">
                  <p className="text-xs text-success">
                    ✓ Voorraad afgeboekt op {new Date(doc.stockAppliedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <form action={reverseStockOutFromDocument.bind(null, id)}>
                    <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="Bezig…">
                      Voorraad-afboeking ongedaan maken
                    </SubmitButton>
                  </form>
                </div>
              )}
              {doc.kind === "deliverynote" ? (
                // Een pakbon is een leverdocument: alleen klaargezet → afgeleverd.
                <div className="pt-1">
                  {doc.deliveredAt ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-success">
                        ✓ Afgeleverd op {formatDate(doc.deliveredAt)}
                      </span>
                      <form action={setDeliveryNoteDelivered.bind(null, id, false)}>
                        <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">
                          Ongedaan maken
                        </SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <form action={setDeliveryNoteDelivered.bind(null, id, true)}>
                      <SubmitButton size="sm" variant="primary" pendingLabel="Bezig…">
                        → Markeer als afgeleverd
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <>
                  <form action={changeStatus} className="flex items-center gap-2 pt-1">
                    <Select name="status" defaultValue={doc.status} className="flex-1">
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {documentStatusMeta[s].label}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Bezig…">
                      Status bijwerken
                    </SubmitButton>
                  </form>
                  <form action={changeStatus}>
                    <input type="hidden" name="status" value="paid" />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Bezig…">
                      Markeer betaald
                    </SubmitButton>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Holded</CardTitle>
              {(holdedMap || doc.holdedId) && <Badge tone="success">✓ gekoppeld</Badge>}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {sp.holded === "ok" && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
                  Naar Holded gepusht{typeof sp.hid === "string" ? ` (id ${sp.hid})` : ""}.
                </p>
              )}
              {typeof sp.holdedError === "string" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
                  Push mislukt: {sp.holdedError}
                </p>
              )}
              {holdedMap || doc.holdedId ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-muted">Holded-id</dt>
                  <dd className="font-mono text-xs">{holdedMap?.holdedId ?? doc.holdedId}</dd>
                  <dt className="text-muted">Laatste sync</dt>
                  <dd>{formatDate(holdedMap?.lastSyncedAt)}</dd>
                </dl>
              ) : (
                <>
                  <p className="text-muted">Nog niet naar Holded gepusht.</p>
                  {!process.env.HOLDED_API_KEY && (
                    <p className="text-xs text-warning">
                      ⚠️ HOLDED_API_KEY niet ingesteld — push faalt tot de sleutel op de server staat.
                    </p>
                  )}
                  <form action={pushDocumentToHoldedAction.bind(null, id)}>
                    <SubmitButton variant="primary" size="sm" pendingLabel="Pushen…">
                      Push naar Holded
                    </SubmitButton>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          {(doc.kind === "estimate" || doc.status === "draft") && (
            <form action={removeDoc}>
              <ConfirmSubmit
                message={`${kindLabel} ${doc.docNumber ?? ""} definitief verwijderen?`}
                className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
              >
                {kindLabel} verwijderen
              </ConfirmSubmit>
            </form>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Regels</CardTitle>
            </CardHeader>
            {items.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen regels.</p>
              </CardContent>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <Th>Omschrijving</Th>
                      <Th>Categorie</Th>
                      <Th className="text-right">Aantal</Th>
                      <Th className="text-right">Prijs</Th>
                      <Th className="text-right">Korting</Th>
                      <Th className="text-right">BTW%</Th>
                      <Th className="text-right">Netto</Th>
                      <Th className="text-right">BTW</Th>
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
                        <Td className="text-right tabular-nums">{it.units}</Td>
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
                      <span className="text-muted">Subtotaal</span>
                      <span className="tabular-nums">{formatEUR(doc.subtotalEur)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">BTW</span>
                      <span className="tabular-nums">{formatEUR(doc.taxEur)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 text-base font-semibold">
                      <span>Totaal</span>
                      <span className="tabular-nums">{formatEUR(doc.totalEur)}</span>
                    </div>
                    {costedRevenue > 0 && (
                      <div
                        className={`mt-2 flex justify-between border-t pt-2 text-xs ${docMargin < 0 ? "text-danger" : "text-muted"}`}
                      >
                        <span title="Interne brutomarge — staat niet op de klant-PDF">
                          Marge (intern)
                          {!marginComplete ? ` · ${costedLines}/${items.length} regels` : ""}
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

          {doc.notes && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Notities</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{doc.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
