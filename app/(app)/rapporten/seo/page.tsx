import { Search } from "lucide-react";

import { SeoTrendChart } from "@/components/seo-charts";
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

const COUNTRY: Record<string, string> = {
  nld: "Nederland", esp: "Spanje", deu: "Duitsland", bel: "België", gbr: "VK",
  usa: "VS", fra: "Frankrijk", ita: "Italië", che: "Zwitserland", aut: "Oostenrijk",
};
const cname = (c: string) => COUNTRY[(c || "").toLowerCase()] ?? (c ? c.toUpperCase() : "(onbekend)");

function kpiDelta(
  cur: number,
  prev: number | undefined,
  kind: "pct" | "position" = "pct",
): { hint?: string; tone: "neutral" | "success" | "danger" } {
  if (prev == null || prev === 0) return { tone: "neutral" };
  if (kind === "position") {
    const diff = cur - prev; // negatief = beter (lagere positie)
    return { hint: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} vs vorige 28d`, tone: diff <= 0 ? "success" : "danger" };
  }
  const pct = ((cur - prev) / prev) * 100;
  return { hint: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs vorige 28d`, tone: pct >= 0 ? "success" : "danger" };
}

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

  const t = data?.totals;
  const p = data?.prev ?? undefined;

  return (
    <>
      <PageHeader
        title="SEO"
        subtitle={data ? `Google Search Console · ${data.range.start} t/m ${data.range.end}` : "Google Search Console"}
      />

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !t && (
        <EmptyState
          icon={<Search />}
          title="Nog geen data"
          description="Je property is recent geverifieerd. Google heeft meestal een paar dagen nodig voordat de eerste cijfers verschijnen — kom binnenkort terug."
        />
      )}

      {data && t && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(() => {
              const d1 = kpiDelta(t.clicks, p?.clicks);
              const d2 = kpiDelta(t.impressions, p?.impressions);
              const d3 = kpiDelta(t.ctr, p?.ctr);
              const d4 = kpiDelta(t.position, p?.position, "position");
              return [
                <StatTile key="c" label="Kliks" value={nf(t.clicks)} hint={d1.hint} tone={d1.tone === "neutral" ? "success" : d1.tone} />,
                <StatTile key="i" label="Vertoningen" value={nf(t.impressions)} hint={d2.hint} tone={d2.tone === "neutral" ? "info" : d2.tone} />,
                <StatTile key="r" label="CTR" value={pf(t.ctr)} hint={d3.hint} tone={d3.tone} />,
                <StatTile key="p" label="Gem. positie" value={t.position.toFixed(1)} hint={d4.hint ?? "lager = beter"} tone={d4.tone === "neutral" ? "accent" : d4.tone} />,
              ];
            })()}
          </div>

          {data.trend.length > 0 && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>Kliks &amp; vertoningen per dag</CardTitle>
              </CardHeader>
              <CardContent>
                <SeoTrendChart data={data.trend} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <SeoTable title="Top zoekwoorden" keyLabel="Zoekwoord" rows={data.queries} />
            <SeoTable title="Top pagina's" keyLabel="Pagina" rows={data.pages} strip />
            <SeoTable title="Top landen" keyLabel="Land" rows={data.countries} country />
            <SeoTable title="Kansen — positie 5 t/m 20" keyLabel="Zoekwoord" rows={data.opportunities} />
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
  country,
}: {
  title: string;
  keyLabel: string;
  rows: ScRow[];
  strip?: boolean;
  country?: boolean;
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
                const label = country
                  ? cname(key)
                  : strip
                    ? key.replace("https://www.habitat-one.com", "") || "/"
                    : key;
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
