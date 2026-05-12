import { desc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
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
import { purchaseOrders } from "@/lib/db/schema";
import { formatMoney, PO_STATUS_META } from "@/lib/purchase-orders";

export const metadata = { title: "Inkooporders" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PurchaseOrdersPage() {
  const rows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
    .limit(500);

  return (
    <>
      <PageHeader
        title="Inkooporders"
        subtitle="Binnenkomende leveranciersbestellingen — bij ‘ontvangen’ wordt de voorraad bijgewerkt."
        actions={<LinkButton href="/inkooporders/new">Nieuwe bestelling</LinkButton>}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen inkooporders"
          description="Voeg een leveranciersbestelling toe (bv. een KKR/Magic Stone proforma) om aankomende voorraad bij te houden."
          action={<LinkButton href="/inkooporders/new">Nieuwe bestelling</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Besteld</Th>
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
