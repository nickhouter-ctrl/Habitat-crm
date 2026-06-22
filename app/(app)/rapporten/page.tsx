import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { HorizontalBarChart, MonthlyAmountChart } from "@/components/rapporten-charts";
import { getReportsData } from "@/lib/reports-data";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Rapporten" };

export default async function RapportenPage() {
  const {
    totalRev,
    totalPur,
    grossMargin,
    cogs12,
    grossProfit12,
    marginPct12,
    revenueChart,
    purchaseChart,
    margeChart,
    topProfitProducts,
    lowMarginProducts,
    collectionMargin,
    collectionProfitData,
    customerProfitData,
    topCustData,
    topProdData,
    supplierData,
    leadSourceData,
    openInvoicesCount,
    openInvoicesTotal,
    cashflowBuckets,
    pct,
  } = await getReportsData();
  return (
    <>
      <PageHeader
        title="Rapporten"
        subtitle="Alle bedragen ex. BTW, laatste 12 maanden. Inkoop komt direct uit Holded's grootboek."
        actions={
          <div className="flex gap-2">
            <LinkButton href="/rapporten/pdf" variant="primary" target="_blank">
              📄 PDF-overzicht
            </LinkButton>
            <LinkButton href="/rapporten/inkoop-marge" variant="secondary">
              📉 Inkoop-aandacht
            </LinkButton>
            <LinkButton href="/rapporten/data-check" variant="secondary">
              🩺 Data-gezondheid
            </LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Omzet (12 mnd)" value={formatEUR(totalRev)} hint="ex. BTW · facturen − creditnota's" />
        <StatTile label="Inkoop (12 mnd)" value={formatEUR(totalPur)} hint="ex. BTW · Holded aankoopfacturen" />
        <StatTile label="Bruto-resultaat" value={formatEUR(totalRev - totalPur)} hint={grossMargin != null ? `${grossMargin}% van de omzet` : undefined} />
        <StatTile label="Open facturen" value={openInvoicesCount} hint={formatEUR(openInvoicesTotal)} />
      </div>

      {/* ─────────────── Marge & winst ─────────────── */}
      <div className="mb-2 mt-7 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Marge &amp; winst</h2>
        <span className="text-xs text-muted">
          verkoopmarge = omzet − kostprijs van verkochte producten · ex BTW · 12 mnd
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Omzet" value={formatEUR(totalRev)} hint="ex. BTW · 12 mnd" tone="info" />
        <StatTile label="Kostprijs verkocht" value={formatEUR(cogs12)} hint="COGS · kostprijs van verkochte regels" />
        <StatTile
          label="Brutowinst"
          value={formatEUR(grossProfit12)}
          hint={marginPct12 != null ? `${marginPct12}% marge` : undefined}
          tone="success"
        />
        <StatTile
          label="Gem. marge"
          value={marginPct12 != null ? `${marginPct12}%` : "—"}
          hint="winst / omzet"
          tone="success"
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Winst per maand</CardTitle>
            <span className="text-xs text-muted">omzet − kostprijs van verkochte regels</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={margeChart} color="#1f6f5c" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Winst per product</CardTitle>
            <span className="text-xs text-muted">top 12 op winst € · op productregels</span>
          </CardHeader>
          {topProfitProducts.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Nog geen verkochte producten met kostprijs.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Omzet</Th>
                  <Th className="text-right">Winst</Th>
                  <Th className="text-right">Marge</Th>
                </tr>
              </THead>
              <TBody>
                {topProfitProducts.map((p) => {
                  const mp = pct(p.revenue, p.profit);
                  return (
                    <Tr key={p.name}>
                      <Td className="max-w-[220px] truncate" title={p.name}>{p.name}</Td>
                      <Td className="text-right tabular-nums text-muted">{formatEUR(p.revenue)}</Td>
                      <Td className="text-right font-medium tabular-nums">{formatEUR(p.profit)}</Td>
                      <Td className="text-right tabular-nums">
                        {!p.hasCost || mp == null ? (
                          <span className="text-muted" title="Geen kostprijs ingevuld">n.v.t.</span>
                        ) : (
                          `${mp}%`
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Winst per collectie</CardTitle>
            <span className="text-xs text-muted">winst € · op productregels</span>
          </CardHeader>
          {collectionProfitData.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Nog geen data.</p>
            </CardContent>
          ) : (
            <>
              <CardContent className="pb-0">
                <HorizontalBarChart data={collectionProfitData} height={Math.max(160, collectionProfitData.length * 28)} />
              </CardContent>
              <Table>
                <THead>
                  <tr>
                    <Th>Collectie</Th>
                    <Th className="text-right">Winst</Th>
                    <Th className="text-right">Marge</Th>
                  </tr>
                </THead>
                <TBody>
                  {collectionMargin.map((c) => (
                    <Tr key={c.name}>
                      <Td>{c.name}</Td>
                      <Td className="text-right tabular-nums">{formatEUR(c.profit)}</Td>
                      <Td className="text-right tabular-nums text-muted">{c.mp != null ? `${c.mp}%` : "—"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top klanten — winst</CardTitle>
            <span className="text-xs text-muted">omzet − kostprijs · op productregels</span>
          </CardHeader>
          <CardContent>
            {customerProfitData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen klanten met winst.</p>
            ) : (
              <HorizontalBarChart data={customerProfitData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Laagste marge / verlieslatend</CardTitle>
            <span className="text-xs text-muted">producten met kostprijs, oplopende marge</span>
          </CardHeader>
          {lowMarginProducts.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Geen producten met kostprijs verkocht.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Winst</Th>
                  <Th className="text-right">Marge</Th>
                </tr>
              </THead>
              <TBody>
                {lowMarginProducts.map((p) => (
                  <Tr key={p.name}>
                    <Td className="max-w-[220px] truncate" title={p.name}>{p.name}</Td>
                    <Td className={`text-right tabular-nums ${p.profit < 0 ? "font-medium text-danger" : ""}`}>{formatEUR(p.profit)}</Td>
                    <Td className={`text-right tabular-nums ${p.mp < 0 ? "font-medium text-danger" : p.mp < 15 ? "text-warning" : ""}`}>{p.mp}%</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* ─────────────── Omzet, inkoop & cashflow ─────────────── */}
      <div className="mb-2 mt-7">
        <h2 className="text-lg font-semibold">Omzet, inkoop &amp; pijplijn</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Omzet per maand</CardTitle>
            <span className="text-xs text-muted">ex. BTW · facturen − creditnota's</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={revenueChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inkoop per maand</CardTitle>
            <span className="text-xs text-muted">ex. BTW · uit Holded aankoopfacturen</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={purchaseChart} color="#3a2a20" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top klanten — netto-omzet</CardTitle>
            <span className="text-xs text-muted">ex. BTW · all-time</span>
          </CardHeader>
          <CardContent>
            {topCustData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen klanten met omzet.</p>
            ) : (
              <HorizontalBarChart data={topCustData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top producten — omzet</CardTitle>
            <span className="text-xs text-muted">som van factuurregels, ex BTW</span>
          </CardHeader>
          <CardContent>
            {topProdData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen verkochte producten.</p>
            ) : (
              <HorizontalBarChart data={topProdData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top leveranciers — spend</CardTitle>
            <span className="text-xs text-muted">ex. BTW · zonder concepten</span>
          </CardHeader>
          <CardContent>
            {supplierData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen inkoop.</p>
            ) : (
              <HorizontalBarChart data={supplierData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads per bron</CardTitle>
            <span className="text-xs text-muted">contacten naar herkomst</span>
          </CardHeader>
          <CardContent>
            {leadSourceData.length === 0 ? (
              <p className="text-sm text-muted">Nog geen leads met bron ingevuld.</p>
            ) : (
              <HorizontalBarChart data={leadSourceData} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Aankomende cashflow — open facturen op vervaldatum</CardTitle>
          <span className="text-xs text-muted">incl. BTW · wat de klant nog moet betalen</span>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <Th>Periode</Th>
              <Th className="text-right">Verwachte ontvangst</Th>
            </tr>
          </THead>
          <TBody>
            {cashflowBuckets.map((b) => (
              <Tr key={b.label}>
                <Td className={b.label === "vervallen" ? "font-medium text-danger" : ""}>
                  {b.label === "vervallen" ? "⚠️ Vervallen" : b.label === "deze wk" ? "Deze week" : `Over ${b.label.replace("+", "").replace(" wk", " weken")}`}
                </Td>
                <Td className="text-right tabular-nums">{formatEUR(b.open)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
