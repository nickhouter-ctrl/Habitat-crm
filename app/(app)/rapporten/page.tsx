import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { tekst as uiTranslation } from '@/lib/i18n/server';
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
import { ReportsNav } from "@/components/reports-nav";
import { getReportsData } from "@/lib/reports-data";
import { formatEUR } from "@/lib/utils";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Rapporten") };
}

export default async function RapportenPage() {
  const uiT = await uiTranslation();
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
<TabsRoot defaultTab="profit" ids={["profit","sales","clients","cashflow"]} param="section">
      <PageHeader
        title={uiT("Rapporten")}
        subtitle={uiT("Alle bedragen ex. BTW, laatste 12 maanden. Inkoop komt direct uit Holded's grootboek.")}
        actions={
          <div className="flex gap-2">
            <LinkButton href="/rapporten/pdf" variant="primary" target="_blank">
              {uiT("📄 PDF-overzicht")} </LinkButton>
            <LinkButton href="/rapporten/inkoop-marge" variant="secondary">
              {uiT("📉 Inkoop-aandacht")} </LinkButton>
            <LinkButton href="/rapporten/data-check" variant="secondary">
              {uiT("🩺 Data-gezondheid")} </LinkButton>
          </div>
        }
      />
<TabsBar tabs={[{id:"profit",label:uiT("Winst")},{id:"sales",label:uiT("Omzet & inkoop")},{id:"clients",label:uiT("Klanten & producten")},{id:"cashflow",label:uiT("Cashflow")}]}/>
      <ReportsNav active="/rapporten" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={uiT("Omzet (12 mnd)")} value={formatEUR(totalRev)} hint={uiT("ex. BTW · facturen − creditnota's")} />
        <StatTile label={uiT("Inkoop (12 mnd)")} value={formatEUR(totalPur)} hint={uiT("ex. BTW · Holded aankoopfacturen")} />
        <StatTile label={uiT("Bruto-resultaat")} value={formatEUR(totalRev - totalPur)} hint={grossMargin != null ? uiT("{v0}% van de omzet", { v0: grossMargin }) : undefined} />
        <StatTile label={uiT("Open facturen")} value={openInvoicesCount} hint={formatEUR(openInvoicesTotal)} />
      </div>

      {/* ─────────────── Marge & winst ─────────────── */}
      <TabPanel id="profit"><div className="mb-2 mt-7 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{uiT("Marge & winst")}</h2>
        <span className="text-xs text-muted">
          {uiT("verkoopmarge = omzet − kostprijs van verkochte producten · ex BTW · 12 mnd")} </span>
      </div></TabPanel>

      <TabPanel id="profit"><div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={uiT("Omzet")} value={formatEUR(totalRev)} hint={uiT("ex. BTW · 12 mnd")} tone="info" />
        <StatTile label={uiT("Kostprijs verkocht")} value={formatEUR(cogs12)} hint={uiT("COGS · kostprijs van verkochte regels")} />
        <StatTile
          label={uiT("Brutowinst")}
          value={formatEUR(grossProfit12)}
          hint={marginPct12 != null ? uiT("{v0}% marge", { v0: marginPct12 }) : undefined}
          tone="success"
        />
        <StatTile
          label={uiT("Gem. marge")}
          value={marginPct12 != null ? `${marginPct12}%` : "—"}
          hint={uiT("winst / omzet")}
          tone="success"
        />
      </div></TabPanel>

      <div className="space-y-5">
        <TabPanel id="profit"><Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{uiT("Winst per maand")}</CardTitle>
            <span className="text-xs text-muted">{uiT("omzet − kostprijs van verkochte regels")}</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={margeChart} color="#1f6f5c" />
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="profit"><Card>
          <CardHeader>
            <CardTitle>{uiT("Winst per product")}</CardTitle>
            <span className="text-xs text-muted">{uiT("top 12 op winst € · op productregels")}</span>
          </CardHeader>
          {topProfitProducts.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Nog geen verkochte producten met kostprijs.")}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{uiT("Product")}</Th>
                  <Th className="text-right">{uiT("Omzet")}</Th>
                  <Th className="text-right">{uiT("Winst")}</Th>
                  <Th className="text-right">{uiT("Marge")}</Th>
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
                          <span className="text-muted" title={uiT("Geen kostprijs ingevuld")}>{uiT("n.v.t.")}</span>
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
        </Card></TabPanel>

        <TabPanel id="profit"><Card>
          <CardHeader>
            <CardTitle>{uiT("Winst per collectie")}</CardTitle>
            <span className="text-xs text-muted">{uiT("winst € · op productregels")}</span>
          </CardHeader>
          {collectionProfitData.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Nog geen data.")}</p>
            </CardContent>
          ) : (
            <>
              <CardContent className="pb-0">
                <HorizontalBarChart data={collectionProfitData} height={Math.max(160, collectionProfitData.length * 28)} />
              </CardContent>
              <Table>
                <THead>
                  <tr>
                    <Th>{uiT("Collectie")}</Th>
                    <Th className="text-right">{uiT("Winst")}</Th>
                    <Th className="text-right">{uiT("Marge")}</Th>
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
        </Card></TabPanel>

        <TabPanel id="profit"><Card>
          <CardHeader>
            <CardTitle>{uiT("Top klanten — winst")}</CardTitle>
            <span className="text-xs text-muted">{uiT("omzet − kostprijs · op productregels")}</span>
          </CardHeader>
          <CardContent>
            {customerProfitData.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen klanten met winst.")}</p>
            ) : (
              <HorizontalBarChart data={customerProfitData} />
            )}
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="profit"><Card>
          <CardHeader>
            <CardTitle>{uiT("Laagste marge / verlieslatend")}</CardTitle>
            <span className="text-xs text-muted">{uiT("producten met kostprijs, oplopende marge")}</span>
          </CardHeader>
          {lowMarginProducts.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen producten met kostprijs verkocht.")}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{uiT("Product")}</Th>
                  <Th className="text-right">{uiT("Winst")}</Th>
                  <Th className="text-right">{uiT("Marge")}</Th>
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
        </Card></TabPanel>
      </div>

      {/* ─────────────── Omzet, inkoop & cashflow ─────────────── */}
      <TabPanel id="sales"><div className="mb-2 mt-7">
        <h2 className="text-lg font-semibold">{uiT("Omzet, inkoop & pijplijn")}</h2>
      </div></TabPanel>

      <div className="space-y-5">
        <TabPanel id="sales"><Card>
          <CardHeader>
            <CardTitle>{uiT("Omzet per maand")}</CardTitle>
            <span className="text-xs text-muted">{uiT("ex. BTW · facturen − creditnota's")}</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={revenueChart} />
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="sales"><Card>
          <CardHeader>
            <CardTitle>{uiT("Inkoop per maand")}</CardTitle>
            <span className="text-xs text-muted">{uiT("ex. BTW · uit Holded aankoopfacturen")}</span>
          </CardHeader>
          <CardContent>
            <MonthlyAmountChart data={purchaseChart} color="#3a2a20" />
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="clients"><Card>
          <CardHeader>
            <CardTitle>{uiT("Top klanten — netto-omzet")}</CardTitle>
            <span className="text-xs text-muted">{uiT("ex. BTW · all-time")}</span>
          </CardHeader>
          <CardContent>
            {topCustData.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen klanten met omzet.")}</p>
            ) : (
              <HorizontalBarChart data={topCustData} />
            )}
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="clients"><Card>
          <CardHeader>
            <CardTitle>{uiT("Top producten — omzet")}</CardTitle>
            <span className="text-xs text-muted">{uiT("som van factuurregels, ex BTW")}</span>
          </CardHeader>
          <CardContent>
            {topProdData.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen verkochte producten.")}</p>
            ) : (
              <HorizontalBarChart data={topProdData} />
            )}
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="clients"><Card>
          <CardHeader>
            <CardTitle>{uiT("Top leveranciers — spend")}</CardTitle>
            <span className="text-xs text-muted">{uiT("ex. BTW · zonder concepten")}</span>
          </CardHeader>
          <CardContent>
            {supplierData.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen inkoop.")}</p>
            ) : (
              <HorizontalBarChart data={supplierData} />
            )}
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="clients"><Card>
          <CardHeader>
            <CardTitle>{uiT("Leads per bron")}</CardTitle>
            <span className="text-xs text-muted">{uiT("contacten naar herkomst")}</span>
          </CardHeader>
          <CardContent>
            {leadSourceData.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen leads met bron ingevuld.")}</p>
            ) : (
              <HorizontalBarChart data={leadSourceData} />
            )}
          </CardContent>
        </Card></TabPanel>
      </div>

      <TabPanel id="cashflow"><Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{uiT("Aankomende cashflow — open facturen op vervaldatum")}</CardTitle>
          <span className="text-xs text-muted">{uiT("incl. BTW · wat de klant nog moet betalen")}</span>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <Th>{uiT("Periode")}</Th>
              <Th className="text-right">{uiT("Verwachte ontvangst")}</Th>
            </tr>
          </THead>
          <TBody>
            {cashflowBuckets.map((b) => (
              <Tr key={b.label}>
                <Td className={b.label === "vervallen" ? "font-medium text-danger" : ""}>
                  {b.label === "vervallen" ? uiT("⚠️ Vervallen") : b.label === "deze wk" ? uiT("Deze week") : uiT("Over {v0}", { v0: b.label.replace("+", "").replace(" wk", " weken") })}
                </Td>
                <Td className="text-right tabular-nums">{formatEUR(b.open)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card></TabPanel>

</TabsRoot>
</>
  );
}
