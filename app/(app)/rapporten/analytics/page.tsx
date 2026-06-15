import { Activity } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import {
  gaConfigured,
  getAnalyticsData,
  getRealtime,
  type GaRealtime,
  type GaRow,
} from "@/lib/analytics";

export const metadata = { title: "Analytics" };

const nf = (n: number) => Math.round(n).toLocaleString("nl-NL");
const pf = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function AnalyticsPage() {
  if (!gaConfigured()) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="Google Analytics (GA4)" />
        <EmptyState
          icon={<Activity />}
          title="Koppeling nog niet geconfigureerd"
          description="Zet de env-variabele GA_PROPERTY_ID in Vercel (en zorg dat het OAuth-token de Analytics-scope heeft). Daarna verschijnen hier je bezoekerscijfers."
        />
      </>
    );
  }

  let realtime: GaRealtime | null = null;
  let rtError: string | null = null;
  let data: Awaited<ReturnType<typeof getAnalyticsData>> | null = null;
  let error: string | null = null;
  try {
    realtime = await getRealtime();
  } catch (e) {
    rtError = e instanceof Error ? e.message : String(e);
  }
  try {
    data = await getAnalyticsData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Analytics"
        subtitle={data ? `Google Analytics (GA4) · ${data.range.start} t/m ${data.range.end}` : "Google Analytics (GA4)"}
      />

      {/* Live — nu actief (ververst elke 30s) */}
      <Card className="mb-5 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          Live · nu actief (laatste 30 min)
        </div>
        {rtError ? (
          <p className="mt-2 text-sm text-danger">{rtError}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{nf(realtime?.activeUsers ?? 0)}</p>
              <p className="text-xs text-muted">actieve bezoekers</p>
            </div>
            {realtime && realtime.byPage.length > 0 && (
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Actieve pagina&apos;s</p>
                <ul className="space-y-0.5 text-sm">
                  {realtime.byPage.slice(0, 5).map((p, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span className="truncate text-muted">{p.label || "(onbekend)"}</span>
                      <span className="tabular-nums">{nf(p.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !data.totals && (
        <EmptyState
          icon={<Activity />}
          title="Nog geen bezoekersdata (28 dagen)"
          description="Google Analytics meet pas zodra de meetcode actief op je site staat én er bezoekers zijn. De live-teller hierboven werkt wel direct."
        />
      )}

      {data?.totals && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Bezoekers" value={nf(data.totals.users)} hint="laatste 28 dagen" tone="success" />
            <StatTile label="Sessies" value={nf(data.totals.sessions)} hint="laatste 28 dagen" tone="info" />
            <StatTile label="Paginaweergaven" value={nf(data.totals.views)} hint="laatste 28 dagen" tone="accent" />
            <StatTile label="Betrokkenheid" value={pf(data.totals.engagementRate)} hint="engagement rate" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <GaTable title="Top pagina's" keyLabel="Pagina" valueLabel="Weergaven" rows={data.topPages} />
            <GaTable title="Kanalen (verkeersbron)" keyLabel="Kanaal" valueLabel="Sessies" rows={data.channels} />
          </div>

          <div className="mt-5">
            <GaTable title="Top landen" keyLabel="Land" valueLabel="Bezoekers" rows={data.countries} />
          </div>
        </>
      )}
    </>
  );
}

function GaTable({
  title,
  keyLabel,
  valueLabel,
  rows,
}: {
  title: string;
  keyLabel: string;
  valueLabel: string;
  rows: GaRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nog geen data in deze periode.</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{keyLabel}</Th>
                <Th className="text-right">{valueLabel}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r, i) => (
                <Tr key={`${r.label}-${i}`}>
                  <Td className="max-w-[22rem] truncate">{r.label || "(onbekend)"}</Td>
                  <Td className="text-right tabular-nums">{nf(r.value)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
