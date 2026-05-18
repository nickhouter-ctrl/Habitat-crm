/**
 * Shipments-overzicht: alle PO's gegroepeerd, met landed cost per shipment.
 * Per PO toon: aantal gelinkte mails + bijlagen per categorie + totaal kosten.
 */
import { desc, eq, sql } from "drizzle-orm";
import { Boxes, FileText, Mail, Package, AlertCircle } from "lucide-react";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments, purchaseOrders } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/email-attachments";
import { cn, formatEUR } from "@/lib/utils";

export const metadata = { title: "Shipments" };
export const dynamic = "force-dynamic";

const CATEGORY_ICONS: Record<string, string> = {
  "supplier-invoice": "🧾",
  "agent-fee-china": "🤝",
  "agent-fee-spain": "🇪🇸",
  "freight-invoice": "🚛",
  "customs-dua": "📋",
  "opex": "🏢",
  "bank-statement": "🏦",
  "quote-proforma": "📝",
  "certificate": "📜",
  "other": "📎",
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ShipmentsPage() {
  // Haal alle PO's + gegroepeerde bijlage-statistieken
  const data = await db.execute<{
    po_id: string;
    supplier: string;
    reference: string | null;
    status: string;
    order_date: string | null;
    total: string;
    n_mails: number;
    n_attachments: number;
    breakdown: Array<{ category: string; n: number; amount: number }>;
    landed_total: number;
  }>(sql`
    SELECT
      po.id AS po_id,
      po.supplier,
      po.reference,
      po.status,
      po.order_date::text AS order_date,
      po.total::text AS total,
      COALESCE(stats.n_mails, 0) AS n_mails,
      COALESCE(stats.n_attachments, 0) AS n_attachments,
      COALESCE(stats.breakdown, '[]'::jsonb) AS breakdown,
      COALESCE(stats.landed_total, 0) AS landed_total
    FROM purchase_orders po
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT e.id) AS n_mails,
        COUNT(a.id) AS n_attachments,
        SUM(COALESCE(a.amount_eur, 0)) AS landed_total,
        jsonb_agg(jsonb_build_object('category', a.category, 'amount', COALESCE(a.amount_eur, 0)) ORDER BY a.received_at) FILTER (WHERE a.id IS NOT NULL) AS breakdown
      FROM email_inbox e
      LEFT JOIN mail_attachments a ON a.email_id = e.id
      WHERE e.linked_purchase_order_id = po.id
    ) stats ON TRUE
    ORDER BY po.order_date DESC NULLS LAST, po.created_at DESC
    LIMIT 200
  `);

  const rows = (data as unknown as Array<typeof data extends ReadonlyArray<infer T> ? T : never>) ?? [];

  // Stats overall
  const totals = {
    posWithMails: rows.filter((r) => Number(r.n_mails) > 0).length,
    posWithoutMails: rows.filter((r) => Number(r.n_mails) === 0).length,
    totalAttachments: rows.reduce((s, r) => s + Number(r.n_attachments), 0),
  };

  return (
    <>
      <PageHeader
        title="Shipments overzicht"
        subtitle={`${rows.length} PO's totaal · ${totals.posWithMails} met gelinkte facturen · ${totals.totalAttachments} bijlagen`}
      />

      {/* Quick stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Package className="h-4 w-4" />
            <span>PO's met facturen</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totals.posWithMails}</p>
          <p className="text-xs text-muted">Volledig of deels gelinkt</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <AlertCircle className="h-4 w-4 text-warning" />
            <span>PO's zonder facturen</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totals.posWithoutMails}</p>
          <p className="text-xs text-muted">Te linken via /inbox</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <FileText className="h-4 w-4" />
            <span>Totaal bijlagen</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totals.totalAttachments}</p>
          <p className="text-xs text-muted">In archief gekoppeld</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Geen shipments" description="Importeer eerst PO's via Holded-sync of maak handmatig PO's aan." />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Datum</Th>
                <Th>Leverancier · referentie</Th>
                <Th>Status</Th>
                <Th>PO-totaal</Th>
                <Th>Facturen</Th>
                <Th>Categorie-breakdown</Th>
                <Th className="text-right">Landed extra</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const breakdown = Array.isArray(r.breakdown) ? r.breakdown : [];
                const byCategory = new Map<string, { count: number; amount: number }>();
                for (const b of breakdown) {
                  const e = byCategory.get(b.category) ?? { count: 0, amount: 0 };
                  e.count++;
                  e.amount += Number(b.amount ?? 0);
                  byCategory.set(b.category, e);
                }
                const poTotal = Number(r.total ?? 0);
                const overhead = Number(r.landed_total ?? 0);
                const overheadPct = poTotal > 0 ? (overhead / poTotal) * 100 : 0;

                return (
                  <Tr key={r.po_id}>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      {formatDate(r.order_date)}
                    </Td>
                    <Td className="max-w-[18rem]">
                      <Link
                        href={`/inkooporders/${r.po_id}/kostenanalyse`}
                        className="text-sm font-medium hover:underline"
                      >
                        {r.supplier}
                      </Link>
                      {r.reference && (
                        <div className="text-xs text-muted">{r.reference}</div>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={r.status === "received" ? "success" : r.status === "in_transit" ? "info" : "neutral"}>
                        {r.status}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-right text-xs tabular-nums">
                      {formatEUR(poTotal)}
                    </Td>
                    <Td className="text-center text-xs">
                      {Number(r.n_mails) > 0 ? (
                        <span className="rounded-md bg-success/10 px-2 py-0.5 text-success">
                          {r.n_mails} mail · {r.n_attachments} bestand
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(byCategory.entries()).map(([cat, v]) => (
                          <span
                            key={cat}
                            title={`${cat}: ${formatEUR(v.amount)}`}
                            className="rounded bg-background-soft px-1.5 py-0.5"
                          >
                            {CATEGORY_ICONS[cat]} {v.count}
                            {v.amount > 0 && (
                              <span className="ml-1 text-[10px] text-muted">{formatEUR(v.amount)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right text-xs">
                      {overhead > 0 ? (
                        <>
                          <span className="font-medium tabular-nums">{formatEUR(overhead)}</span>
                          {poTotal > 0 && (
                            <span className="ml-1 text-muted">
                              ({overheadPct.toFixed(0)}%)
                            </span>
                          )}
                        </>
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
