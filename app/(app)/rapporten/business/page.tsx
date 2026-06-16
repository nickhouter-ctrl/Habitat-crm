import type { ReactNode } from "react";
import { Building2, Phone, Navigation, MousePointerClick, MessageSquare, CalendarCheck } from "lucide-react";

import { BreakdownBars, VisitorsAreaChart } from "@/components/analytics-charts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import {
  gbpConfigured,
  getBusinessProfileData,
  type GbpTotals,
} from "@/lib/businessprofile";

export const metadata = { title: "Bedrijfsprofiel" };

const nf = (n: number) => Math.round(n).toLocaleString("nl-NL");

function deltaHint(cur: number, prev: number | undefined): { hint?: string; tone: "success" | "danger" | "neutral" } {
  if (prev == null || prev === 0) return { tone: "neutral" };
  const pct = ((cur - prev) / prev) * 100;
  return {
    hint: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs vorige 30d`,
    tone: pct >= 0 ? "success" : "danger",
  };
}

export default async function BusinessProfilePage() {
  if (!gbpConfigured()) {
    return (
      <>
        <PageHeader title="Bedrijfsprofiel" subtitle="Google Business Profile" />
        <EmptyState
          icon={<Building2 />}
          title="Koppeling nog niet geconfigureerd"
          description="Zet de env-variabele GBP_LOCATION_ID in Vercel (en zorg dat het OAuth-token de business.manage-scope heeft). Daarna verschijnen hier je gesprekken, routes, websiteklikken en vertoningen."
        />
      </>
    );
  }

  let data: Awaited<ReturnType<typeof getBusinessProfileData>> | null = null;
  let error: string | null = null;
  try {
    data = await getBusinessProfileData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const t = data?.totals;
  const p = data?.prev ?? undefined;

  return (
    <>
      <PageHeader
        title="Bedrijfsprofiel"
        subtitle={data ? `Google Business Profile · ${data.range.start} t/m ${data.range.end}` : "Google Business Profile"}
      />

      {error && (
        <Card className="mb-5 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kon de data niet ophalen: {error}
        </Card>
      )}

      {data && !t && (
        <EmptyState
          icon={<Building2 />}
          title="Nog geen interacties gemeten"
          description="Je bedrijfsprofiel is gekoppeld, maar er zijn nog geen interacties (of de data loopt ~2-3 dagen achter). Zodra mensen je profiel vinden in Google Zoeken/Maps vullen de cijfers en grafieken zich hier vanzelf."
        />
      )}

      {data && t && (
        <>
          {/* KPI's met vergelijking t.o.v. vorige periode */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(() => {
              const k = (label: string, cur: number, prev: number | undefined, icon: ReactNode) => {
                const d = deltaHint(cur, prev);
                return <StatTile key={label} label={label} value={nf(cur)} hint={d.hint} tone={d.tone} icon={icon} />;
              };
              return [
                k("Interacties", t.interactions, p?.interactions, <Building2 key="i" />),
                k("Gesprekken", t.calls, p?.calls, <Phone key="c" />),
                k("Routes", t.directions, p?.directions, <Navigation key="r" />),
                k("Websiteklikken", t.websiteClicks, p?.websiteClicks, <MousePointerClick key="w" />),
                k("Chats", t.conversations, p?.conversations, <MessageSquare key="m" />),
                k("Afspraken", t.bookings, p?.bookings, <CalendarCheck key="a" />),
              ];
            })()}
          </div>

          {/* Trend */}
          {data.trend.length > 0 && (
            <Card className="mb-5">
              <CardHeader>
                <CardTitle>Profiel-interacties per dag</CardTitle>
              </CardHeader>
              <CardContent>
                <VisitorsAreaChart data={data.trend} />
              </CardContent>
            </Card>
          )}

          {/* Vertoningen: hoe klanten je vonden */}
          <Card>
            <CardHeader>
              <CardTitle>Hoe klanten je vonden (vertoningen)</CardTitle>
            </CardHeader>
            <CardContent>
              {t.impressionsSearch + t.impressionsMaps === 0 ? (
                <p className="py-2 text-sm text-muted">Nog geen vertoningen.</p>
              ) : (
                <BreakdownBars
                  data={[
                    { name: "Google Zoeken", value: t.impressionsSearch },
                    { name: "Google Maps", value: t.impressionsMaps },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export type { GbpTotals };
