import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Card,
  CardHeader,
  CardTitle,
  Field,
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
import { markAsReseller } from "./actions";

export const metadata = { title: "Wederverkopers" };

export default async function WederverkopersPage() {
  const [resellers, summaryRows, allContacts] = await Promise.all([
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email, phone: contacts.phone })
      .from(contacts)
      .where(eq(contacts.type, "reseller"))
      .orderBy(asc(contacts.name)),
    db
      .select({
        resellerId: consignments.resellerId,
        products: sql<number>`count(*)::int`,
        inStoreQty: sql<number>`coalesce(sum(${consignments.qtyPlaced} - ${consignments.qtySold}), 0)::float8`,
        // Live dealerprijs: override → particulier −25% → momentopname.
        inStoreValue: sql<number>`coalesce(sum((${consignments.qtyPlaced} - ${consignments.qtySold}) * coalesce(${products.dealerPriceEur}, ${products.priceEur} * 0.75, ${consignments.dealerPriceEur}, 0)), 0)::float8`,
        soldValue: sql<number>`coalesce(sum(${consignments.qtySold} * coalesce(${products.dealerPriceEur}, ${products.priceEur} * 0.75, ${consignments.dealerPriceEur}, 0)), 0)::float8`,
      })
      .from(consignments)
      .leftJoin(products, eq(consignments.productId, products.id))
      .groupBy(consignments.resellerId),
    db.select({ id: contacts.id, name: contacts.name, type: contacts.type }).from(contacts).orderBy(asc(contacts.name)),
  ]);

  const byId = new Map(summaryRows.map((s) => [s.resellerId, s]));
  const totals = summaryRows.reduce(
    (s, r) => {
      s.inStoreValue += Number(r.inStoreValue);
      s.soldValue += Number(r.soldValue);
      return s;
    },
    { inStoreValue: 0, soldValue: 0 },
  );

  const contactOptions: ComboOption[] = allContacts
    .filter((c) => c.type !== "reseller")
    .map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <PageHeader title="Wederverkopers" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Wederverkopers" value={String(resellers.length)} tone="neutral" />
        <StatTile
          label="Nu in winkels"
          value={formatEUR(totals.inStoreValue)}
          hint="consignatievoorraad · dealerprijs · ex. BTW"
          tone={totals.inStoreValue > 0 ? "info" : "neutral"}
        />
        <StatTile
          label="Verkocht via dealers"
          value={formatEUR(totals.soldValue)}
          hint="onze omzet · dealerprijs · ex. BTW"
          tone={totals.soldValue > 0 ? "success" : "neutral"}
        />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Nieuwe wederverkoper</CardTitle>
          <span className="text-xs text-muted">markeer een bestaand contact als wederverkoper</span>
        </CardHeader>
        <form action={markAsReseller} className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Field label="Contact" className="min-w-72 flex-1">
            <Combobox name="contactId" options={contactOptions} placeholder="zoek contact…" />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Als wederverkoper</SubmitButton>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Alle wederverkopers</CardTitle>
        </CardHeader>
        {resellers.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            Nog geen wederverkopers — markeer hierboven een contact.
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Wederverkoper</Th>
                <Th className="text-right">Producten</Th>
                <Th className="text-right">Nu in winkel</Th>
                <Th className="text-right">Verkocht (omzet)</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {resellers.map((r) => {
                const s = byId.get(r.id);
                return (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/wederverkopers/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.email ? <span className="block text-xs text-muted">{r.email}</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{s?.products || "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {s && s.inStoreValue > 0 ? formatEUR(s.inStoreValue) : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {s && s.soldValue > 0 ? formatEUR(s.soldValue) : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/wederverkopers/${r.id}`} className="text-accent hover:underline">
                        openen →
                      </Link>
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
