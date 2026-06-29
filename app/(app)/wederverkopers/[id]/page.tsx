import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import { consignments, contacts, products } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import { DEALER_MIN_MARGIN_PCT, dealerMarginPct, dealerPrice } from "@/lib/reseller";
import { createResellerInvoice, placeConsignment, recordConsignmentSale, returnConsignment } from "../actions";

export const metadata = { title: "Wederverkoper" };

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reseller = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!reseller) notFound();

  const [rows, productRows] = await Promise.all([
    db.select().from(consignments).where(eq(consignments.resellerId, id)).orderBy(asc(consignments.productName)),
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        stockQty: products.stockQty,
        priceEur: products.priceEur,
        dealerPriceEur: products.dealerPriceEur,
        costEur: products.costEur,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name)),
  ]);

  const productOptions: ComboOption[] = productRows.map((p) => {
    const dp = dealerPrice(p.priceEur, p.dealerPriceEur);
    return {
      value: p.id,
      label: p.sku ? `${p.name} · ${p.sku}` : p.name,
      hint: `voorraad ${p.stockQty != null ? Number(p.stockQty).toLocaleString("nl-NL") : "—"}${dp != null ? ` · dealer ${formatEUR(dp)}` : ""}`,
    };
  });

  let inStoreValue = 0;
  let soldValue = 0;
  for (const c of rows) {
    const dp = Number(c.dealerPriceEur ?? 0);
    inStoreValue += (Number(c.qtyPlaced) - Number(c.qtySold)) * dp;
    soldValue += Number(c.qtySold) * dp;
  }

  return (
    <>
      <PageHeader
        title={reseller.name}
        subtitle="Wederverkoper · consignatievoorraad"
        actions={
          <Link href="/wederverkopers" className="text-sm text-muted hover:underline">
            ← Alle wederverkopers
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Producten" value={String(rows.length)} tone="neutral" />
        <StatTile label="Nu in winkel" value={formatEUR(inStoreValue)} hint="dealerprijs · ex. BTW" tone={inStoreValue > 0 ? "info" : "neutral"} />
        <StatTile label="Verkocht (omzet)" value={formatEUR(soldValue)} hint="dealerprijs · ex. BTW" tone={soldValue > 0 ? "success" : "neutral"} />
        <StatTile label="Marge-norm" value={`${DEALER_MIN_MARGIN_PCT}%`} hint="minimaal per dealerverkoop" tone="neutral" />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Product neerleggen</CardTitle>
          <span className="text-xs text-muted">gaat van onze voorraad af → consignatie bij {reseller.name}</span>
        </CardHeader>
        <form action={placeConsignment.bind(null, id)} className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Field label="Product" className="min-w-72 flex-1">
            <Combobox name="productId" options={productOptions} placeholder="zoek product…" />
          </Field>
          <Field label="Aantal">
            <Input name="qty" inputMode="decimal" required placeholder="0" className="w-24 text-right" />
          </Field>
          <Field label="Notitie" className="min-w-48 flex-1">
            <Input name="note" placeholder="optioneel" />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Neerleggen</SubmitButton>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>In consignatie</CardTitle>
              <span className="text-xs text-muted">factuur = de producten die nu in de winkel liggen, tegen dealerprijs</span>
            </div>
            {inStoreValue > 0 && (
              <form action={createResellerInvoice.bind(null, id)}>
                <SubmitButton size="sm" variant="primary" pendingLabel="Aanmaken…">
                  Factuur maken ({formatEUR(inStoreValue)})
                </SubmitButton>
              </form>
            )}
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Nog niets neergelegd bij deze wederverkoper.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Geplaatst</Th>
                <Th className="text-right">Verkocht</Th>
                <Th className="text-right">Nu in winkel</Th>
                <Th className="text-right">Dealerprijs</Th>
                <Th className="text-right">Onze marge</Th>
                <Th>Acties</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => {
                const placed = Number(c.qtyPlaced);
                const sold = Number(c.qtySold);
                const left = placed - sold;
                const dp = c.dealerPriceEur != null ? Number(c.dealerPriceEur) : null;
                const margin = dealerMarginPct(dp, c.costEur);
                const lowMargin = margin != null && margin < DEALER_MIN_MARGIN_PCT;
                return (
                  <Tr key={c.id}>
                    <Td>
                      {c.productName}
                      {c.sku ? <span className="block text-xs text-muted">{c.sku}</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{placed.toLocaleString("nl-NL")}</Td>
                    <Td className="text-right tabular-nums">{sold.toLocaleString("nl-NL")}</Td>
                    <Td className="text-right tabular-nums font-medium">{left.toLocaleString("nl-NL")}</Td>
                    <Td className="text-right tabular-nums">{dp != null ? formatEUR(dp) : "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {margin != null ? (
                        <Badge tone={margin < 0 ? "danger" : lowMargin ? "warning" : "success"}>{margin}%</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={recordConsignmentSale.bind(null, id, c.id)} className="flex items-center gap-1">
                          <Input name="qty" inputMode="decimal" placeholder="aant." className="h-8 w-16 px-2 py-1 text-right" />
                          <SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">verkocht</SubmitButton>
                        </form>
                        <form action={returnConsignment.bind(null, id, c.id)} className="flex items-center gap-1">
                          <Input name="qty" inputMode="decimal" placeholder="aant." className="h-8 w-16 px-2 py-1 text-right" />
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">retour</SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
