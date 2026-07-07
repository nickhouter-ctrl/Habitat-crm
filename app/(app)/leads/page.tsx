import { desc, sql } from "drizzle-orm";
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
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Textarea,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { emailCampaigns, emailSuppressions, prospects } from "@/lib/db/schema";
import type { BadgeTone } from "@/components/ui";
import { placesConfigured } from "@/lib/leads/places";
import { groupLabel } from "@/lib/leads/groups";
import { createCampaign, deleteProspect, importCsv, searchAndImportProspects } from "./actions";

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
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  new: { label: "Nieuw", tone: "info" },
  emailed: { label: "Gemaild", tone: "accent" },
  replied: { label: "Gereageerd", tone: "success" },
  bounced: { label: "Bounce", tone: "warning" },
  unsubscribed: { label: "Afgemeld", tone: "danger" },
  converted: { label: "Klant", tone: "success" },
  skipped: { label: "Overgeslagen", tone: "neutral" },
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

  const [rows, groupRowsRaw, campaigns, suppressedCount] = await Promise.all([
    db.query.prospects.findMany({ orderBy: desc(prospects.createdAt), limit: 300 }),
    db.execute(sql`
      SELECT collection, count(*)::int AS n, min(image_url) AS image
      FROM products
      WHERE is_active AND collection IS NOT NULL AND collection <> '' AND image_url IS NOT NULL
      GROUP BY collection ORDER BY count(*) DESC LIMIT 60
    `),
    db.query.emailCampaigns.findMany({ orderBy: desc(emailCampaigns.createdAt), limit: 15 }),
    db.$count(emailSuppressions),
  ]);

  const groupOpts = (
    (groupRowsRaw as unknown as { rows?: Array<{ collection: string; n: number; image: string | null }> }).rows ??
    (groupRowsRaw as unknown as Array<{ collection: string; n: number; image: string | null }>)
  ).map((r) => ({ collection: r.collection, n: Number(r.n), image: r.image }));

  const withEmail = rows.filter((r) => r.email).length;

  return (
    <>
      <PageHeader title="Leads" subtitle="B2B-bedrijven vinden en benaderen — met controle vóór verzending" />

      {flashAdded && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-success">
          {flashAdded} prospect(s) toegevoegd{flashFound ? ` (van ${flashFound} gevonden)` : ""}.
        </p>
      )}
      {flashError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-danger">Fout: {flashError}</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Prospects" value={String(rows.length)} hint={`${withEmail} met e-mail`} tone="neutral" />
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
              <Field label="Regio" htmlFor="region" hint="bv. Jávea, Dénia, Moraira, Alicante">
                <Input id="region" name="region" defaultValue="Jávea, Alicante" required />
              </Field>
              <Field label="Extra zoekterm (optioneel)" htmlFor="freeText" hint="overschrijft de standaardterm">
                <Input id="freeText" name="freeText" placeholder="bv. keukens, tegels…" />
              </Field>
              <Button type="submit" variant="primary">
                Zoeken &amp; importeren
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* CSV / lijst importeren */}
        <Card>
          <CardHeader>
            <CardTitle>Lijst importeren</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={importCsv} className="space-y-3">
              <Field label="Categorie" htmlFor="csvCategory">
                <Select id="csvCategory" name="category" defaultValue="overig">
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Plak regels" htmlFor="csv" hint="per regel: naam, e-mail, website, telefoon, plaats">
                <Textarea id="csv" name="csv" rows={6} placeholder={"Studio X, info@studiox.es, studiox.es, +34..., Jávea\n..."} />
              </Field>
              <Button type="submit" variant="secondary">
                Importeren
              </Button>
            </form>
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
            <Field label="Naam (intern)" htmlFor="name">
              <Input id="name" name="name" required placeholder="Voorjaarsselectie architecten" />
            </Field>
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
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Prospect-lijst */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Prospects ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              Nog geen prospects. Zoek bedrijven of importeer een lijst hierboven.
            </p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Bedrijf</Th>
                  <Th>Categorie</Th>
                  <Th>E-mail</Th>
                  <Th>Plaats</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const del = deleteProspect.bind(null, r.id);
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <span className="font-medium">{r.companyName}</span>
                        {r.website && (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-accent hover:underline"
                          >
                            {r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                          </a>
                        )}
                      </Td>
                      <Td>{CATEGORY_LABEL[r.category] ?? r.category}</Td>
                      <Td>{r.email ?? <span className="text-xs text-muted">geen e-mail</span>}</Td>
                      <Td>{r.city ?? "—"}</Td>
                      <Td>
                        <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                      </Td>
                      <Td>
                        <form action={del}>
                          <button type="submit" className="text-xs text-danger hover:underline">
                            Verwijderen
                          </button>
                        </form>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
