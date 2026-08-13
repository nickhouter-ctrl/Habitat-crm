/**
 * Concurrentendashboard — fase 5 (brief §8b). Gebouwd op het officiële
 * DSA-advertentiearchief van Meta (ads_archive), niet op scraping. Het
 * signaal dat telt is looptijd: langlopers ≥ 30 dagen zijn de kern.
 * Beelden van concurrenten worden nooit gekopieerd — alleen de snapshot-link.
 */
import { desc, eq } from "drizzle-orm";
import { AlertTriangle, ExternalLink } from "lucide-react";

import {
  Badge,
  Card,
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
  AddCompetitorForm,
  CompetitorSyncButton,
} from "@/components/marketing/competitors/competitor-controls";
import { db } from "@/lib/db";
import { competitorAds, competitors } from "@/lib/db/schema";
import {
  fetchArchiveTokenExpiry,
  summarizeCompetitorAds,
  tokenExpiryWarning,
} from "@/lib/meta/ads-archive";
import { cn } from "@/lib/utils";
import { removeCompetitor } from "./actions";

export const metadata = { title: "Concurrenten" };

const SEGMENT_LABELS: Record<string, string> = {
  materials: "Materialen",
  contractor: "Aannemer",
  architect: "Architect",
  estate_agent: "Makelaar",
};

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Spaans",
  en: "Engels",
  nl: "Nederlands",
  de: "Duits",
  fr: "Frans",
};

