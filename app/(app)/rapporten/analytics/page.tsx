import { Activity } from "lucide-react";

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
import { gaConfigured, getAnalyticsData, type GaRow } from "@/lib/analytics";

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

  let data: Awaited<ReturnType<typeof getAnalyticsData>> | null = null;
  let error: string | null = null;
  try {
    data = await getAnalyticsData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={data ? `Google Analytics (GA4) · ${data.range.start} t/m ${data.range.end}` : "Google Analytics (GA4)"}
      />

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !data.totals && (
        <EmptyState
          icon={<Activity />}
          title="Nog geen bezoekersdata"
          description="Google Analytics meet pas zodra de meetcode actief op je site staat én er bezoekers zijn. Kom binnenkort terug."
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
