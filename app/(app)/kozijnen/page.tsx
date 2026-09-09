import { AppWindow, ExternalLink } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LinkButton, PageHeader, StatTile, TBody, Table, Td, Th, THead, Tr } from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { getWindowsReport, windowsStatusLabel } from "@/lib/windows-report";

export const metadata = { title: "Kozijnen" };
export const dynamic = "force-dynamic";

const WINDOWS_URL = process.env.NEXT_PUBLIC_WINDOWS_URL ?? "https://windows.habitat-one.com";
const pct = (f: number | null) => (f == null ? "—" : `${(f * 100).toFixed(1)}%`);
const date = (d: Date) => d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
const tone = (status: string) => (status === "delivered" ? "success" : status === "cancelled" ? "neutral" : ["confirmed", "production", "shipped"].includes(status) ? "accent" : "warning") as "success" | "neutral" | "accent" | "warning";

/**
 * Kozijnen (Habitat One Windows): wat verdienen we op de kozijnorders. Leest
 * rechtstreeks uit het Windows-schema in dezelfde database.
 */
export default async function WindowsReportPage() {
  const r = await getWindowsReport();
  if (!r.configured) {
    return (
      <>
        <PageHeader title="Kozijnen" subtitle="Habitat One Windows" actions={<LinkButton href="/kozijnen/portaal" target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Open kozijnportaal</LinkButton>} />
        <EmptyState icon={<AppWindow />} title="Windows-gegevens niet gevonden" description="Het schema `windows` bestaat niet in deze database." />
      </>
    );
  }
  const t = r.totals;
  return (
    <>
      <PageHeader
        title="Kozijnen"
        subtitle={`Habitat One Windows · kostprijs = fabriek × (1 + ${Math.round(r.pricing.importPct * 100)}% invoer + ${Math.round(r.pricing.handlingPct * 100)}% handling) · Habitat-marge ${Math.round(r.pricing.habitatMarginPct * 100)}%`}
        actions={<>
          <LinkButton href="/kozijnen/portaal?next=/dealer" variant="secondary" target="_blank" rel="noreferrer">Eigen projecten</LinkButton>
          <LinkButton href="/kozijnen/portaal?next=/admin" target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Open kozijnportaal</LinkButton>
        </>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Winst op kozijnen" value={formatEUR(t.profit)} hint={`marge ${pct(t.marginPct)} op kostprijs · ${t.orders} orders`} tone="success" />
        <StatTile label="Omzet aan dealers" value={formatEUR(t.dealer)} hint="dealerprijs ex. BTW, definitief waar bekend" tone="accent" />
        <StatTile label="Kostprijs" value={formatEUR(t.cost)} hint="fabriek + invoer + handling" />
        <StatTile label="Openstaand" value={formatEUR(t.open)} hint={`gefactureerd ${formatEUR(t.invoiced)} · betaald ${formatEUR(t.paid)}`} tone={t.open > 0 ? "warning" : "neutral"} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile label="Lopende orders" value={t.active} hint={`${t.delivered} geleverd`} />
        <StatTile label="Open offertes" value={r.quotes.open} hint={`${formatEUR(r.quotes.openValue)} dealerwaarde · ${r.quotes.accepted} geaccepteerd`} />
        <StatTile label="Kozijnportaal" value={<a href="/kozijnen/portaal?next=/admin" target="_blank" rel="noreferrer" className="text-base font-medium text-accent underline">{WINDOWS_URL.replace(/^https?:\/\//, "")}</a>} hint="beheer, orders en facturen — u wordt automatisch ingelogd" />
      </div>

      <Card>
        <CardHeader><CardTitle>Per order</CardTitle></CardHeader>
        <CardContent className="p-0">
          {r.orders.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nog geen orders.</p>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Order</Th><Th>Dealer · klant</Th><Th>Status</Th>
                  <Th className="text-right">Fabriek</Th><Th className="text-right">Kostprijs</Th><Th className="text-right">Dealerprijs</Th>
                  <Th className="text-right">Winst</Th><Th className="text-right">Marge</Th><Th className="text-right">Gefactureerd</Th><Th className="text-right">Open</Th>
                </Tr>
              </THead>
              <TBody>
                {r.orders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <a href={`${WINDOWS_URL}/admin/orders/${o.id}`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{o.number}</a>
                      <div className="text-xs text-muted">{date(o.createdAt)} · {o.elements} kozijn(en) · {o.m2.toFixed(1)} m²</div>
                    </Td>
                    <Td><div>{o.dealer}</div><div className="text-xs text-muted">{o.customer}{o.project ? ` · ${o.project}` : ""}</div></Td>
                    <Td><Badge tone={tone(o.status)}>{windowsStatusLabel(o.status)}</Badge>{o.plannedDelivery && <div className="mt-1 text-xs text-muted">levering {o.plannedDelivery}</div>}</Td>
                    <Td className="text-right">{formatEUR(o.factory)}{!o.factoryFinal && <div className="text-xs text-muted">raming</div>}</Td>
                    <Td className="text-right">{formatEUR(o.cost)}</Td>
                    <Td className="text-right">{formatEUR(o.dealer_price)}</Td>
                    <Td className="text-right font-medium">{formatEUR(o.profit)}</Td>
                    <Td className="text-right">{pct(o.marginPct)}</Td>
                    <Td className="text-right">{formatEUR(o.invoiced)}{o.paid > 0 && <div className="text-xs text-muted">betaald {formatEUR(o.paid)}</div>}</Td>
                    <Td className="text-right">{o.open > 0 ? <span className="text-warning">{formatEUR(o.open)}</span> : "—"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted">Fabrieksprijs en dealerprijs zijn definitief zodra de fabriek geoffreerd heeft; daarvoor de raming uit de offerte. Facturen zijn de facturen van Habitat aan de dealer (of aan de klant bij eigen projecten). Zolang de CRM-koppeling in Windows uit staat, staan deze facturen niet in de CRM-boekhouding.</p>
    </>
  );
}
