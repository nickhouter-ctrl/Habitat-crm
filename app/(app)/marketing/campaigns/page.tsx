/**
 * Campagne-overzicht (brief §7): campagnes met effective_status, afkeuringen
 * PROMINENT bovenaan (niet weggestopt in een log), en een handmatige
 * statussync naast de cron.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

import { syncNowAction } from "@/app/(app)/marketing/campaigns/actions";
import { CampaignForm } from "@/components/marketing/campaigns/campaign-form";
import {
  describeReviewFeedback,
  PROBLEM_STATUSES,
} from "@/components/marketing/campaigns/feedback";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  buttonClass,
  type BadgeTone,
} from "@/components/ui";
import { db } from "@/lib/db";
import { adCampaigns, ads, adSets, creativeSpecs } from "@/lib/db/schema";

export const metadata = { title: "Meta-campagnes" };

function statusTone(status: string | null): BadgeTone {
  if (!status) return "neutral";
  if (PROBLEM_STATUSES.has(status)) return "danger";
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED" || status === "ADSET_PAUSED" || status === "CAMPAIGN_PAUSED") return "warning";
  return "neutral";
}

export default async function CampaignsPage() {
  const campaigns = await db
    .select({
      campaign: adCampaigns,
      // Kolommen expliciet kwalificeren: in een correlated subquery rendert
      // Drizzle `${adCampaigns.id}` als kaal "id", en dat is daar ambigu
      // (ad_sets/ads hebben zelf ook een id) — Postgres weigert de query dan.
      adSetCount: sql<number>`(select count(*)::int from ${adSets} where ${adSets}.campaign_id = ${adCampaigns}.id)`,
      adCount: sql<number>`(select count(*)::int from ${ads} a join ${adSets} s on a.ad_set_id = s.id where s.campaign_id = ${adCampaigns}.id)`,
    })
    .from(adCampaigns)
    .orderBy(desc(adCampaigns.createdAt));

  // Afkeuringen en publicatiefouten — prominent bovenaan (§7).
  const problems = await db
    .select({
      ad: ads,
      adSetName: adSets.name,
      campaignId: adSets.campaignId,
      headline: sql<string | null>`${creativeSpecs.copy} ->> 'headline'`,
    })
    .from(ads)
    .innerJoin(adSets, eq(ads.adSetId, adSets.id))
    .leftJoin(creativeSpecs, eq(creativeSpecs.id, ads.specId))
    .where(inArray(ads.effectiveStatus, [...PROBLEM_STATUSES]))
    .orderBy(desc(ads.updatedAt))
    .limit(20);

  const lastSync = campaigns
    .map((c) => c.campaign.lastSyncedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <PageHeader
        title="Meta-campagnes"
        subtitle={
          lastSync
            ? `Laatste statussync: ${lastSync.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}`
            : "Nog niet gesynchroniseerd met Meta"
        }
        actions={
          <form action={syncNowAction}>
            <button type="submit" className={buttonClass({ variant: "secondary" })}>
              <RefreshCw className="size-4" aria-hidden /> Status nu verversen
            </button>
          </form>
        }
      />

      {problems.length > 0 && (
        <Card className="mb-5 border-red-300 bg-red-50 p-4" role="alert">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="size-4" aria-hidden />
            {problems.length} advertentie{problems.length === 1 ? "" : "s"} met een probleem
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {problems.map(({ ad, adSetName, campaignId, headline }) => (
              <li key={ad.id} className="rounded-md bg-white/70 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger">{ad.effectiveStatus}</Badge>
                  <span className="font-medium">{ad.name}</span>
                  <span className="text-muted">
                    in <Link href={`/marketing/campaigns/${campaignId}`} className="underline">{adSetName}</Link>
                    {headline ? ` · "${headline}"` : ""}
                  </span>
                </div>
                {describeReviewFeedback(ad.reviewFeedback).map((line) => (
                  <p key={line} className="mt-1 text-danger">
                    {line}
                  </p>
                ))}
                <p className="mt-1 text-xs text-muted">
                  Wat nu: bij een afkeuring — dupliceer de creative, pas hem aan en publiceer
                  opnieuw. Bij een publicatiefout — probeer opnieuw vanaf de campagnepagina.
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-5 p-4">
        <h2 className="mb-3 text-sm font-medium">Nieuwe campagne</h2>
        <CampaignForm />
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState
          title="Nog geen campagnes"
          description="Maak hierboven een campagne aan; advertentiesets en advertenties volgen op de campagnepagina."
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Campagne</Th>
              <Th>Doelstelling</Th>
              <Th>Status (Meta)</Th>
              <Th className="text-right">Sets</Th>
              <Th className="text-right">Ads</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {campaigns.map(({ campaign, adSetCount, adCount }) => (
              <Tr key={campaign.id}>
                <Td>
                  <Link
                    href={`/marketing/campaigns/${campaign.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {campaign.name}
                  </Link>
                </Td>
                <Td className="text-muted">{campaign.objective ?? "—"}</Td>
                <Td>
                  <Badge tone={statusTone(campaign.effectiveStatus)}>
                    {campaign.effectiveStatus ?? "nog niet in Meta"}
                  </Badge>
                </Td>
                <Td className="text-right tabular-nums">{adSetCount}</Td>
                <Td className="text-right tabular-nums">{adCount}</Td>
                <Td className="text-right">
                  <Link
                    href={`/marketing/campaigns/${campaign.id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    Beheer
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <p className="mt-4 text-xs text-muted">
        Advertenties worden altijd <strong>gepauzeerd</strong> aangemaakt (§3.4); activeren
        gebeurt bewust in Meta Ads Manager. Planning is in Europe/Madrid — Meta rekent in de
        tijdzone van het advertentie-account.
      </p>
    </>
  );
}
