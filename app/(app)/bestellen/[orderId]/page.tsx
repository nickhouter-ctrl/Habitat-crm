import { asc, eq } from "drizzle-orm";
import { FileDown, Mail, Send, Trash2, Undo2 } from "lucide-react";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  Badge,
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
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { supplierOrderItems, supplierOrders } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { deleteOrder, markOrderSent, reopenOrder } from "../actions";

export const metadata = { title: "Bestelbon" };
export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = { stuk: "stuk", doos: "doos", m2: "m²" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await db.query.supplierOrders.findFirst({
    where: eq(supplierOrders.id, orderId),
  });
  if (!order) notFound();

  const items = await db
    .select()
    .from(supplierOrderItems)
    .where(eq(supplierOrderItems.orderId, orderId))
    .orderBy(asc(supplierOrderItems.skuSnapshot));

  const isSent = order.status === "sent";
  const orderNo = order.id.slice(0, 8).toUpperCase();

  // E-mail-tekst (mens-in-de-lus: medewerker verstuurt zelf en hangt de PDF eraan).
  const lines = items
    .map((it) => `• ${it.skuSnapshot}  —  ${it.description}${it.size ? ` · ${it.size}` : ""}  ×  ${Number(it.qty)} ${UNIT_LABEL[it.unit] ?? it.unit}`)
    .join("\n");
  const subject = `Purchase order ${COMPANY.name} — ${orderNo}`;
  const body = `Dear ${order.supplierName},\n\nWe would like to order the following${order.customerRef ? ` (ref. ${order.customerRef})` : ""}:\n\n${lines}\n\n${order.notes ? order.notes + "\n\n" : ""}Please find the full purchase order attached as a PDF.\n\nKind regards,\n${COMPANY.name}\n${COMPANY.email} · ${COMPANY.phone}`;
  const mailto = `mailto:${order.supplierEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bestelbon — ${order.supplierName}`}
        subtitle={`Nr. ${orderNo} · ${formatDate(order.createdAt)}`}
        actions={
          <div className="flex gap-2">
            <LinkButton href="/bestellen" variant="secondary">
              ← Terug
            </LinkButton>
            <a
              href={`/bestellen/${order.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              <FileDown className="h-4 w-4" /> PDF
            </a>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Badge tone={isSent ? "info" : "neutral"}>{isSent ? "Verstuurd" : "Concept"}</Badge>
        {order.supplierEmail ? (
          <span className="text-sm text-muted">{order.supplierEmail}</span>
        ) : (
          <span className="text-sm text-warning">Geen leverancier-e-mail ingevuld</span>
        )}
        {isSent && order.sentAt ? (
          <span className="text-sm text-muted">verstuurd {formatDate(order.sentAt)}</span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regels ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>SKU</Th>
                <Th>Omschrijving</Th>
                <Th>Maat</Th>
                <Th>Aantal</Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((it) => (
                <Tr key={it.id}>
                  <Td className="font-mono text-xs">{it.skuSnapshot}</Td>
                  <Td>{it.description}</Td>
                  <Td>{it.size ?? "—"}</Td>
                  <Td>
                    {Number(it.qty)} {UNIT_LABEL[it.unit] ?? it.unit}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* e-mail preview */}
      <Card>
        <CardHeader>
          <CardTitle>E-mail naar leverancier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted">
            Controleer de tekst, download de PDF en hang die als bijlage. Niets wordt
            automatisch verstuurd.
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold">Onderwerp: {subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-foreground">{body}</pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={mailto} className={buttonClass()}>
              <Mail className="h-4 w-4" /> Open in mailprogramma
            </a>
            <a
              href={`/bestellen/${order.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              <FileDown className="h-4 w-4" /> Download PDF voor bijlage
            </a>
          </div>
        </CardContent>
      </Card>

      {/* status-acties */}
      <div className="flex flex-wrap gap-2">
        {isSent ? (
          <form action={reopenOrder}>
            <input type="hidden" name="id" value={order.id} />
            <button type="submit" className={buttonClass({ variant: "secondary" })}>
              <Undo2 className="h-4 w-4" /> Terug naar concept
            </button>
          </form>
        ) : (
          <form action={markOrderSent}>
            <input type="hidden" name="id" value={order.id} />
            <ConfirmSubmit
              className={buttonClass()}
              message={`Bestelbon voor ${order.supplierName} als verstuurd markeren?`}
            >
              <Send className="h-4 w-4" /> Markeer als verstuurd
            </ConfirmSubmit>
          </form>
        )}
        <form action={deleteOrder}>
          <input type="hidden" name="id" value={order.id} />
          <ConfirmSubmit
            className={buttonClass({ variant: "ghost" })}
            message="Deze bestelbon verwijderen?"
          >
            <Trash2 className="h-4 w-4" /> Verwijderen
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}
