/**
 * Marketing → Advertenties live: cijfers rechtstreeks uit Meta (geen opslag),
 * ververst elke 30 seconden. Periode via ?p=today|yesterday|last_7d|this_month|maximum.
 */
import Link from "next/link";

import { AdPreview } from "@/components/ad-preview";
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
import { getLiveStats, parsePeriod, PERIODS, type AdCard, type LiveStats } from "@/lib/meta/live-stats";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Advertenties live") };
}

const nl = (n: number) => n.toLocaleString("nl-NL");
const dec = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
const opt = (n: number | null) => (n === null ? "—" : nl(n));
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

function dateRange(start: string | null, stop: string | null): string {
  const f = (d: string) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  if (!start) return "—";
  return stop && stop !== start ? `${f(start)} – ${f(stop)}` : f(start);
}

function AdCardView({
  ad,
  uiT,
  periodLabel,
}: {
  ad: AdCard;
  uiT: (s: string) => string;
  /** Alleen bij lopende advertenties: cijfers van de gekozen periode tonen. */
  periodLabel?: string;
}) {
  const L = ad.lifetime;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{ad.name}</p>
          <p className="text-xs text-muted">
            {ad.campaign} · {dateRange(L.start, L.stop)}
          </p>
        </div>
        {statusBadge(ad.status)}
      </div>
      {ad.preview ? (
        <AdPreview
          images={ad.preview.images}
          caption={ad.preview.caption}
          likes={ad.preview.likes}
          comments={ad.preview.comments}
          cta={ad.preview.cta}
        />
      ) : (
        <p className="text-sm text-muted">{uiT("Geen voorvertoning beschikbaar.")}</p>
      )}
      {periodLabel && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted">{periodLabel}</p>
          <dl className="grid grid-cols-4 gap-2 text-sm">
            <div><dt className="text-xs text-muted">{uiT("Weergaven")}</dt><dd className="font-medium">{nl(ad.impressions)}</dd></div>
            <div><dt className="text-xs text-muted">{uiT("Klikken")}</dt><dd className="font-medium">{nl(ad.clicks)}</dd></div>
            <div><dt className="text-xs text-muted">{uiT("Leads")}</dt><dd className="font-medium">{nl(ad.leads)}</dd></div>
            <div><dt className="text-xs text-muted">{uiT("Uitgegeven")}</dt><dd className="font-medium">{formatEUR(ad.spend.toFixed(2))}</dd></div>
          </dl>
        </div>
      )}
      <div>
        <p className="mb-1 text-xs font-medium text-muted">{uiT("Totaal sinds de start")}</p>
        <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
          <div><dt className="text-xs text-muted">{uiT("Bereik")}</dt><dd className="font-medium">{nl(L.reach)}</dd></div>
          <div><dt className="text-xs text-muted">{uiT("Weergaven")}</dt><dd className="font-medium">{nl(L.impressions)}</dd></div>
          <div><dt className="text-xs text-muted">{uiT("Klikken")}</dt><dd className="font-medium">{nl(L.clicks)}</dd></div>
          <div><dt className="text-xs text-muted">{uiT("Leads")}</dt><dd className="font-medium">{nl(L.leads)}</dd></div>
          <div><dt className="text-xs text-muted">{uiT("Uitgegeven")}</dt><dd className="font-medium">{formatEUR(L.spend.toFixed(2))}</dd></div>
          <div><dt className="text-xs text-muted">{uiT("Per klik")}</dt><dd className="font-medium">{L.clicks ? formatEUR((L.spend / L.clicks).toFixed(2)) : "—"}</dd></div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {ad.previewLink && (
          <a href={ad.previewLink} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
            {uiT("Voorvertoning bij Meta")}
          </a>
        )}
        {ad.preview?.permalink && (
          <a href={ad.preview.permalink} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
            {uiT("Post op Instagram")}
          </a>
        )}
      </div>
    </Card>
  );
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
      <AutoRefresh seconds={30} />
      <PageHeader
        title={uiT("Advertenties live")}
        subtitle={uiT("Rechtstreeks uit Meta (Facebook + Instagram), ververst elke 30 seconden. Meta loopt zelf een paar minuten achter.")}
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
          {stats.activeAds.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{uiT("Nu actief")}</h2>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {stats.activeAds.map((ad) => (
                  <AdCardView key={ad.id} ad={ad} uiT={uiT} periodLabel={uiT(PERIODS[period])} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{uiT("Advertenties")}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatTile label={uiT("Bereik")} value={nl(stats.total.reach)} hint={uiT("unieke mensen")} tone="accent" />
              <StatTile label={uiT("Weergaven")} value={nl(stats.total.impressions)} hint={`${uiT("frequentie")} ${dec(stats.extras.frequency)}×`} />
              <StatTile label={uiT("Klikken")} value={nl(stats.total.clicks)} hint={`CTR ${dec(stats.extras.linkCtr)}%`} tone="info" />
              <StatTile label={uiT("Websitebezoeken")} value={nl(stats.extras.landingPageViews)} hint={uiT("pagina echt geladen")} tone="info" />
              <StatTile label={uiT("Leads")} value={nl(stats.total.leads)} hint={uiT("formulier, bellen, WhatsApp")} tone="success" />
              <StatTile label={uiT("Interacties")} value={nl(stats.extras.engagements)} hint={uiT("likes, reacties, delen, opslaan")} />
              <StatTile label={uiT("Uitgegeven")} value={formatEUR(stats.total.spend.toFixed(2))} />
              <StatTile label={uiT("Kosten per klik")} value={stats.extras.cpc ? formatEUR(stats.extras.cpc.toFixed(2)) : "—"} />
              <StatTile label={uiT("Per 1.000 weergaven")} value={stats.extras.cpm ? formatEUR(stats.extras.cpm.toFixed(2)) : "—"} hint="CPM" />
              <StatTile label={uiT("Kosten per lead")} value={stats.total.leads ? formatEUR((stats.total.spend / stats.total.leads).toFixed(2)) : "—"} tone="success" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{uiT("Accounts")}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">Facebook · Habitat One Javea</span>
                  <span className="text-2xl font-semibold">{stats.facebook.followers === null ? "—" : nl(stats.facebook.followers)}<span className="ml-1 text-sm font-normal text-muted">{uiT("volgers")}</span></span>
                </div>
                <dl className="grid grid-cols-4 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">{uiT("Mensen bereikt")}</dt><dd className="font-medium">{opt(stats.facebook.reached)}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Weergaven")}</dt><dd className="font-medium">{opt(stats.facebook.views)}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Interacties")}</dt><dd className="font-medium">{opt(stats.facebook.engagements)}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Nieuwe volgers")}</dt><dd className="font-medium">{opt(stats.facebook.newFollows)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">{uiT("Paginacijfers (organisch + betaald) in de gekozen periode; Meta werkt deze met een paar uur vertraging bij.")}</p>
              </Card>
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">Instagram · @habitatonejavea</span>
                  <span className="text-2xl font-semibold">{stats.instagram.followers === null ? "—" : nl(stats.instagram.followers)}<span className="ml-1 text-sm font-normal text-muted">{uiT("volgers")}</span></span>
                </div>
                <dl className="grid grid-cols-4 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">{uiT("Volgend")}</dt><dd className="font-medium">{opt(stats.instagram.follows)}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Posts")}</dt><dd className="font-medium">{opt(stats.instagram.posts)}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Likes laatste 6")}</dt><dd className="font-medium">{nl(stats.instagram.recent.reduce((n, m) => n + m.likes, 0))}</dd></div>
                  <div><dt className="text-xs text-muted">{uiT("Reacties laatste 6")}</dt><dd className="font-medium">{nl(stats.instagram.recent.reduce((n, m) => n + m.comments, 0))}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">{uiT("Profielbezoeken en Instagram-bereik geeft Meta pas zodra Instagram aan het bedrijfsportfolio gekoppeld is.")}</p>
              </Card>
            </div>
          </section>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">{uiT("Advertenties per platform")}</h2>
            {stats.platforms.length === 0 ? (
              <p className="text-sm text-muted">{uiT("Nog geen weergaven in deze periode.")}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {stats.platforms.map((p) => {
                  const share = stats!.total.impressions ? (p.impressions / stats!.total.impressions) * 100 : 0;
                  return (
                    <div key={p.platform} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold">{PLATFORM[p.platform] ?? p.platform}</span>
                        <span className="text-sm text-muted">{Math.round(share)}% {uiT("van de weergaven")}</span>
                      </div>
                      <div className="mb-3 h-2 overflow-hidden rounded-full bg-background">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                      </div>
                      <dl className="grid grid-cols-4 gap-2 text-sm">
                        <div><dt className="text-xs text-muted">{uiT("Bereik")}</dt><dd className="font-medium">{nl(p.reach)}</dd></div>
                        <div><dt className="text-xs text-muted">{uiT("Weergaven")}</dt><dd className="font-medium">{nl(p.impressions)}</dd></div>
                        <div><dt className="text-xs text-muted">{uiT("Klikken")}</dt><dd className="font-medium">{nl(p.clicks)}</dd></div>
                        <div><dt className="text-xs text-muted">{uiT("Uitgegeven")}</dt><dd className="font-medium">{formatEUR(p.spend.toFixed(2))}</dd></div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {stats.instagram.recent.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">{uiT("Laatste Instagram-posts")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {stats.instagram.recent.map((m) => (
                  <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Instagram-CDN, wisselende URL's
                      <img src={m.image} alt="" className="aspect-square w-full object-cover transition group-hover:opacity-90" />
                    ) : (
                      <div className="aspect-square w-full bg-background" />
                    )}
                    <div className="space-y-1 p-2 text-xs">
                      <div className="flex gap-3 font-medium"><span>♥ {nl(m.likes)}</span><span>💬 {nl(m.comments)}</span></div>
                      <p className="line-clamp-2 text-muted">{m.caption}</p>
                      <p className="text-muted">{new Date(m.timestamp).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</p>
                    </div>
                  </a>
                ))}
              </div>
            </Card>
          )}

          {stats.pastAds.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{uiT("Eerdere advertenties")}</h2>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {stats.pastAds.map((ad) => (
                  <AdCardView key={ad.id} ad={ad} uiT={uiT} />
                ))}
              </div>
            </section>
          )}

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