function formatDate(date: Date | null): string {
  return date
    ? date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

export default async function CompetitorsPage() {
  const now = new Date();
  const rows = await db.select().from(competitors).orderBy(competitors.name);

  // Token-verloopwaarschuwing (§8b) — alleen proberen als er een token is.
  const tokenWarning = process.env.META_ADS_ARCHIVE_TOKEN
    ? tokenExpiryWarning(await fetchArchiveTokenExpiry(), now)
    : "META_ADS_ARCHIVE_TOKEN is nog niet ingesteld — de wekelijkse sync kan het advertentiearchief niet lezen (zie .env.example).";

  const perCompetitor = await Promise.all(
    rows.map(async (competitor) => {
      const ads = await db
        .select()
        .from(competitorAds)
        .where(eq(competitorAds.competitorId, competitor.id))
        .orderBy(desc(competitorAds.lastSeen));
      return { competitor, ads, summary: summarizeCompetitorAds(ads, now) };
    }),
  );
  const totalAds = perCompetitor.reduce((sum, c) => sum + c.ads.length, 0);
  const lastSeen = perCompetitor
    .flatMap((c) => c.ads.map((a) => a.lastSeen))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <PageHeader
        title="Concurrenten"
        subtitle={`${rows.length} gevolgd · ${totalAds} advertenties in het archief${
          lastSeen ? ` · laatst gesynct ${formatDate(lastSeen)}` : ""
        }`}
        actions={<CompetitorSyncButton />}
      />

      {tokenWarning && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>{tokenWarning}</p>
        </div>
      )}

      <div className="mb-5">
        <AddCompetitorForm />
      </div>

      {perCompetitor.length === 0 ? (
        <EmptyState
          title="Nog geen concurrenten gevolgd"
          description="Voeg een concurrent toe met zijn Meta Page-ID (uit de Ad Library-URL, parameter view_all_page_id). De wekelijkse sync haalt daarna automatisch het publieke advertentiearchief op."
        />
      ) : (
        <div className="space-y-5">
          {perCompetitor.map(({ competitor, ads, summary }) => {
            const stillRunning = ads.filter((a) => !a.deliveryStop).length;
            const lastMonth = summary.inflowByMonth.at(-1);
            return (
              <Card key={competitor.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/60 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{competitor.name}</h2>
                    {competitor.segment && (
                      <Badge tone="neutral" className="text-[10px]">
                        {SEGMENT_LABELS[competitor.segment] ?? competitor.segment}
                      </Badge>
                    )}
                    {competitor.website && (
                      <a
                        href={competitor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted underline-offset-2 hover:underline"
                      >
                        {competitor.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                  <form action={removeCompetitor}>
                    <input type="hidden" name="id" value={competitor.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
                    >
                      Stop met volgen
                    </button>
                  </form>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
                  <StatTile label="Advertenties" value={ads.length} hint={`${stillRunning} lopen nu`} />
                  <StatTile
                    label="Langlopers (≥ 30 d)"
                    value={summary.longRunners.length}
                    hint="het signaal dat telt"
                  />
                  <StatTile
                    label="Nieuw deze maand"
                    value={lastMonth?.count ?? 0}
                    hint={`instroom: ${summary.inflowByMonth.map((m) => m.count).join(" · ")} (laatste 6 mnd)`}
                  />
                  <StatTile
                    label="EU-bereik (som)"
                    value={summary.totalReach.toLocaleString("nl-NL")}
                    hint="ruwe indicatie van budget"
                  />
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-muted">Talen / platforms</p>
                    <p className="flex flex-wrap gap-1">
                      {Object.entries(summary.languageSplit)
                        .sort(([, a], [, b]) => b - a)
                        .map(([lang, count]) => (
                          <Badge key={lang} tone="info" className="text-[10px]">
                            {LANGUAGE_LABELS[lang] ?? lang}: {count}
                          </Badge>
                        ))}
                      {Object.entries(summary.platformSplit)
                        .sort(([, a], [, b]) => b - a)
                        .map(([platform, count]) => (
                          <Badge key={platform} tone="neutral" className="text-[10px]">
                            {platform}: {count}
                          </Badge>
                        ))}
                      {ads.length === 0 && <span className="text-muted">nog geen data</span>}
                    </p>
                  </div>
                </div>

                {summary.longRunners.length > 0 ? (
                  <Table>
                    <THead>
                      <tr>
                        <Th>Advertentietekst (fragment)</Th>
                        <Th>Gestart</Th>
                        <Th className="text-right">Looptijd</Th>
                        <Th>Status</Th>
                        <Th className="text-right">EU-bereik</Th>
                        <Th>Archief</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {summary.longRunners.map((ad) => (
                        <Tr key={ad.metaAdArchiveId}>
                          <Td className="max-w-[24rem]">
                            <span className="line-clamp-2 text-xs" title={ad.bodies?.[0]}>
                              {ad.bodies?.[0] ?? ad.titles?.[0] ?? "—"}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap text-xs text-muted">
                            {formatDate(ad.deliveryStart)}
                          </Td>
                          <Td
                            className={cn(
                              "text-right tabular-nums",
                              (ad.daysRunning ?? 0) >= 60 && "font-semibold text-accent",
                            )}
                          >
                            {ad.daysRunning != null ? `${ad.daysRunning} d` : "—"}
                          </Td>
                          <Td>
                            {ad.deliveryStop ? (
                              <Badge tone="neutral">gestopt {formatDate(ad.deliveryStop)}</Badge>
                            ) : (
                              <Badge tone="success">loopt nog</Badge>
                            )}
                          </Td>
                          <Td className="text-right tabular-nums text-muted">
                            {ad.euTotalReach != null ? ad.euTotalReach.toLocaleString("nl-NL") : "—"}
                          </Td>
                          <Td>
                            {ad.snapshotUrl ? (
                              <a
                                href={ad.snapshotUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-accent underline-offset-2 hover:underline"
                              >
                                Bekijk in Ad Library
                                <ExternalLink className="size-3" aria-hidden />
                              </a>
                            ) : (
                              "—"
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="border-t border-border/60 px-4 py-3 text-xs text-muted">
                    {ads.length === 0
                      ? "Nog geen advertenties opgehaald — draai de sync."
                      : "Nog geen langlopers (≥ 30 dagen) — nog te weinig historie om iets uit af te leiden."}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
