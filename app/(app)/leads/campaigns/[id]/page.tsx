import { and, eq, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { buildCampaignEmail } from "@/lib/leads/campaign";
import { groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { aiCopyConfigured } from "@/lib/leads/ai-copy";
import { countRecipients, updateCampaignCopy } from "../../actions";
import { CampaignActions } from "./campaign-actions";

export const metadata = { title: "Campagne" };

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
      return { collection, label: groupLabel(collection), url: groupUrl(collection), imageUrl: rep?.imageUrl ?? null };
    }),
  );

  const recipientCount = await countRecipients(id);
  const hasCopy = !!campaign.subject.trim();

  const { html } = buildCampaignEmail({
    subject: campaign.subject,
    introText: campaign.introText,
    groups,
    unsubToken: "TEST",
    companyName: "Voorbeeldbedrijf BV",
  });

  const cats = (campaign.audience?.categories ?? []) as string[];
  const saveCopy = updateCampaignCopy.bind(null, id);

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
              <div className="flex items-center gap-2">
                <Badge tone={campaign.status === "sent" ? "success" : campaign.status === "sending" ? "accent" : "neutral"}>
                  {campaign.status === "sent" ? "Verzonden" : campaign.status === "sending" ? "Bezig" : "Concept"}
                </Badge>
                {campaign.sentCount > 0 && <span className="text-sm text-muted">{campaign.sentCount} verstuurd</span>}
              </div>
              <p className="text-sm">
                <span className="font-medium">{recipientCount}</span> ontvanger(s) — bedrijven met e-mail in de gekozen
                categorieën, niet afgemeld.
              </p>

              <CampaignActions
                campaignId={id}
                recipientCount={recipientCount}
                hasCopy={hasCopy}
                aiAvailable={aiCopyConfigured()}
              />

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warning">
                Stuur eerst een testmail naar jezelf. Verzenden gaat pas na een expliciete bevestiging. Elke mail bevat de
                verplichte afzendergegevens + een werkende afmeldlink.
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
