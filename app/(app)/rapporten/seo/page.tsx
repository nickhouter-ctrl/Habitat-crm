import { Search } from "lucide-react";
import Link from "next/link";

import { SeoTrendChart } from "@/components/seo-charts";
import { SortableSeoTable } from "@/components/seo-tables";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { getSeoData, scConfigured } from "@/lib/searchconsole";
import { cn } from "@/lib/utils";

export const metadata = { title: "SEO" };

const nf = (n: number) => Math.round(n).toLocaleString("nl-NL");
const pf = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtIso = (iso: string) => {
  const [, m, d] = iso.split("-");
  return d && m ? `${Number(d)}/${Number(m)}` : iso;
};

const RANGE_TABS = [
  { dagen: 7, label: "Week" },
  { dagen: 28, label: "Maand" },
  { dagen: 90, label: "Kwartaal" },
] as const;

function kpiDelta(
  cur: number,
  prev: number | undefined,
  kind: "pct" | "position" = "pct",
): { hint?: string; tone: "neutral" | "success" | "danger" } {
  if (prev == null || prev === 0) return { tone: "neutral" };
  if (kind === "position") {
    const diff = cur - prev; // negatief = beter (lagere positie)
    return { hint: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} vs vorige periode`, tone: diff <= 0 ? "success" : "danger" };
  }
  const pct = ((cur - prev) / prev) * 100;
  return { hint: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs vorige periode`, tone: pct >= 0 ? "success" : "danger" };
}

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const datum = typeof sp.datum === "string" ? sp.datum : undefined;
  const single = Boolean(datum);
  const dagen = RANGE_TABS.some((p) => p.dagen === Number(sp.dagen)) ? Number(sp.dagen) : 28;

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
    data = await getSeoData(single ? { date: datum } : { days: dagen });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const t = data?.totals;
  const p = data?.prev ?? undefined;
  const periodeLabel = data
    ? data.range.start === data.range.end
      ? fmtIso(data.range.start)
      : `${fmtIso(data.range.start)} t/m ${fmtIso(data.range.end)}`
    : "";

  return (
    <>
      <PageHeader
        title="SEO"
        subtitle={data ? `Google Search Console · ${periodeLabel}` : "Google Search Console"}
        actions={
          <div className="flex items-center overflow-hidden rounded-md border border-border text-sm">
            {RANGE_TABS.map((per) => (
              <Link
                key={per.dagen}
                href={`/rapporten/seo?dagen=${per.dagen}`}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  !single && per.dagen === dagen
                    ? "bg-accent font-medium text-white"
                    : "text-muted hover:bg-background",
                )}
              >
                {per.label}
              </Link>
            ))}
          </div>
        }
      />

      {single && (
        <div className="mb-5 flex items-center gap-3 text-sm">
          <Link href="/rapporten/seo" className="text-accent hover:underline">
            ← Terug naar maandoverzicht
          </Link>
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            Dagoverzicht · {periodeLabel}
          </span>
        </div>
      )}

      {!single && (
        <p className="mb-5 text-xs text-muted">
          Let op: Google Search Console levert cijfers met ~{data?.lagDays ?? 3} dagen vertraging aan. De laatste paar dagen
          (incl. vandaag) verschijnen hier dus pas later — dat is normaal en geen fout.
        </p>
      )}

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !t && (
        <EmptyState
          icon={<Search />}
          title="Nog geen data in deze periode"
          description="Search Console heeft voor deze dagen nog geen cijfers (de data loopt een paar dagen achter), of je property is recent geverifieerd. Kies een ruimere periode of kom binnenkort terug."
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

          {!single && data.trend.length > 0 && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>Kliks &amp; vertoningen per dag</CardTitle>
              </CardHeader>
              <CardContent>
                <SeoTrendChart data={data.trend} drillBase="/rapporten/seo?datum=" />
                <p className="mt-2 text-xs text-muted">Tip: klik op een dag in de grafiek voor het volledige dagoverzicht.</p>
              </CardContent>
            </Card>
          )}

          <p className="mb-3 text-xs text-muted">Klik op een kolomkop om te sorteren.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <SortableSeoTable title="Top zoekwoorden" keyLabel="Zoekwoord" rows={data.queries} />
            <SortableSeoTable title="Top pagina's" keyLabel="Pagina" rows={data.pages} strip />
            <SortableSeoTable title="Top landen" keyLabel="Land" rows={data.countries} country />
            <SortableSeoTable title="Apparaten" keyLabel="Apparaat" rows={data.devices} />
            <SortableSeoTable title="Kansen — positie 5 t/m 20" keyLabel="Zoekwoord" rows={data.opportunities} />
          </div>
        </>
      )}
    </>
  );
}
