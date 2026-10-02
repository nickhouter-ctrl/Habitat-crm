import { tekst as uiTranslation } from '@/lib/i18n/server';
import { tekst, datumTaal } from '@/lib/i18n/server';
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
import { getWindowsDealers } from "@/lib/windows-report";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Wederverkoper") };
}

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
 const t=await tekst(); const dateLocale=await datumTaal();
  const { id } = await params;
  const reseller = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!reseller) notFound();
  const windowsDealers = (await getWindowsDealers()).filter(d => d.contactId === id);

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
      hint: `${t("voorraad")} ${p.stockQty != null ? Number(p.stockQty).toLocaleString(dateLocale) : "—"}${dp != null ? ` · ${t("dealer")} ${formatEUR(dp)}` : ""}`,
    };
  });

  // Actuele (live) dealerprijs + kostprijs uit het product; valt terug op de
  // momentopname als het product niet meer (actief) bestaat.
  const prodById = new Map(productRows.map((p) => [p.id, p]));
  const liveDealer = (c: (typeof rows)[number]): number | null => {
    const p = c.productId ? prodById.get(c.productId) : undefined;
    const dp = p ? dealerPrice(p.priceEur, p.dealerPriceEur) : null;
    return dp ?? (c.dealerPriceEur != null ? Number(c.dealerPriceEur) : null);
  };
  const liveCost = (c: (typeof rows)[number]): number | null => {
    const p = c.productId ? prodById.get(c.productId) : undefined;
    const cost = p?.costEur ?? c.costEur;
    return cost != null ? Number(cost) : null;
  };

  let inStoreValue = 0;
  let soldValue = 0;
  for (const c of rows) {
    const dp = liveDealer(c) ?? 0;
    inStoreValue += (Number(c.qtyPlaced) - Number(c.qtySold)) * dp;
    soldValue += Number(c.qtySold) * dp;
  }

  // Actief = nog in de winkel; gedaan = volledig gefactureerd/verkocht (ingeklapt).
  const activeRows = rows.filter((c) => Number(c.qtyPlaced) - Number(c.qtySold) > 0);
  const doneRows = rows.filter((c) => Number(c.qtyPlaced) - Number(c.qtySold) <= 0 && Number(c.qtyPlaced) > 0);

  const renderRow = (c: (typeof rows)[number], done: boolean) => {
    const placed = Number(c.qtyPlaced);
    const sold = Number(c.qtySold);
    const left = placed - sold;
    const dp = liveDealer(c);
    const margin = dealerMarginPct(dp, liveCost(c));
    const lowMargin = margin != null && margin < DEALER_MIN_MARGIN_PCT;
    return (
      <Tr key={c.id}>
        <Td>
          {c.productName}
          {c.sku ? <span className="block text-xs text-muted">{c.sku}</span> : null}
        </Td>
        <Td className="text-right tabular-nums">{placed.toLocaleString(dateLocale)}</Td>
        <Td className="text-right tabular-nums">{sold.toLocaleString(dateLocale)}</Td>
        <Td className="text-right tabular-nums font-medium">{left.toLocaleString(dateLocale)}</Td>
        <Td className="text-right tabular-nums">{dp != null ? formatEUR(dp) : "—"}</Td>
        <Td className="text-right tabular-nums">
          {margin != null ? (
            <Badge tone={margin < 0 ? "danger" : lowMargin ? "warning" : "success"}>{margin}%</Badge>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Td>
        <Td>
          {done ? (
            <Badge tone="neutral">{t("gefactureerd / verkocht")}</Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <form action={recordConsignmentSale.bind(null, id, c.id)} className="flex items-center gap-1">
                <Input name="qty" inputMode="decimal" placeholder={t("aant.")} className="h-8 w-16 px-2 py-1 text-right" />
                <SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">{t("verkocht")}</SubmitButton>
              </form>
              <form action={returnConsignment.bind(null, id, c.id)} className="flex items-center gap-1">
                <Input name="qty" inputMode="decimal" placeholder={t("aant.")} className="h-8 w-16 px-2 py-1 text-right" />
                <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">{t("retour")}</SubmitButton>
              </form>
            </div>
          )}
        </Td>
      </Tr>
    );
  };

  const headerRow = (
    <tr>
      <Th>{t("Product")}</Th>
      <Th className="text-right">{t("Geplaatst")}</Th>
      <Th className="text-right">{t("Verkocht")}</Th>
      <Th className="text-right">{t("Nu in winkel")}</Th>
      <Th className="text-right">{t("Dealerprijs")}</Th>
      <Th className="text-right">{t("Onze marge (op kostprijs)")}</Th>
      <Th>{t("Acties")}</Th>
    </tr>
  );

  return (
    <>
      <PageHeader
        title={reseller.name}
        subtitle={t("Wederverkoper · consignatievoorraad")}
        actions={
          <Link href="/wederverkopers" className="text-sm text-muted hover:underline">
            {t("← Alle wederverkopers")} </Link>
        }
      />

      <Card className="mb-5 p-5">
        <Link href={`/wederverkopers/${id}/presentatie`} className="font-semibold text-accent hover:underline">{t("Presentatiepakket en verrekeningen →")}</Link>
        <p className="mt-1 text-sm text-muted">{t("Gratis, een eigen bijdrage of verrekenen bij één of meerdere orders. Bekijk de afspraak en het resterende tegoed.")}</p>
      </Card>

      {windowsDealers.length > 0 && <Card className="mb-5 p-4"><Link href={`/contacts/${id}?tab=kozijnen`} className="font-medium text-accent hover:underline">{t("Kozijnen: offertes, orders en betalingen bekijken →")}</Link><p className="mt-1 text-xs text-muted">{t("Gekoppeld aan")} {windowsDealers.map(d => d.companyName || d.email).join(", ")} {t("in Habitat One Windows.")}</p></Card>}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("Producten")} value={String(rows.length)} tone="neutral" />
        <StatTile label={t("Nu in winkel")} value={formatEUR(inStoreValue)} hint={t("dealerprijs · ex. BTW")} tone={inStoreValue > 0 ? "info" : "neutral"} />
        <StatTile label={t("Verkocht (omzet)")} value={formatEUR(soldValue)} hint={t("dealerprijs · ex. BTW")} tone={soldValue > 0 ? "success" : "neutral"} />
        <StatTile label={t("Marge-norm")} value={`${DEALER_MIN_MARGIN_PCT}%`} hint={t("minimaal per dealerverkoop")} tone="neutral" />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{t("Product neerleggen")}</CardTitle>
          <span className="text-xs text-muted">{t("gaat van onze voorraad af → consignatie bij")} {reseller.name}</span>
        </CardHeader>
        <form action={placeConsignment.bind(null, id)} className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Field label={t("Product")} className="min-w-72 flex-1">
            <Combobox name="productId" options={productOptions} placeholder={t("zoek product…")} />
          </Field>
          <Field label={t("Aantal")}>
            <Input name="qty" inputMode="decimal" required placeholder={"0"} className="w-24 text-right" />
          </Field>
          <Field label={t("Notitie")} className="min-w-48 flex-1">
            <Input name="note" placeholder={t("optioneel")} />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">{t("+ Neerleggen")}</SubmitButton>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("In consignatie")}</CardTitle>
              <span className="text-xs text-muted">{t("factuur = de producten die nu in de winkel liggen, tegen dealerprijs")}</span>
            </div>
            {inStoreValue > 0 && (
              <form action={createResellerInvoice.bind(null, id)}>
                <SubmitButton size="sm" variant="primary" pendingLabel={t("Aanmaken…")}>
                  {t("Factuur maken (")}{formatEUR(inStoreValue)})
                </SubmitButton>
              </form>
            )}
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">{t("Nog niets neergelegd bij deze wederverkoper.")}</div>
        ) : (
          <>
            <Table>
              <THead>{headerRow}</THead>
              <TBody>
                {activeRows.length > 0 ? (
                  activeRows.map((c) => renderRow(c, false))
                ) : (
                  <Tr>
                    <Td colSpan={7} className="text-sm text-muted">
                      {t("Niets meer in de winkel — alles is gefactureerd. Leg hierboven nieuwe producten neer voor een volgende order.")} </Td>
                  </Tr>
                )}
              </TBody>
            </Table>
            {doneRows.length > 0 && (
              <details className="group border-t">
                <summary className="cursor-pointer list-none px-5 py-3 text-sm text-muted marker:content-none hover:bg-muted/30">
                  <span className="inline-flex items-center gap-2">
                    <span className="transition group-open:rotate-90">▶</span>
                    {t("Gefactureerd / verkocht (")}{doneRows.length}{t(") — klik om te tonen")} </span>
                </summary>
                <Table>
                  <THead>{headerRow}</THead>
                  <TBody>{doneRows.map((c) => renderRow(c, true))}</TBody>
                </Table>
              </details>
            )}
          </>
        )}
      </Card>
    </>
  );
}
