import { and, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { products, purchaseOrders } from "@/lib/db/schema";
import { nextSequentialSku } from "@/lib/products";
import { formatMoney, poLineTotal, PO_STATUS_META } from "@/lib/purchase-orders";
import { purchaseOrderFileUrl } from "@/lib/storage";
import {
  createProductFromPoLine,
  deletePurchaseOrder,
  pushPurchaseOrderToHolded,
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

  const items = po.items ?? [];
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
    (po.attachments ?? []).map(async (a) => ({ ...a, url: await purchaseOrderFileUrl(a.path) })),
  );

  const meta = PO_STATUS_META[po.status];
  const remove = deletePurchaseOrder.bind(null, id);

  const Action = ({ status, label, variant = "secondary" }: { status: Parameters<typeof setPurchaseOrderStatus>[1]; label: string; variant?: "primary" | "secondary" }) => (
    <form action={setPurchaseOrderStatus.bind(null, id, status)}>
      <button className={buttonClass({ variant, size: "sm" })}>{label}</button>
    </form>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {po.supplier}
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        }
        subtitle={po.reference ? `Referentie ${po.reference}` : undefined}
        actions={
          <>
            <LinkButton href="/inkooporders" variant="ghost">
              ← Overzicht
            </LinkButton>
            <LinkButton href={`/inkooporders/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
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
                <Td className="font-semibold" colSpan={4}>
                  Totaal
                </Td>
                <Td className="text-right font-semibold tabular-nums">
                  {formatMoney(po.total, po.currency)}
                </Td>
                <Td />
              </Tr>
            </TBody>
          </Table>
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
                    <button className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Push naar Holded
                    </button>
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
                <Button type="submit" variant="ghost" className="text-danger hover:bg-danger/10">
                  Bestelling verwijderen
                </Button>
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
