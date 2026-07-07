import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { emailCampaigns, products } from "@/lib/db/schema";
import { buildCampaignEmail, type CampaignProduct } from "@/lib/leads/campaign";
import { countRecipients } from "../../actions";
import { CampaignActions } from "./campaign-actions";

export const metadata = { title: "Campagne" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await db.query.emailCampaigns.findFirst({ where: (c, { eq }) => eq(c.id, id) });
  if (!campaign) notFound();

  const productRows: CampaignProduct[] = campaign.productIds.length
    ? (
        await db.query.products.findMany({
          where: inArray(products.id, campaign.productIds),
          columns: { name: true, imageUrl: true, collection: true },
        })
      ).map((r) => ({ name: r.name, imageUrl: r.imageUrl, collection: r.collection }))
    : [];

  const recipientCount = await countRecipients(id);

  // Preview met een voorbeeldbedrijf (afmeldtoken TEST).
  const { html } = buildCampaignEmail({
    introText: campaign.introText,
    products: productRows,
    unsubToken: "TEST",
    companyName: "Voorbeeldbedrijf BV",
  });

  const cats = (campaign.audience?.categories ?? []) as string[];

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.subject}
        actions={
          <Link href="/leads" className="text-sm text-muted hover:underline">
            ← Terug naar leads
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Live preview */}
        <Card>
          <CardHeader>
            <CardTitle>Voorbeeld van de e-mail</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              title="E-mailvoorbeeld"
              srcDoc={html}
              className="h-[720px] w-full rounded-lg border bg-white"
            />
          </CardContent>
        </Card>

        {/* Controle + verzenden */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Controleren &amp; verzenden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge
                  tone={campaign.status === "sent" ? "success" : campaign.status === "sending" ? "accent" : "neutral"}
                >
                  {campaign.status === "sent" ? "Verzonden" : campaign.status === "sending" ? "Bezig" : "Concept"}
                </Badge>
                {campaign.sentCount > 0 && <span className="text-sm text-muted">{campaign.sentCount} verstuurd</span>}
              </div>

              <p className="text-sm">
                <span className="font-medium">{recipientCount}</span> ontvanger(s) — bedrijven met e-mail in de gekozen
                categorieën, niet afgemeld.
              </p>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warning">
                Stuur eerst een testmail naar jezelf en controleer de mail. Verzenden gaat pas na een expliciete
                bevestiging. Elke mail bevat de verplichte afzendergegevens + een werkende afmeldlink.
              </div>

              <CampaignActions campaignId={id} recipientCount={recipientCount} />
            </CardContent>
          </Card>

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
                <span className="text-muted">Producten: </span>
                {productRows.length}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
