import { desc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  Input,
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
import { cn, formatEUR } from "@/lib/utils";

import { SyncHoldedButton } from "./sync-holded-button";

export const metadata = { title: "Inkooporders" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_FILTERS = [
  { key: "", label: "Alle" },
  { key: "ordered", label: "Besteld" },
  { key: "in_transit", label: "Onderweg" },
  { key: "received", label: "Ontvangen" },
  { key: "draft", label: "Concept" },
  { key: "cancelled", label: "Geannuleerd" },
] as const;

const PAY_FILTERS = [
  { key: "", label: "Alle" },
  { key: "open", label: "Openstaand" },
  { key: "deels", label: "Deels betaald" },
  { key: "betaald", label: "Betaald" },
] as const;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const statusFilter = typeof params.status === "string" ? params.status : "";
  const payFilter = typeof params.pay === "string" ? params.pay : "";

  const rows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
    .limit(2000);

  const pendingHolded = rows.filter((r) => !r.holdedId).length;

  // Aggregaten op de VOLLEDIGE set (overzicht blijft stabiel los van het filter).
  const eurRows = rows.filter((r) => (r.currency ?? "EUR") === "EUR");
  const sumEx = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.subtotal ?? r.total ?? 0), 0);
  const sumIncl = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const totalEurEx = sumEx(eurRows);
  const totalEurIncl = sumIncl(eurRows);
  const open = rows.filter((r) => PO_OPEN_STATUSES.includes(r.status));
  const received = rows.filter((r) => r.status === "received");
  const drafts = rows.filter((r) => r.status === "draft");
  const isFullyPaid = (r: (typeof rows)[number]) =>
    !!r.paidAt || (Number(r.total ?? 0) > 0 && Number(r.paidEur ?? 0) >= Number(r.total ?? 0) - 0.01);
  const unpaid = rows.filter((r) => r.status !== "draft" && !isFullyPaid(r));
  const unpaidTotal = unpaid
    .filter((r) => (r.currency ?? "EUR") === "EUR")
    .reduce((s, r) => s + (Number(r.total ?? 0) - Number(r.paidEur ?? 0)), 0);
  const nonEur = rows.filter((r) => (r.currency ?? "EUR") !== "EUR");

  // Betaalstatus per regel (voor filter + badge).
  const payState = (r: (typeof rows)[number]): "concept" | "betaald" | "deels" | "open" => {
    if (r.status === "draft") return "concept";
    if (isFullyPaid(r)) return "betaald";
    return Number(r.paidEur ?? 0) > 0 ? "deels" : "open";
  };

  // Zoeken/filteren in JS (lijst is klein, en zo blijven de aggregaten stabiel).
  const needle = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (payFilter && payState(r) !== payFilter) return false;
    if (needle) {
      const hay = `${r.supplier} ${r.reference ?? ""} ${r.containerRef ?? ""} ${r.shipmentRef ?? ""} ${r.notes ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, status: statusFilter, pay: payFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") sp.set(k, v as string);
    }
    const s = sp.toString();
    return s ? `/inkooporders?${s}` : "/inkooporders";
  };

  const hasFilter = !!(q || statusFilter || payFilter);

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
        <>
          {/* Zoeken & filteren */}
          <div className="mb-4 space-y-3">
            <form action="/inkooporders" className="flex gap-2">
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              {payFilter && <input type="hidden" name="pay" value={payFilter} />}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Zoek op leverancier, referentie/factuurnummer, container…"
                className="max-w-md"
              />
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
                Zoeken
              </button>
              {hasFilter && (
                <LinkButton href="/inkooporders" variant="ghost">
                  Wissen
                </LinkButton>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.key || "all"}
                  href={buildHref({ status: f.key || undefined })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    statusFilter === f.key ? "bg-accent text-white" : "bg-background text-muted hover:bg-border",
                  )}
                >
                  {f.label}
                </Link>
              ))}
              <span className="mx-1 text-border">·</span>
              {PAY_FILTERS.map((f) => (
                <Link
                  key={f.key || "allpay"}
                  href={buildHref({ pay: f.key || undefined })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    payFilter === f.key ? "bg-accent text-white" : "bg-background text-muted hover:bg-border",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            {hasFilter && (
              <p className="text-xs text-muted">
                {filtered.length} van {rows.length} inkooporders
              </p>
            )}
          </div>

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
                {filtered.length === 0 ? (
                  <Tr>
                    <Td className="text-muted" colSpan={9}>
                      Geen inkooporders gevonden voor deze zoekopdracht/filter.
                    </Td>
                  </Tr>
                ) : (
                  filtered.map((po) => {
                    const meta = PO_STATUS_META[po.status];
                    const ps = payState(po);
                    const pay =
                      ps === "concept"
                        ? null
                        : ps === "betaald"
                          ? { tone: "success" as const, label: "Betaald" }
                          : ps === "deels"
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
                          {pay ? <Badge tone={pay.tone}>{pay.label}</Badge> : <span className="text-muted">—</span>}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
