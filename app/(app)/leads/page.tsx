import { isNull } from "drizzle-orm";
import Link from "next/link";

import {
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
} from "@/components/ui";
import { db } from "@/lib/db";
import { emailSuppressions, prospects } from "@/lib/db/schema";
import { placesConfigured } from "@/lib/leads/places";
import { searchAndImportProspects } from "./actions";
import { FindEmailsButton } from "./find-emails-button";

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

  const [prospectCount, suppressedCount, missingEmailCount] = await Promise.all([
    db.$count(prospects),
    db.$count(emailSuppressions),
    db.$count(prospects, isNull(prospects.email)),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Bedrijven vinden en de lijst schoonhouden. Het versturen gebeurt bij Broadcast."
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/leads/prospects" className="underline">
              Prospects
            </Link>
            <Link href="/leads/import" className="underline">
              Lijst importeren
            </Link>
            <Link href="/broadcast" className="underline">
              Broadcast
            </Link>
          </div>
        }
      />

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
        <StatTile
          label="Versturen"
          value="Broadcast"
          hint="campagnes maken en verzenden"
          tone="accent"
          href="/broadcast"
        />
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

      {/* De lijst zelf staat op /leads/prospects: die pagina pagineert en zoekt
          server-side, want bij duizenden rijen is een tabel op deze pagina
          onwerkbaar (en loog de teller erboven). */}
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
