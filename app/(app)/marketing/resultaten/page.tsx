/**
 * Marketing → Advertenties live: cijfers rechtstreeks uit Meta (geen opslag),
 * ververst elke minuut. Periode via ?p=today|yesterday|last_7d|this_month|maximum.
 */
import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { tekst as uiTranslation } from "@/lib/i18n/server";
import { metaErrorMessage } from "@/lib/meta/client";
import { getLiveStats, parsePeriod, PERIODS, type LiveStats } from "@/lib/meta/live-stats";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Advertenties live") };
}

const nl = (n: number) => n.toLocaleString("nl-NL");
const PLATFORM: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
};

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge tone="success">actief</Badge>;
  if (status === "PAUSED" || status === "CAMPAIGN_PAUSED" || status === "ADSET_PAUSED") return <Badge>gepauzeerd</Badge>;
  if (status === "PENDING_REVIEW" || status === "IN_PROCESS") return <Badge tone="warning">in beoordeling</Badge>;
  if (status === "DISAPPROVED" || status === "WITH_ISSUES") return <Badge tone="danger">probleem</Badge>;
  return <Badge>{status.toLowerCase() || "—"}</Badge>;
}

export default async function AdvertentiesLivePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const uiT = await uiTranslation();
  const period = parsePeriod((await searchParams).p);

  let stats: LiveStats | null = null;
  let error: string | null = null;
  try {
    stats = await getLiveStats(period);
  } catch (e) {
    error = metaErrorMessage(e);
  }

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader
        title={uiT("Advertenties live")}
        subtitle={uiT("Rechtstreeks uit Meta (Facebook + Instagram), ververst elke minuut. Meta loopt zelf een paar minuten achter.")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
              <Link
                key={p}
                href={`/marketing/resultaten?p=${p}`}
                className={
                  "rounded-full border px-3 py-1 text-sm " +
                  (p === period ? "border-accent bg-accent/10 font-medium text-accent" : "text-muted hover:bg-background")
                }
              >
                {uiT(PERIODS[p])}
              </Link>
            ))}
          </div>
        }
      />

      {error || !stats ? (
        <EmptyState title={uiT("Cijfers niet beschikbaar")} description={error ?? undefined} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label={uiT("Bereik")} value={nl(stats.total.reach)} hint={uiT("unieke mensen")} tone="accent" />
            <StatTile label={uiT("Weergaven")} value={nl(stats.total.impressions)} />
            <StatTile label={uiT("Klikken")} value={nl(stats.total.clicks)} hint={uiT("naar de website")} tone="info" />
            <StatTile label={uiT("Leads")} value={nl(stats.total.leads)} hint={uiT("formulier, bellen, WhatsApp")} tone="success" />
            <StatTile label={uiT("Uitgegeven")} value={formatEUR(stats.total.spend.toFixed(2))} />
            <StatTile
              label={uiT("Instagram-volgers")}
              value={stats.followers === null ? "—" : nl(stats.followers)}
              hint={uiT("nu")}
            />
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">{uiT("Waar zijn de advertenties gezien?")}</h2>
            {stats.platforms.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen weergaven in deze periode.")}</p>
            ) : (
              <div className="space-y-2">
                {stats.platforms.map((p) => {
                  const share = stats!.total.impressions ? (p.impressions / stats!.total.impressions) * 100 : 0;
                  return (
                    <div key={p.platform} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0">{PLATFORM[p.platform] ?? p.platform}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-muted">
                        {nl(p.impressions)} ({Math.round(share)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <div className="border-b px-5 py-3.5 text-sm font-semibold">{uiT("Campagnes")}</div>
            <Table>
              <THead>
                <Tr>
                  <Th>{uiT("Campagne")}</Th>
                  <Th>{uiT("Status")}</Th>
                  <Th className="text-right">{uiT("Budget/dag")}</Th>
                  <Th className="text-right">{uiT("Bereik")}</Th>
                  <Th className="text-right">{uiT("Klikken")}</Th>
                  <Th className="text-right">{uiT("Leads")}</Th>
                  <Th className="text-right">{uiT("Uitgegeven")}</Th>
                </Tr>
              </THead>
              <TBody>
                {stats.campaigns.map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.name}</Td>
                    <Td>{statusBadge(c.status)}</Td>
                    <Td className="text-right">{c.dailyBudget === null ? "—" : formatEUR(c.dailyBudget.toFixed(2))}</Td>
                    <Td className="text-right">{nl(c.reach)}</Td>
                    <Td className="text-right">{nl(c.clicks)}</Td>
                    <Td className="text-right">{nl(c.leads)}</Td>
                    <Td className="text-right">{formatEUR(c.spend.toFixed(2))}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <div className="border-b px-5 py-3.5 text-sm font-semibold">{uiT("Advertenties (posts)")}</div>
            {stats.ads.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">{uiT("Nog geen weergaven in deze periode.")}</p>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>{uiT("Advertentie")}</Th>
                    <Th>{uiT("Campagne")}</Th>
                    <Th>{uiT("Status")}</Th>
                    <Th className="text-right">{uiT("Weergaven")}</Th>
                    <Th className="text-right">{uiT("Klikken")}</Th>
                    <Th className="text-right">{uiT("Leads")}</Th>
                    <Th className="text-right">{uiT("Uitgegeven")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {stats.ads.map((a) => (
                    <Tr key={a.id}>
                      <Td>{a.name}</Td>
                      <Td className="text-muted">{a.campaign}</Td>
                      <Td>{statusBadge(a.status)}</Td>
                      <Td className="text-right">{nl(a.impressions)}</Td>
                      <Td className="text-right">{nl(a.clicks)}</Td>
                      <Td className="text-right">{nl(a.leads)}</Td>
                      <Td className="text-right">{formatEUR(a.spend.toFixed(2))}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
