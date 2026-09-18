import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { db } from "@/lib/db";
import { bulkMailSettings, campaignRecipients, products } from "@/lib/db/schema";
import { buildCampaignEmail, type CampaignLang } from "@/lib/leads/campaign";
import { groupHeroUrl, groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { aiCopyConfigured } from "@/lib/leads/ai-copy";
import { wachtrijStand } from "@/lib/leads/queue";
import { bulkGereed } from "@/lib/leads/transport";
import { dagCap } from "@/lib/leads/warmup";
import { madridMiddernacht } from "@/lib/tz-madrid";
import { countRecipients, setBulkPaused, setCampaignAudience, updateCampaignCopy } from "../../actions";
import { NoodstopKnop } from "./noodstop";
import { CampaignActions } from "./campaign-actions";

export const metadata = { title: "Campagne" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Concept",
  queued: "In de wachtrij",
  sending: "Aan het versturen",
  paused: "Gepauzeerd",
  sent: "Verzonden",
};
const STATUS_TONE: Record<string, "neutral" | "accent" | "warning" | "success"> = {
  draft: "neutral",
  queued: "accent",
  sending: "accent",
  paused: "warning",
  sent: "success",
};

/** Vandaag verstuurd over alle campagnes heen — de dagcap is een domeingrens. */
async function vandaagUit(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(gte(campaignRecipients.sentAt, madridMiddernacht(new Date())));
  return Number(r?.n ?? 0);
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await db.query.emailCampaigns.findFirst({ where: (c, { eq: e }) => e(c.id, id) });
  if (!campaign) notFound();

  const groups: CampaignGroup[] = await Promise.all(
    campaign.groups.map(async (collection) => {
      const rep = await db.query.products.findFirst({
        where: and(eq(products.collection, collection), eq(products.isActive, true), isNotNull(products.imageUrl)),
        columns: { imageUrl: true },
      });
      return {
        collection,
        label: groupLabel(collection, campaign.language),
        url: groupUrl(collection, campaign.language),
        imageUrl: groupHeroUrl(collection) ?? rep?.imageUrl ?? null,
      };
    }),
  );

  const recipientCount = await countRecipients(id);
  const hasCopy = !!campaign.subject.trim();
  const stand = await wachtrijStand(id);
  const inWachtrij = (stand.queued ?? 0) + (stand.sending ?? 0);
  const [instellingen] = await db.select().from(bulkMailSettings).where(eq(bulkMailSettings.id, "default"));
  const cap = dagCap(instellingen?.warmupStartedAt ?? null, new Date(), instellingen?.dailyCapOverride ?? null);
  const vandaag = await vandaagUit();
  const laatsteFouten = await db
    .select({ email: campaignRecipients.email, fout: campaignRecipients.lastError, pogingen: campaignRecipients.attempts })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, id), isNotNull(campaignRecipients.lastError)))
    .limit(10);

  const { html } = buildCampaignEmail({
    lang: campaign.language as CampaignLang,
    subject: campaign.subject,
    introText: campaign.introText,
    groups,
    unsubToken: "TEST",
    companyName: "Empresa Ejemplo S.L.",
  });

  const cats = (campaign.audience?.categories ?? []) as string[];
  const saveCopy = updateCampaignCopy.bind(null, id);
  const setAudience = setCampaignAudience.bind(null, id);

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.subject || "Nog geen onderwerp"}
        actions={
          <Link href="/leads" className="text-sm text-muted hover:underline">
            ← Terug naar leads
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Live preview */}
        <Card>
          <CardHeader>
            <CardTitle>Voorbeeld van de e-mail</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm">
              <span className="text-muted">Onderwerp: </span>
              {campaign.subject || <span className="text-muted">— nog leeg, genereer of vul hiernaast in —</span>}
            </p>
            <iframe title="E-mailvoorbeeld" srcDoc={html} className="h-[720px] w-full rounded-lg border bg-white" />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Onderwerp & tekst opstellen + verzenden */}
          <Card>
            <CardHeader>
              <CardTitle>Onderwerp &amp; tekst · verzenden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[campaign.status] ?? "neutral"}>{STATUS_LABEL[campaign.status] ?? campaign.status}</Badge>
                {campaign.sentCount > 0 && <span className="text-sm text-muted">{campaign.sentCount} verstuurd</span>}
                {instellingen?.paused && <Badge tone="danger">Verzenden staat stil</Badge>}
              </div>

              {/* Voortgang: wat staat er in de wachtrij, en wat is er gebeurd. */}
              {(inWachtrij > 0 || campaign.sentCount > 0) && (
                <div className="space-y-2 rounded-lg border bg-background/50 p-3 text-sm">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>In wachtrij: <strong className="tabular-nums">{inWachtrij}</strong></span>
                    <span>Verstuurd: <strong className="tabular-nums">{stand.sent ?? 0}</strong></span>
                    {(stand.failed ?? 0) > 0 && <span className="text-danger">Mislukt: {stand.failed}</span>}
                    {(stand.bounced ?? 0) > 0 && <span className="text-warning">Bounces: {stand.bounced}</span>}
                    {(stand.complained ?? 0) > 0 && <span className="text-danger">Klachten: {stand.complained}</span>}
                  </div>
                  <p className="text-xs text-muted">
                    Vandaag {vandaag} van {cap} verstuurd (over alle campagnes).{" "}
                    {inWachtrij > 0 && cap > vandaag
                      ? `Bij dit tempo is deze campagne rond over ongeveer ${Math.max(1, Math.ceil(inWachtrij / Math.max(1, cap)))} verzenddagen.`
                      : ""}
                  </p>
                  {instellingen?.pausedReason && (
                    <p className="text-xs text-danger">{instellingen.pausedReason}</p>
                  )}
                </div>
              )}

              <p className="text-sm">
                <span className="font-medium">{recipientCount}</span> ontvanger(s) — bedrijven (en evt. klanten) met
                e-mail, niet afgemeld, binnen de frequentiecap.
              </p>

              <form action={setAudience} className="rounded-lg border bg-background/50 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="includeCustomers"
                    defaultChecked={!!campaign.audience?.includeCustomers}
                  />
                  Ook naar bestaande klanten sturen (contacten met e-mail)
                </label>
                <button type="submit" className="mt-2 text-xs font-medium text-accent hover:underline">
                  Bijwerken
                </button>
              </form>

              <CampaignActions
                campaignId={id}
                recipientCount={recipientCount}
                hasCopy={hasCopy}
                aiAvailable={aiCopyConfigured()}
                inWachtrij={inWachtrij}
                bulkGereed={bulkGereed()}
              />

              <NoodstopKnop paused={!!instellingen?.paused} action={setBulkPaused} />

              {laatsteFouten.length > 0 && (
                <details className="rounded-lg border bg-background/50 p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-muted">
                    Laatste meldingen ({laatsteFouten.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted">
                    {laatsteFouten.map((f) => (
                      <li key={f.email}>
                        <span className="font-mono">{f.email}</span> — {f.fout} (poging {f.pogingen})
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warning">
                Stuur eerst een testmail naar jezelf. Er gaat niets in één keer uit: het systeem verstuurt verspreid over
                de dagen, opbouwend van 200 naar 1.000 per dag, en stopt zelf bij te veel bounces. Elke mail bevat de
                verplichte afzendergegevens en een werkende afmeldlink.
              </div>
            </CardContent>
          </Card>

          {/* Handmatig aanpassen */}
          <Card>
            <CardHeader>
              <CardTitle>Handmatig aanpassen</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveCopy} className="space-y-3">
                <Field label="Onderwerp" htmlFor="subject">
                  <Input id="subject" name="subject" defaultValue={campaign.subject} placeholder="Onderwerp van de e-mail" />
                </Field>
                <Field label="Introtekst" htmlFor="introText">
                  <Textarea id="introText" name="introText" rows={4} defaultValue={campaign.introText ?? ""} />
                </Field>
                <button type="submit" className="text-sm font-medium text-accent hover:underline">
                  Tekst opslaan
                </button>
              </form>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted">Doelgroep: </span>
                {cats.length ? cats.join(", ") : "alle categorieën"}
              </div>
              <div>
                <span className="text-muted">Productgroepen: </span>
                {groups.length ? groups.map((g) => g.label).join(", ") : "geen"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
