import { tekst as uiTranslation } from '@/lib/i18n/server';
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

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Leads") };
}

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
  const uiT = await uiTranslation();
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
        title={uiT("Leads")}
        subtitle={uiT("Bedrijven vinden en de lijst schoonhouden. Het versturen gebeurt bij Broadcast.")}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/leads/prospects" className="underline">
              {uiT("Prospects")} </Link>
            <Link href="/leads/import" className="underline">
              {uiT("Lijst importeren")} </Link>
            <Link href="/broadcast" className="underline">
              {uiT("Broadcast")} </Link>
          </div>
        }
      />

      {flashAdded && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-success">
          {flashAdded} {uiT("prospect(s) toegevoegd")}{flashFound ? uiT(" (van {v0} gevonden)", { v0: flashFound }) : ""}
          {flashNoEmail ? uiT(" · {v0} overgeslagen zonder e-mail", { v0: flashNoEmail }) : ""}.
        </p>
      )}
      {flashMails && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-success">
          {flashMails} {uiT("e-mailadres(sen) alsnog gevonden.")} </p>
      )}
      {flashError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-danger">{uiT("Fout:")} {flashError}</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label={uiT("Prospects")} value={String(prospectCount)} hint={uiT("{v0} met e-mail", { v0: prospectCount - missingEmailCount })} tone="neutral" />
        <StatTile label={uiT("Afgemeld / suppressie")} value={String(suppressedCount)} hint={uiT("worden nooit gemaild")} tone="neutral" />
        <StatTile
          label={uiT("Versturen")}
          value="Broadcast"
          hint={uiT("campagnes maken en verzenden")}
          tone="accent"
          href="/broadcast"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bedrijven zoeken via Google Places */}
        <Card>
          <CardHeader>
            <CardTitle>{uiT("Bedrijven zoeken")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              <strong>{uiT("OpenStreetMap")}</strong> {uiT("is gratis en werkt direct (geen key nodig). Google Places geeft vaak meer treffers, maar vereist")} <code>GOOGLE_MAPS_API_KEY</code>
              {placesConfigured() ? uiT(" (ingesteld ✓)") : uiT(" (nog niet ingesteld)")}.
            </p>
            <form action={searchAndImportProspects} className="space-y-3">
              <Field label={uiT("Bron")} htmlFor="source">
                <Select id="source" name="source" defaultValue="osm">
                  <option value="osm">{uiT("OpenStreetMap — gratis")}</option>
                  <option value="places" disabled={!placesConfigured()}>
                    {uiT("Google Places")}{placesConfigured() ? "" : uiT(" — key vereist")}
                  </option>
                </Select>
              </Field>
              <Field label={uiT("Soort bedrijf")} htmlFor="category">
                <Select id="category" name="category" defaultValue="architect">
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={uiT("Regio")} htmlFor="region" hint={uiT("plaats of gebied")}>
                  <Input id="region" name="region" defaultValue="Jávea, Alicante" required />
                </Field>
                <Field label={uiT("Straal (km)")} htmlFor="radiusKm" hint={uiT("leeg = hele regio · max 50")}>
                  <Input id="radiusKm" name="radiusKm" type="number" min={0} max={50} placeholder={uiT("bv. 20")} />
                </Field>
              </div>
              <Field label={uiT("Extra zoekterm (optioneel)")} htmlFor="freeText" hint={uiT("overschrijft de standaardterm")}>
                <Input id="freeText" name="freeText" placeholder={uiT("bv. keukens, tegels…")} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="onlyWithEmail" defaultChecked />
                {uiT("Alleen bedrijven mét e-mailadres importeren")} </label>
              <Button type="submit" variant="primary">
                {uiT("Zoeken & importeren")} </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lijst importeren — het echte werk gebeurt op /leads/import */}
        <Card>
          <CardHeader>
            <CardTitle>{uiT("Lijst importeren")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {uiT("Een Excel- of CSV-bestand met bedrijven uploaden. Je kiest zelf welke kolom wat is, en je krijgt eerst te zien wat er gaat gebeuren: hoeveel nieuw, hoeveel dubbel, hoeveel al klant en hoeveel afgemeld. Pas daarna wordt er iets weggeschreven.")} </p>
            <p className="text-muted">
              {uiT("Ze komen als")} <strong>{uiT("prospect")}</strong> {uiT("in het systeem, niet in je contactenlijst. Wordt er iemand klant, dan zet je die met één klik over.")} </p>
            <LinkButton href="/leads/import" variant="primary">
              {uiT("Bestand importeren")} </LinkButton>
          </CardContent>
        </Card>
      </div>

      {/* De lijst zelf staat op /leads/prospects: die pagina pagineert en zoekt
          server-side, want bij duizenden rijen is een tabel op deze pagina
          onwerkbaar (en loog de teller erboven). */}
      <Card className="mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{uiT("Prospects (")}{prospectCount})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <FindEmailsButton missingCount={missingEmailCount} />
            <LinkButton href="/leads/prospects" variant="secondary" size="sm">
              {uiT("Lijst openen")} </LinkButton>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {prospectCount === 0 ? (
            <p className="text-muted">{uiT("Nog geen prospects. Zoek bedrijven hierboven of importeer een lijst.")}</p>
          ) : (
            <p className="text-muted">
              {prospectCount} {uiT("bedrijven in de lijst,")} {prospectCount - missingEmailCount} {uiT("met e-mailadres.")}{" "}
              <Link href="/leads/prospects" className="underline">
                {uiT("Zoeken, filteren en beheren")} </Link>{" "}
              ·{" "}
              <Link href="/leads/import" className="underline">
                {uiT("lijst importeren")} </Link>
            </p>
          )}
        </CardContent>
      </Card>

    </>
  );
}
