import { desc, isNull, sql } from "drizzle-orm";
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

import { SyncHoldedButton } from "./sync-holded-button";

export const metadata = { title: "Inkooporders" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PurchaseOrdersPage() {
  const rows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
    .limit(2000);

  const pendingHolded = rows.filter((r) => !r.holdedId).length;

  const eurRows = rows.filter((r) => (r.currency ?? "EUR") === "EUR");
  // Aggregaten zonder concept-facturen.
  const sumEx = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.subtotal ?? r.total ?? 0), 0);
  const sumIncl = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const totalEurEx = sumEx(eurRows);
  const totalEurIncl = sumIncl(eurRows);
  const open = rows.filter((r) => PO_OPEN_STATUSES.includes(r.status));
  const received = rows.filter((r) => r.status === "received");
  const drafts = rows.filter((r) => r.status === "draft");
  // Te betalen: niet-concept inkoopfacturen die nog niet (volledig) betaald zijn.
  const isFullyPaid = (r: (typeof rows)[number]) =>
    !!r.paidAt || (Number(r.total ?? 0) > 0 && Number(r.paidEur ?? 0) >= Number(r.total ?? 0) - 0.01);
  const unpaid = rows.filter((r) => r.status !== "draft" && !isFullyPaid(r));
  const unpaidTotal = unpaid
    .filter((r) => (r.currency ?? "EUR") === "EUR")
    .reduce((s, r) => s + (Number(r.total ?? 0) - Number(r.paidEur ?? 0)), 0);
  const nonEur = rows.filter((r) => (r.currency ?? "EUR") !== "EUR");

  return (
    <>
      <PageHeader
        title="Inkooporders"
        subtitle={
          `${rows.length} ${rows.length === 1 ? "bestelling/aankoop" : "bestellingen/aankopen"} — incl. aankoopfacturen uit Holded` +
          (nonEur.length ? ` · ${nonEur.length} in vreemde valuta (niet in het totaal)` : "")
        }
        actions={
          <>
            <SyncHoldedButton pendingCount={pendingHolded} />
            <LinkButton href="/inkooporders/bestellen" variant="secondary">
              Bijbestellen
            </LinkButton>
            <LinkButton href="/inkooporders/new">Nieuwe bestelling</LinkButton>
          </>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Aantal" value={rows.length} hint={drafts.length ? `${drafts.length} concept(en) niet meegeteld` : undefined} />
          <StatTile label="Totaal ex. BTW" value={formatEUR(totalEurEx)} hint="zonder concept" />
          <StatTile label="Totaal incl. BTW" value={formatEUR(totalEurIncl)} hint="zonder concept" />
          <StatTile label="Te betalen" value={formatEUR(unpaidTotal)} hint={`${unpaid.length} openstaand`} tone="danger" />
          <StatTile label="Onderweg" value={open.length} hint={open.length ? formatEUR(sumEx(open.filter((r) => (r.currency ?? "EUR") === "EUR"))) : "—"} tone="info" />
          <StatTile label="Ontvangen / gefactureerd" value={received.length} hint={formatEUR(sumEx(received.filter((r) => (r.currency ?? "EUR") === "EUR")))} tone="success" />
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
                <Th className="text-right">Ex. BTW</Th>
                <Th className="text-right">Incl. BTW</Th>
                <Th>Status</Th>
                <Th>Betaald</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((po) => {
                const meta = PO_STATUS_META[po.status];
                const total = Number(po.total ?? 0);
                const paid = Number(po.paidEur ?? 0);
                const paidFull = !!po.paidAt || (total > 0 && paid >= total - 0.01);
                const pay =
                  po.status === "draft"
                    ? null
                    : paidFull
                      ? { tone: "success" as const, label: "Betaald" }
                      : paid > 0
                        ? { tone: "warning" as const, label: "Deels" }
                        : { tone: "danger" as const, label: "Openstaand" };
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
                    <Td className="text-right tabular-nums">{formatMoney(po.subtotal ?? po.total, po.currency)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td>
                      {pay ? (
                        <Badge tone={pay.tone}>{pay.label}</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
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
