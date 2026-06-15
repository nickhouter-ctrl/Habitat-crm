import { Search } from "lucide-react";

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
import { getSeoData, scConfigured, type ScRow } from "@/lib/searchconsole";

export const metadata = { title: "SEO" };

const nf = (n: number) => Math.round(n).toLocaleString("nl-NL");
const pf = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function SeoPage() {
  if (!scConfigured()) {
    return (
      <>
        <PageHeader title="SEO" subtitle="Google Search Console" />
        <EmptyState
          icon={<Search />}
          title="Koppeling nog niet geconfigureerd"
          description="Zet de env-variabelen SC_SITE_URL, SC_CLIENT_ID, SC_CLIENT_SECRET en SC_REFRESH_TOKEN in Vercel; daarna verschijnt hier je Search Console-data."
        />
      </>
    );
  }

  let data: Awaited<ReturnType<typeof getSeoData>> | null = null;
  let error: string | null = null;
  try {
    data = await getSeoData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <PageHeader
        title="SEO"
        subtitle={
          data
            ? `Google Search Console · ${data.range.start} t/m ${data.range.end}`
            : "Google Search Console"
        }
      />

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !data.totals && (
        <EmptyState
          icon={<Search />}
          title="Nog geen data"
          description="Je property is recent geverifieerd. Google heeft meestal een paar dagen nodig voordat de eerste cijfers verschijnen — kom binnenkort terug."
        />
      )}

      {data?.totals && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Kliks" value={nf(data.totals.clicks)} hint="laatste 28 dagen" tone="success" />
            <StatTile label="Vertoningen" value={nf(data.totals.impressions)} hint="laatste 28 dagen" tone="info" />
            <StatTile label="CTR" value={pf(data.totals.ctr)} hint="klikfrequentie" />
            <StatTile label="Gem. positie" value={data.totals.position.toFixed(1)} hint="lager = beter" tone="accent" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SeoTable title="Top zoekwoorden" keyLabel="Zoekwoord" rows={data.queries} />
            <SeoTable title="Top pagina's" keyLabel="Pagina" rows={data.pages} strip />
          </div>

          <div className="mt-5">
            <SeoTable
              title="Kansen — positie 5 t/m 20 (net buiten pagina 1)"
              keyLabel="Zoekwoord"
              rows={data.opportunities}
            />
          </div>
        </>
      )}
    </>
  );
}

function SeoTable({
  title,
  keyLabel,
  rows,
  strip,
}: {
  title: string;
  keyLabel: string;
  rows: ScRow[];
  strip?: boolean;
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
                <Th className="text-right">Kliks</Th>
                <Th className="text-right">Vert.</Th>
                <Th className="text-right">CTR</Th>
                <Th className="text-right">Positie</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r, i) => {
                const key = r.keys?.[0] ?? "";
                const label = strip ? key.replace("https://www.habitat-one.com", "") || "/" : key;
                return (
                  <Tr key={`${key}-${i}`}>
                    <Td className="max-w-[18rem] truncate">{label}</Td>
                    <Td className="text-right tabular-nums">{nf(r.clicks)}</Td>
                    <Td className="text-right tabular-nums">{nf(r.impressions)}</Td>
                    <Td className="text-right tabular-nums">{pf(r.ctr)}</Td>
                    <Td className="text-right tabular-nums">{r.position.toFixed(1)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
