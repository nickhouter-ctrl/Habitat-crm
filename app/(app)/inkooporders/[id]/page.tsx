import { and, asc, desc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
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
import { products, projects, purchaseInvoiceReviews, purchaseOrders, timeEntries, users } from "@/lib/db/schema";
import { nextSequentialSku } from "@/lib/products";
import {
  formatMoney,
  normalizePoAttachments,
  parsePoLineItems,
  poExVat,
  poLineTotal,
  PO_STATUS_META,
} from "@/lib/purchase-orders";
import { purchaseOrderFileUrl } from "@/lib/storage";
import { Combobox } from "@/components/combobox";
import { PurchaseProjectLink } from "@/components/purchase-project-link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  createProductFromPoLine,
  deletePurchaseOrder,
  markPurchaseOrderPaid,
  linkPurchaseOrderAsHours,
  pushPurchaseOrderToHolded,
  regeneratePurchaseOrderPdfs,
  setPurchaseOrderProject,
  setPurchaseOrderStatus,
} from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    columns: { supplier: true, reference: true },
  });
  return { title: po ? `${po.supplier}${po.reference ? ` · ${po.reference}` : ""}` : "Inkooporder" };
}

const fmtDate = (d: string | Date | null) =>
  d
    ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : "—";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po) notFound();

  // Wie heeft deze factuur goedgekeurd? Staat op de beoordeling uit de wachtrij;
  // inkopen van vóór de goedkeuringspoort (of uit Holded) hebben die niet.
  const [keuring] = await db
    .select({
      status: purchaseInvoiceReviews.status,
      decidedAt: purchaseInvoiceReviews.decidedAt,
      decidedVia: purchaseInvoiceReviews.decidedVia,
      door: users.name,
      doorEmail: users.email,
    })
    .from(purchaseInvoiceReviews)
    .leftJoin(users, eq(users.id, purchaseInvoiceReviews.decidedBy))
    .where(eq(purchaseInvoiceReviews.purchaseOrderId, id))
    .orderBy(desc(purchaseInvoiceReviews.decidedAt))
    .limit(1);

  // Uren die via deze inkooporder op het project staan — om te tonen wat er is
  // geboekt zonder het formulier open te klappen.
  const [urenRij] = await db
    .select({ uren: sql<number>`coalesce(sum(${timeEntries.hours}), 0)::float8` })
    .from(timeEntries)
    .where(eq(timeEntries.purchaseOrderId, id));
  const geboekteUren = urenRij?.uren ? Number(urenRij.uren) : null;

  // Projecten om deze inkoop aan te koppelen (telt dan mee als materiaalkost).
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.status, "active"))
    .orderBy(asc(projects.name));

  const items = parsePoLineItems(po.items);
  const linkedIds = items.map((i) => i.productId).filter(Boolean) as string[];
  const linked = linkedIds.length
    ? await db
        .select({ id: products.id, name: products.name, stockQty: products.stockQty })
        .from(products)
        .where(inArray(products.id, linkedIds))
    : [];
  const stockById = new Map(linked.map((p) => [p.id, p.stockQty]));

  // Per losse regel een voorspelde volgende SKU (default prefix MS).
  const SKU_PREFIX = "MS";
  const hasUnlinked = items.some((it) => !it.productId);
  const existingSkus = hasUnlinked
    ? (
        await db
          .select({ sku: products.sku })
          .from(products)
          .where(and(isNotNull(products.sku), ilike(products.sku, `${SKU_PREFIX}%`)))
      ).map((r) => r.sku)
    : [];
  const predictedSkus: (string | null)[] = [];
  const reservedSkus = [...existingSkus];
  for (const it of items) {
    if (it.productId) {
      predictedSkus.push(null);
    } else {
      const next = nextSequentialSku(SKU_PREFIX, reservedSkus);
      predictedSkus.push(next);
      reservedSkus.push(next);
    }
  }

  const attachments = await Promise.all(
    normalizePoAttachments(po.attachments).map(async (a) => ({
      ...a,
      url: await purchaseOrderFileUrl(a.path),
    })),
  );

  const meta = PO_STATUS_META[po.status];
  const remove = deletePurchaseOrder.bind(null, id);

  // Betaalstatus: "ontvangen" gaat over de goederen — dit gaat over de factuur.
  // Komt automatisch binnen via de Holded-sync (Holded ↔ bank); lokaal kun je 'm
  // handmatig op betaald zetten.
  const poTotal = Number(po.total ?? 0);
  // Kosten/marges rekenen ex. btw; toon dat bedrag hier expliciet naast het totaal.
  const exVat = poExVat(po);
  const poPaid = Number(po.paidEur ?? 0);
  const poPaidFull = !!po.paidAt || (poTotal > 0 && poPaid >= poTotal - 0.01);
  const payBadge =
    po.status === "draft"
      ? null
      : poPaidFull
        ? { tone: "success" as const, label: "Betaald" }
        : poPaid > 0
          ? { tone: "warning" as const, label: "Deels betaald" }
          : { tone: "danger" as const, label: "Openstaand" };

  const Action = ({ status, label, variant = "secondary" }: { status: Parameters<typeof setPurchaseOrderStatus>[1]; label: string; variant?: "primary" | "secondary" }) => (
    <form action={setPurchaseOrderStatus.bind(null, id, status)}>
      <SubmitButton variant={variant} size="sm" pendingLabel="Bezig…">
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {po.supplier}
            {po.kind === "invoice" && <Badge tone="neutral">Factuur / bon</Badge>}
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {payBadge && <Badge tone={payBadge.tone}>{payBadge.label}</Badge>}
          </span>
        }
        subtitle={
          <span>
            {po.reference ? `Referentie ${po.reference}` : ""}
            {keuring?.decidedAt && (
              <span className="text-muted">
                {po.reference ? " · " : ""}
                {keuring.status === "approved" || keuring.status === "superseded" ? "goedgekeurd" : keuring.status} door{" "}
                {keuring.door ?? keuring.doorEmail ?? "onbekend"} op{" "}
                {keuring.decidedAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                {keuring.decidedVia === "mail" ? " (via de knop in de melding)" : ""}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href="/inkooporders" variant="ghost">
              ← Overzicht
            </LinkButton>
            {payBadge && !poPaidFull && (
              <form action={markPurchaseOrderPaid.bind(null, id)}>
                <SubmitButton variant="primary" pendingLabel="Bezig…">
                  Markeer als betaald
                </SubmitButton>
              </form>
            )}
            <LinkButton href={`/inkooporders/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        {items.length === 0 ? (
          // Een factuur van een bouwer heeft vaak geen regels: alleen een
          // totaalbedrag op de PDF. Een lege tabel met kolomkoppen ziet eruit
          // alsof er iets stuk is; dit vertelt wat er aan de hand is.
          <Card>
            <CardHeader>
              <CardTitle>Bedrag</CardTitle>
              <span className="text-xs text-muted">geen regels op deze factuur — alleen een totaal</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold tabular-nums">{formatMoney(po.total, po.currency)}</p>
                  <p className="text-sm text-muted">
                    incl. btw · {formatMoney(exVat.amount, po.currency)} ex. btw
                    {exVat.vatUnknown && <span className="ml-1 text-warning">(btw niet uitgelezen)</span>}
                  </p>
                </div>
                {attachments.length > 0 && (
                  <p className="text-sm text-muted">De regels staan op de bijlage hiernaast.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th className="text-right">Aantal</Th>
                <Th className="text-right">Stukprijs</Th>
                <Th className="text-right">Regeltotaal</Th>
                <Th className="text-right">Voorraad nu</Th>
              </tr>
            </THead>
            <TBody>
              {items.map((it, i) => {
                const predictedSku = predictedSkus[i];
                const makeProduct = createProductFromPoLine.bind(null, id, i);
                return (
                <Tr key={i}>
                  <Td className="font-medium">
                    {it.productId ? (
                      <Link href={`/products/${it.productId}/edit`} className="hover:underline">
                        {it.name}
                      </Link>
                    ) : (
                      <div className="space-y-1">
                        <span>{it.name}</span>
                        <form action={makeProduct}>
                          <button
                            className={buttonClass({ variant: "secondary", size: "sm" })}
                            title={`Maak product met SKU ${predictedSku}`}
                          >
                            + Maak product ({predictedSku})
                          </button>
                        </form>
                      </div>
                    )}
                    {it.note && <span className="block text-xs text-muted">{it.note}</span>}
                  </Td>
                  <Td className="text-muted">{it.sku ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{Number(it.units).toLocaleString("nl-NL")}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(it.unitPrice, po.currency)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(poLineTotal(it), po.currency)}</Td>
                  <Td className="text-right tabular-nums text-muted">
                    {it.productId && stockById.has(it.productId)
                      ? Number(stockById.get(it.productId) ?? 0).toLocaleString("nl-NL")
                      : "—"}
                  </Td>
                </Tr>
                );
              })}
              <Tr>
                <Td className="text-muted" colSpan={4}>
                  Ex. btw{" "}
                  {exVat.vatUnknown && (
                    <span className="text-xs text-warning">
                      btw onbekend — vul het subtotaal in via Bewerken › Factuur / bon
                    </span>
                  )}
                </Td>
                <Td className="text-right tabular-nums text-muted">
                  {formatMoney(exVat.amount, po.currency)}
                </Td>
                <Td />
              </Tr>
              <Tr>
                <Td className="font-semibold" colSpan={4}>
                  Totaal <span className="text-xs font-normal text-muted">incl. btw</span>
                </Td>
                <Td className="text-right font-semibold tabular-nums">
                  {formatMoney(po.total, po.currency)}
                </Td>
                <Td />
              </Tr>
            </TBody>
          </Table>
        </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Bij welk project hoort deze factuur?</CardTitle>
            <span className="text-xs text-muted">
              bepaalt waar de kosten landen — materiaal telt als inkoop, uren als arbeid
            </span>
          </CardHeader>
          <CardContent>
            <PurchaseProjectLink
              projects={projectRows}
              current={{
                projectId: po.projectId,
                projectName: projectRows.find((p) => p.id === po.projectId)?.name ?? null,
                countAsLabor: po.countAsLabor,
                hours: geboekteUren,
              }}
              suggestion={
                po.suggestedKind || po.suggestedProjectId
                  ? {
                      projectId: po.suggestedProjectId,
                      projectName: projectRows.find((p) => p.id === po.suggestedProjectId)?.name ?? null,
                      kind: (po.suggestedKind as "labor" | "material" | null) ?? null,
                      hours: po.suggestedHours != null ? Number(po.suggestedHours) : null,
                    }
                  : null
              }
              linkAsMaterial={setPurchaseOrderProject.bind(null, id)}
              linkAsHours={linkPurchaseOrderAsHours.bind(null, id)}
            />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Leverancier" value={po.supplier} />
              <Row label="Referentie" value={po.reference ?? "—"} />
              <Row label="Besteld" value={fmtDate(po.orderDate)} />
              <Row label="Verwacht binnen" value={fmtDate(po.expectedDate)} />
              <Row label="Valuta" value={po.currency} />
              <Row label="Voorraad bijgewerkt" value={po.stockAppliedAt ? fmtDate(po.stockAppliedAt) : "Nee"} />
              {po.notes && <p className="whitespace-pre-line border-t pt-2 text-muted">{po.notes}</p>}
            </CardContent>
          </Card>

          {attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bijlagen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {attachments.map((a) => (
                  <div key={a.path} className="flex items-center justify-between gap-2">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-accent hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      <span className="truncate text-muted">{a.name}</span>
                    )}
                    {a.size != null && (
                      <span className="shrink-0 text-xs text-muted">{Math.round(a.size / 1024)} kB</span>
                    )}
                  </div>
                ))}
                {attachments.some((a) => /\.(xlsx|xls|xlsm)$/i.test(a.name)) && (
                  <form action={regeneratePurchaseOrderPdfs.bind(null, id)} className="pt-1.5">
                    <button className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Nette PDF (opnieuw) maken
                    </button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {po.status !== "ordered" && <Action status="ordered" label="Besteld" />}
                {po.status !== "in_transit" && <Action status="in_transit" label="Onderweg" />}
                {po.status !== "received" && (
                  <Action status="received" label="Ontvangen + voorraad bij" variant="primary" />
                )}
                {po.status !== "cancelled" && <Action status="cancelled" label="Annuleren" />}
              </div>
              {!po.stockAppliedAt && (
                <p className="text-xs text-muted">
                  Bij ‘Ontvangen’ worden de aantallen van gekoppelde producten bij de voorraad opgeteld.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Holded</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {po.holdedId ? (
                <p className="text-xs text-muted">
                  Gekoppeld aan Holded (id <span className="font-mono">{po.holdedId}</span>).
                </p>
              ) : (
                <>
                  <form action={pushPurchaseOrderToHolded.bind(null, id)}>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Bezig…">
                      Push naar Holded
                    </SubmitButton>
                  </form>
                  <p className="text-xs text-muted">
                    Maakt deze bestelling als concept-aankoopfactuur in Holded en koppelt 'm.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <form action={remove}>
                <ConfirmSubmit
                  message={`Inkooporder ${po.supplier} definitief verwijderen?`}
                  className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  Bestelling verwijderen
                </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
