import { desc, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { campaignRecipients, emailCampaigns, emailSuppressions, prospects } from "@/lib/db/schema";
import { placesConfigured } from "@/lib/leads/places";
import { groupLabel } from "@/lib/leads/groups";
import { createCampaign, deleteCampaign, searchAndImportProspects } from "./actions";
import { FindEmailsButton } from "./find-emails-button";
import { Verzendtempo } from "./verzendtempo";

export const metadata = { title: "Leads" };

const CATEGORY_LABEL: Record<string, string> = {
  architect: "Architect",
  aannemer: "Aannemer",
  makelaar: "Makelaar",
  interieur: "Interieur",
  projectontwikkelaar: "Projectontwikkelaar",
  hovenier: "Hovenier",
  overig: "Overig",
};
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flashAdded = typeof sp.added === "string" ? sp.added : null;
  const flashFound = typeof sp.found === "string" ? sp.found : null;
  const flashError = typeof sp.error === "string" ? sp.error : null;
  const flashNoEmail = typeof sp.noemail === "string" ? sp.noemail : null;
  const flashMails = typeof sp.mails === "string" ? sp.mails : null;

  const [prospectCount, groupRowsRaw, campaigns, suppressedCount, missingEmailCount, inWachtrijTotaal] = await Promise.all([
    db.$count(prospects),
    db.execute(sql`
      SELECT collection, count(*)::int AS n, min(image_url) AS image
      FROM products
      WHERE is_active AND collection IS NOT NULL AND collection <> '' AND image_url IS NOT NULL
      GROUP BY collection ORDER BY count(*) DESC LIMIT 60
    `),
    db.query.emailCampaigns.findMany({ orderBy: desc(emailCampaigns.createdAt), limit: 15 }),
    db.$count(emailSuppressions),
    db.$count(prospects, isNull(prospects.email)),
    db.$count(campaignRecipients, inArray(campaignRecipients.status, ["queued", "sending"])),
  ]);

  const groupOpts = (
    (groupRowsRaw as unknown as { rows?: Array<{ collection: string; n: number; image: string | null }> }).rows ??
    (groupRowsRaw as unknown as Array<{ collection: string; n: number; image: string | null }>)
  ).map((r) => ({ collection: r.collection, n: Number(r.n), image: r.image }));

  return (
    <>
      <PageHeader title="Leads" subtitle="B2B-bedrijven vinden en benaderen — met controle vóór verzending" />

      {flashAdded && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-success">
          {flashAdded} prospect(s) toegevoegd{flashFound ? ` (van ${flashFound} gevonden)` : ""}
          {flashNoEmail ? ` · ${flashNoEmail} overgeslagen zonder e-mail` : ""}.
        </p>
      )}
      {flashMails && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-success">
          {flashMails} e-mailadres(sen) alsnog gevonden.
        </p>
      )}
      {flashError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-danger">Fout: {flashError}</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Prospects" value={String(prospectCount)} hint={`${prospectCount - missingEmailCount} met e-mail`} tone="neutral" />
        <StatTile label="Afgemeld / suppressie" value={String(suppressedCount)} hint="worden nooit gemaild" tone="neutral" />
        <StatTile label="Campagnes" value={String(campaigns.length)} tone="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bedrijven zoeken via Google Places */}
        <Card>
          <CardHeader>
            <CardTitle>Bedrijven zoeken</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              <strong>OpenStreetMap</strong> is gratis en werkt direct (geen key nodig). Google Places geeft vaak meer
              treffers, maar vereist <code>GOOGLE_MAPS_API_KEY</code>
              {placesConfigured() ? " (ingesteld ✓)" : " (nog niet ingesteld)"}.
            </p>
            <form action={searchAndImportProspects} className="space-y-3">
              <Field label="Bron" htmlFor="source">
                <Select id="source" name="source" defaultValue="osm">
                  <option value="osm">OpenStreetMap — gratis</option>
                  <option value="places" disabled={!placesConfigured()}>
                    Google Places{placesConfigured() ? "" : " — key vereist"}
                  </option>
                </Select>
              </Field>
              <Field label="Soort bedrijf" htmlFor="category">
                <Select id="category" name="category" defaultValue="architect">
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Regio" htmlFor="region" hint="plaats of gebied">
                  <Input id="region" name="region" defaultValue="Jávea, Alicante" required />
                </Field>
                <Field label="Straal (km)" htmlFor="radiusKm" hint="leeg = hele regio · max 50">
                  <Input id="radiusKm" name="radiusKm" type="number" min={0} max={50} placeholder="bv. 20" />
                </Field>
              </div>
              <Field label="Extra zoekterm (optioneel)" htmlFor="freeText" hint="overschrijft de standaardterm">
                <Input id="freeText" name="freeText" placeholder="bv. keukens, tegels…" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="onlyWithEmail" defaultChecked />
                Alleen bedrijven mét e-mailadres importeren
              </label>
              <Button type="submit" variant="primary">
                Zoeken &amp; importeren
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lijst importeren — het echte werk gebeurt op /leads/import */}
        <Card>
          <CardHeader>
            <CardTitle>Lijst importeren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Een Excel- of CSV-bestand met bedrijven uploaden. Je kiest zelf welke kolom wat is, en je krijgt eerst te
              zien wat er gaat gebeuren: hoeveel nieuw, hoeveel dubbel, hoeveel al klant en hoeveel afgemeld. Pas daarna
              wordt er iets weggeschreven.
            </p>
            <p className="text-muted">
              Ze komen als <strong>prospect</strong> in het systeem, niet in je contactenlijst. Wordt er iemand klant,
              dan zet je die met één klik over.
            </p>
            <LinkButton href="/leads/import" variant="primary">
              Bestand importeren
            </LinkButton>
          </CardContent>
        </Card>
      </div>

      {/* Nieuwe campagne */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Nieuwe campagne</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCampaign} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Naam (intern)" htmlFor="name">
                <Input id="name" name="name" required placeholder="Voorjaarsselectie architecten" />
              </Field>
              <Field label="Taal van de e-mail" htmlFor="language" hint="Spaanse bedrijven → Español">
                <Select id="language" name="language" defaultValue="es">
                  <option value="es">Español (standaard)</option>
                  <option value="nl">Nederlands</option>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </Select>
              </Field>
            </div>
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              Onderwerp en tekst hoef je hier niet in te vullen — die stel je op de volgende stap met AI op (in de
              huisstijl), of je typt ze zelf. De verplichte afzendergegevens + afmeldlink zitten er altijd omheen.
            </p>

            <div>
              <p className="mb-1.5 text-sm font-medium">Doelgroep (categorieën)</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <label key={v} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="categories" value={v} defaultChecked={v !== "overig"} />
                    {l}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Alleen prospects met e-mail in deze categorieën worden benaderd.</p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="includeCustomers" />
                Ook naar bestaande klanten sturen (contacten met e-mail)
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Productgroepen in de mail</p>
              {groupOpts.length === 0 ? (
                <p className="text-xs text-muted">Geen productgroepen met foto beschikbaar.</p>
              ) : (
                <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto rounded-lg border p-2 sm:grid-cols-3">
                  {groupOpts.map((g) => (
                    <label
                      key={g.collection}
                      className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-xs hover:bg-background"
                    >
                      <input type="checkbox" name="groups" value={g.collection} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {g.image && <img src={g.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{groupLabel(g.collection)}</span>
                        <span className="text-muted">{g.n} producten</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" variant="primary">
              Concept aanmaken → onderwerp & tekst
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recente campagnes */}
      {campaigns.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Campagnes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <tr>
                  <Th>Naam</Th>
                  <Th>Status</Th>
                  <Th>Verzonden</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {campaigns.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Link href={`/leads/campaigns/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted">{c.subject}</span>
                    </Td>
                    <Td>
                      <Badge tone={c.status === "sent" ? "success" : c.status === "sending" ? "accent" : "neutral"}>
                        {c.status === "sent" ? "Verzonden" : c.status === "sending" ? "Bezig" : "Concept"}
                      </Badge>
                    </Td>
                    <Td>{c.sentCount}</Td>
                    <Td>
                      <form action={deleteCampaign.bind(null, c.id)}>
                        <button type="submit" className="text-xs text-danger hover:underline">
                          Verwijderen
                        </button>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* De lijst zelf staat op /leads/prospects: die pagina pagineert en zoekt
          server-side, want bij duizenden rijen is een tabel op deze pagina
          onwerkbaar (en loog de teller erboven). */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Verzendtempo teGaan={inWachtrijTotaal || prospectCount - missingEmailCount} />
        <Card>
          <CardHeader>
            <CardTitle>Wachtrij</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {inWachtrijTotaal > 0 ? (
              <p>
                <strong className="tabular-nums">{inWachtrijTotaal}</strong> mails staan klaar om verstuurd te worden.
                Het systeem werkt de wachtrij zelf af binnen het verzendvenster.
              </p>
            ) : (
              <p className="text-muted">
                Niets in de wachtrij. Open een campagne en zet hem in de wachtrij om te beginnen.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Prospects ({prospectCount})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <FindEmailsButton missingCount={missingEmailCount} />
            <LinkButton href="/leads/prospects" variant="secondary" size="sm">
              Lijst openen
            </LinkButton>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {prospectCount === 0 ? (
            <p className="text-muted">Nog geen prospects. Zoek bedrijven hierboven of importeer een lijst.</p>
          ) : (
            <p className="text-muted">
              {prospectCount} bedrijven in de lijst, {prospectCount - missingEmailCount} met e-mailadres.{" "}
              <Link href="/leads/prospects" className="underline">
                Zoeken, filteren en beheren
              </Link>{" "}
              ·{" "}
              <Link href="/leads/import" className="underline">
                lijst importeren
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

    </>
  );
}
