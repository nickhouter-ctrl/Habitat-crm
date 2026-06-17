import type { ReactNode } from "react";
import { Activity } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { AutoRefresh } from "@/components/auto-refresh";
import { BreakdownBars, VisitorsAreaChart } from "@/components/analytics-charts";
import { WorldMap } from "@/components/analytics-map";
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
const dur = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

function deltaHint(cur: number, prev: number | undefined): { hint?: string; tone: "success" | "danger" | "neutral" } {
  if (prev == null || prev === 0) return { tone: "neutral" };
  const pct = ((cur - prev) / prev) * 100;
  return {
    hint: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs vorige periode`,
    tone: pct >= 0 ? "success" : "danger",
  };
}

const DAY_TABS = [
  { key: "today", label: "Vandaag" },
  { key: "yesterday", label: "Gisteren" },
] as const;
const RANGE_TABS = [
  { dagen: 7, label: "Week" },
  { dagen: 28, label: "Maand" },
  { dagen: 90, label: "Kwartaal" },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const datum = typeof sp.datum === "string" ? sp.datum : undefined;
  const single = Boolean(datum);
  const dagen = RANGE_TABS.some((p) => p.dagen === Number(sp.dagen)) ? Number(sp.dagen) : 28;
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
    data = await getAnalyticsData(single ? { date: datum } : { days: dagen });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const t = data?.totals;
  const p = data?.prev ?? undefined;
  const periodeLabel = data
    ? data.range.start === data.range.end
      ? data.range.start
      : `${data.range.start} t/m ${data.range.end}`
    : "";
  // Een aangeklikte specifieke dag (geen "today"/"yesterday") krijgt geen actieve tab.
  const customDay = single && datum !== "today" && datum !== "yesterday";

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Analytics"
        subtitle={data ? `Google Analytics (GA4) · ${periodeLabel}` : "Google Analytics (GA4)"}
        actions={
          <div className="flex items-center overflow-hidden rounded-md border border-border text-sm">
            {DAY_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={`/rapporten/analytics?datum=${tab.key}`}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  datum === tab.key
                    ? "bg-accent font-medium text-white"
                    : "text-muted hover:bg-background",
                )}
              >
                {tab.label}
              </Link>
            ))}
            {RANGE_TABS.map((per) => (
              <Link
                key={per.dagen}
                href={`/rapporten/analytics?dagen=${per.dagen}`}
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
          <Link href="/rapporten/analytics" className="text-accent hover:underline">
            ← Terug naar maandoverzicht
          </Link>
          {customDay && (
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Dagoverzicht · {periodeLabel}
            </span>
          )}
        </div>
      )}

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
          <div className="mt-3 flex flex-wrap items-start gap-x-10 gap-y-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{nf(realtime?.activeUsers ?? 0)}</p>
              <p className="text-xs text-muted">actieve bezoekers</p>
            </div>
            {realtime && (realtime.byCountry.length > 0 || realtime.byCity.length > 0 || realtime.byPage.length > 0) ? (
              <div className="grid flex-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                <RealtimeList title="Land" rows={realtime.byCountry} />
                <RealtimeList title="Stad" rows={realtime.byCity} />
                <RealtimeList title="Pagina" rows={realtime.byPage} />
              </div>
            ) : (
              <p className="self-center text-sm text-muted">Geen actieve bezoekers op dit moment.</p>
            )}
          </div>
        )}
      </Card>

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !t && (
        <EmptyState
          icon={<Activity />}
          title="Meten is actief — 28-daagse cijfers volgen"
          description="Google Analytics meet nu (zie de live-teller). Deze sectie toont 28 dagen geleden t/m gisteren, maar het meten is vandaag gestart én GA4-standaardrapporten lopen ~1 dag achter — dus vanaf morgen vullen de cijfers, grafiek en tabellen zich hier vanzelf."
        />
      )}

      {data && t && (
        <>
          {/* KPI's met vergelijking t.o.v. vorige periode */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(() => {
              const k = (label: string, value: string, cur: number, prev?: number) => {
                const d = deltaHint(cur, prev);
                return <StatTile key={label} label={label} value={value} hint={d.hint} tone={d.tone} />;
              };
              return [
                k("Bezoekers", nf(t.users), t.users, p?.users),
                k("Nieuwe bezoekers", nf(t.newUsers), t.newUsers, p?.newUsers),
                k("Sessies", nf(t.sessions), t.sessions, p?.sessions),
                k("Paginaweergaven", nf(t.views), t.views, p?.views),
                k("Gem. sessieduur", dur(t.avgSessionDuration), t.avgSessionDuration, p?.avgSessionDuration),
                k("Betrokkenheid", pf(t.engagementRate), t.engagementRate, p?.engagementRate),
              ];
            })()}
          </div>

          {/* Engagement KPI's */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Bouncepercentage" value={pf(data.engagement.bounceRate)} tone="neutral" />
            <StatTile label="Betrokken sessies" value={nf(data.engagement.engagedSessions)} tone="neutral" />
            <StatTile label="Weergaven / sessie" value={data.engagement.viewsPerSession.toFixed(1)} tone="neutral" />
          </div>

          {/* Trend */}
          {data.trend.length > 0 && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>{single ? "Bezoekers per uur" : "Bezoekers per dag"}</CardTitle>
              </CardHeader>
              <CardContent>
                <VisitorsAreaChart
                  data={data.trend}
                  drillBase={single ? undefined : "/rapporten/analytics?datum="}
                />
                {!single && (
                  <p className="mt-2 text-xs text-muted">Tip: klik op een dag in de grafiek voor het volledige dagoverzicht.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Leads & conversies ── */}
          <SectionTitle>Leads &amp; conversies</SectionTitle>
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(() => {
              const d = deltaHint(data.leads.generateLead, data.leads.prevGenerateLead);
              const keyTotal = data.leads.generateLead + data.leads.contactClick;
              return [
                <StatTile key="lead" label="Leads (formulier)" value={nf(data.leads.generateLead)} hint={d.hint} tone={d.tone} />,
                <StatTile key="cc" label="Contactkliks" value={nf(data.leads.contactClick)} hint="telefoon · e-mail · WhatsApp" tone="neutral" />,
                <StatTile key="cr" label="Conversieratio" value={t.sessions ? pf(data.leads.generateLead / t.sessions) : "—"} tone="neutral" />,
                <StatTile key="kt" label="Sleutelgebeurtenissen" value={nf(keyTotal)} tone="neutral" />,
              ];
            })()}
          </div>
          <p className="mb-5 text-xs text-muted">Leads = ingevulde contact-/offerteformulieren. Contactkliks = klikken op telefoon, e-mail of WhatsApp.</p>

          {data.leadsTrend.some((d) => d.value > 0) && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>Leads per dag</CardTitle>
              </CardHeader>
              <CardContent>
                <VisitorsAreaChart data={data.leadsTrend} valueLabel="Leads" />
              </CardContent>
            </Card>
          )}

          {/* ── Geografie ── */}
          <SectionTitle>Waar je bezoekers vandaan komen</SectionTitle>
          <div className="mb-5 grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Landenkaart</CardTitle>
              </CardHeader>
              <CardContent>
                {data.countries.length === 0 ? (
                  <p className="py-2 text-sm text-muted">Nog geen data.</p>
                ) : (
                  <WorldMap data={data.countries} />
                )}
              </CardContent>
            </Card>
            <GaTable title="Top landen" keyLabel="Land" valueLabel="Bezoekers" rows={data.countries} />
          </div>
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <GaTable title="Top steden" keyLabel="Stad" valueLabel="Bezoekers" rows={data.cities} />
            <ChartCard title="Nieuw vs terugkerend" rows={data.newVsReturning} />
          </div>

          {/* ── Acquisitie ── */}
          <SectionTitle>Hoe ze binnenkomen</SectionTitle>
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Kanalen (verkeersbron)" rows={data.channels} />
            <ChartCard title="Apparaten" rows={data.devices} />
          </div>
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <GaTable title="Verkeersbronnen" keyLabel="Bron / medium" valueLabel="Sessies" rows={data.sources} />
            <GaTable title="Landingspagina's" keyLabel="Pagina" valueLabel="Sessies" rows={data.landingPages} />
          </div>
          <div className="mb-5">
            <GaTable title="Campagnes (UTM)" keyLabel="Campagne" valueLabel="Sessies" rows={data.campaigns} />
          </div>

          {/* ── Techniek & timing ── */}
          <SectionTitle>Techniek &amp; timing</SectionTitle>
          {data.byHour.some((d) => d.value > 0) && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>Wanneer bezoekers actief zijn (per uur)</CardTitle>
              </CardHeader>
              <CardContent>
                <VisitorsAreaChart data={data.byHour} valueLabel="Sessies" />
              </CardContent>
            </Card>
          )}
          <div className="mb-5 grid gap-5 lg:grid-cols-3">
            <GaTable title="Browsers" keyLabel="Browser" valueLabel="Bezoekers" rows={data.browsers} />
            <GaTable title="Besturingssystemen" keyLabel="OS" valueLabel="Bezoekers" rows={data.operatingSystems} />
            <GaTable title="Talen" keyLabel="Taal" valueLabel="Bezoekers" rows={data.languages} />
          </div>

          {/* ── Gedrag ── */}
          <SectionTitle>Gedrag op de site</SectionTitle>
          <div className="grid gap-5 lg:grid-cols-2">
            <GaTable title="Top pagina's" keyLabel="Pagina" valueLabel="Weergaven" rows={data.topPages} />
            <GaTable title="Gebeurtenissen" keyLabel="Event" valueLabel="Aantal" rows={data.events} />
          </div>
        </>
      )}
    </>
  );
}

function ChartCard({ title, rows }: { title: string; rows: GaRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nog geen data.</p>
        ) : (
          <BreakdownBars data={rows.map((r) => ({ name: r.label || "(onbekend)", value: r.value }))} />
        )}
      </CardContent>
    </Card>
  );
}

function RealtimeList({ title, rows }: { title: string; rows: GaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <ul className="space-y-0.5 text-sm">
        {rows.slice(0, 5).map((r, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="truncate text-muted">{r.label || "(onbekend)"}</span>
            <span className="tabular-nums">{nf(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{children}</h2>;
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
