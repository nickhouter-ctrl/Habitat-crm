/**
 * Campagnepagina (brief §7): advertentiesets met planning (Europe/Madrid,
 * dagdelen alleen mét looptijdbudget) en per set de advertenties met
 * effective_status en review-feedback. Publiceren = gepauzeerd (§3.4).
 */
import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { AdSetForm } from "@/components/marketing/campaigns/ad-set-form";
import {
  describeReviewFeedback,
  PROBLEM_STATUSES,
} from "@/components/marketing/campaigns/feedback";
import { PublishAdForm } from "@/components/marketing/campaigns/publish-ad-form";
import { describeDayparting, formatMadrid } from "@/components/marketing/campaigns/schedule";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { db } from "@/lib/db";
import { adCampaigns, ads, adSets, creativeSpecs } from "@/lib/db/schema";

const SEGMENT_LABELS: Record<string, string> = {
  local_es: "Lokaal (ES)",
  expat_nl: "Expat NL",
  expat_en: "Expat EN",
  expat_de: "Expat DE",
};

function statusTone(status: string | null): BadgeTone {
  if (!status) return "neutral";
  if (PROBLEM_STATUSES.has(status)) return "danger";
  if (status === "ACTIVE") return "success";
  if (status.includes("PAUSED")) return "warning";
  return "neutral";
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
  if (!campaign) notFound();

  const sets = await db
    .select()
    .from(adSets)
    .where(eq(adSets.campaignId, id))
    .orderBy(asc(adSets.createdAt));

  const setIds = sets.map((s) => s.id);
  const adRows = setIds.length
    ? await db
        .select({
          ad: ads,
          spec: creativeSpecs,
        })
        .from(ads)
        .leftJoin(creativeSpecs, eq(creativeSpecs.id, ads.specId))
        .orderBy(desc(ads.createdAt))
    : [];

  const approvedSpecs = await db
    .select()
    .from(creativeSpecs)
    .where(eq(creativeSpecs.status, "approved"))
    .orderBy(desc(creativeSpecs.createdAt))
    .limit(100);
  const approvedOptions = approvedSpecs.map((s) => ({
    id: s.id,
    label: `${s.copy?.headline ?? "(zonder kop)"} — ${s.template}/${s.format}/${s.locale.toUpperCase()}`,
  }));

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.objective ?? "geen doelstelling"} · Meta-status: ${campaign.effectiveStatus ?? "nog niet in Meta"}`}
        actions={
          <LinkButton variant="secondary" href="/marketing/campaigns">
            Alle campagnes
          </LinkButton>
        }
      />

      {sets.length === 0 && (
        <EmptyState
          title="Nog geen advertentiesets"
          description="Maak hieronder de eerste advertentieset aan — met taal én doelgroep-as, daar leert de leerlaag langs."
        />
      )}

      <div className="space-y-5">
        {sets.map((set) => {
          const setAds = adRows.filter((r) => r.ad.adSetId === set.id);
          const budget = set.lifetimeBudgetEur
            ? `${formatEUR(set.lifetimeBudgetEur)} looptijd`
            : set.dailyBudgetEur
              ? `${formatEUR(set.dailyBudgetEur)}/dag`
              : "geen budget";
          const dayparting = describeDayparting(set.dayparting);
          return (
            <Card key={set.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{set.name}</h2>
                  <Badge tone={statusTone(set.effectiveStatus)}>
                    {set.effectiveStatus ?? "nog niet in Meta"}
                  </Badge>
                  <Badge tone="neutral">{set.locale?.toUpperCase() ?? "—"}</Badge>
                  <Badge tone="neutral">
                    {set.audienceSegment ? SEGMENT_LABELS[set.audienceSegment] : "doelgroep-as ontbreekt"}
                  </Badge>
                </div>
                <p className="text-sm text-muted">
                  {budget}
                  {set.startTime && ` · start ${formatMadrid(set.startTime)}`}
                  {set.endTime && ` · einde ${formatMadrid(set.endTime)}`}
                  {dayparting && ` · ${dayparting}`}
                </p>
              </div>

              {/* Advertenties in deze set */}
              {setAds.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {setAds.map(({ ad, spec }) => {
                    const feedback = describeReviewFeedback(ad.reviewFeedback);
                    const problem = ad.effectiveStatus && PROBLEM_STATUSES.has(ad.effectiveStatus);
                    return (
                      <li
                        key={ad.id}
                        className={`rounded-md border p-2.5 text-sm ${problem ? "border-red-300 bg-red-50" : "border-border"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {spec && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/creatives/render?id=${spec.id}`}
                              alt=""
                              className="h-12 w-12 rounded object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="font-medium">{ad.name}</span>
                          <Badge tone={statusTone(ad.effectiveStatus)}>
                            {ad.effectiveStatus ?? "niet gepubliceerd"}
                          </Badge>
                          {spec && (
                            <a
                              href={`/marketing/creatives/${spec.id}`}
                              className="text-xs text-accent hover:underline"
                            >
                              {spec.template}/{spec.format}/{spec.locale.toUpperCase()}
                            </a>
                          )}
                        </div>
                        {feedback.length > 0 && (
                          <div className="mt-1.5 space-y-0.5 text-danger" role="alert">
                            {feedback.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                            <p className="text-xs text-muted">
                              Wat nu: dupliceer de creative, pas hem aan en publiceer opnieuw —
                              een lopende advertentie wijzig je niet (§3.5).
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Publiceren in deze set */}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  Advertentie toevoegen (gepauzeerd publiceren)
                </summary>
                <div className="mt-3">
                  {set.metaId ? (
                    <PublishAdForm adSetId={set.id} approvedSpecs={approvedOptions} />
                  ) : (
                    <p className="text-sm text-muted">
                      Deze advertentieset staat nog niet in Meta. Publiceren kan zodra de set een
                      Meta-id heeft (volgt bij de eerste campagnepush vanuit Business Manager of
                      een latere iteratie van de publicatieketen).
                    </p>
                  )}
                </div>
              </details>

              {/* Planning wijzigen */}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  Planning en budget wijzigen
                </summary>
                <div className="mt-3">
                  <AdSetForm
                    campaignId={id}
                    initial={{
                      id: set.id,
                      name: set.name,
                      locale: set.locale ?? undefined,
                      audienceSegment: set.audienceSegment,
                      startTime: set.startTime,
                      endTime: set.endTime,
                      dailyBudgetEur: set.dailyBudgetEur,
                      lifetimeBudgetEur: set.lifetimeBudgetEur,
                      dayparting: set.dayparting as never,
                    }}
                  />
                </div>
              </details>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 text-sm font-medium">Nieuwe advertentieset</h2>
        <AdSetForm campaignId={id} />
      </Card>
    </>
  );
}
