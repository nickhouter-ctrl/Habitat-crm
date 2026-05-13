import { desc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { purchaseOrders } from "@/lib/db/schema";
import { formatMoney, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Inkooporders" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PurchaseOrdersPage() {
  const rows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
    .limit(2000);

  const eurRows = rows.filter((r) => (r.currency ?? "EUR") === "EUR");
  // Aggregaten ex. BTW; concept-facturen worden niet meegeteld.
  const sumEx = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.subtotal ?? r.total ?? 0), 0);
  const totalEur = sumEx(eurRows);
  const open = rows.filter((r) => PO_OPEN_STATUSES.includes(r.status));
  const received = rows.filter((r) => r.status === "received");
  const drafts = rows.filter((r) => r.status === "draft");
  const nonEur = rows.filter((r) => (r.currency ?? "EUR") !== "EUR");

  return (
    <>
      <PageHeader
        title="Inkooporders"
        subtitle={
          `${rows.length} ${rows.length === 1 ? "bestelling/aankoop" : "bestellingen/aankopen"} — incl. aankoopfacturen uit Holded` +
          (nonEur.length ? ` · ${nonEur.length} in vreemde valuta (niet in het totaal)` : "")
        }
        actions={<LinkButton href="/inkooporders/new">Nieuwe bestelling</LinkButton>}
      />

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Aantal" value={rows.length} hint={drafts.length ? `${drafts.length} concept(en) niet meegeteld` : undefined} />
          <StatTile label="Totaal ex. BTW" value={formatEUR(totalEur)} hint="alle aankopen samen" />
          <StatTile label="Onderweg" value={open.length} hint={open.length ? formatEUR(sumEx(open.filter((r) => (r.currency ?? "EUR") === "EUR"))) : "—"} />
          <StatTile label="Ontvangen / gefactureerd" value={received.length} hint={formatEUR(sumEx(received.filter((r) => (r.currency ?? "EUR") === "EUR")))} />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen inkooporders"
          description="Voeg een leveranciersbestelling toe (bv. een KKR/Magic Stone proforma) of synchroniseer met Holded om aankoopfacturen op te halen."
          action={<LinkButton href="/inkooporders/new">Nieuwe bestelling</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Datum</Th>
                <Th>Verwacht</Th>
                <Th className="text-right">Regels</Th>
                <Th className="text-right">Totaal</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((po) => {
                const meta = PO_STATUS_META[po.status];
                return (
                  <Tr key={po.id}>
                    <Td className="font-medium">
                      <Link href={`/inkooporders/${po.id}`} className="hover:underline">
                        {po.supplier}
                      </Link>
                    </Td>
                    <Td className="text-muted">{po.reference ?? "—"}</Td>
                    <Td className="text-muted">{fmtDate(po.orderDate)}</Td>
                    <Td className="text-muted">{fmtDate(po.expectedDate)}</Td>
                    <Td className="text-right tabular-nums text-muted">{po.items?.length ?? 0}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
