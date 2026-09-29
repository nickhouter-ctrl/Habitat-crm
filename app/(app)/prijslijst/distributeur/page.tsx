import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
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
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import { mailDistributeurPrijslijst } from "./actions";
import {
  KORTING_SHOWROOM,
  KORTING_VERKOOPPUNT,
  margeVerkooppunt,
} from "@/lib/distributeur-prijzen";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Prijzen verkooppunten" };
export const dynamic = "force-dynamic";

/**
 * Wat een verkooppunt betaalt voor Flexibel Stone — op het scherm, zodat je het
 * kunt nakijken voordat je het document verstuurt.
 *
 * Bewust een eigen lijst naast de B2B-prijzen: een architect of bouwbedrijf
 * koopt voor één project, een verkooppunt koopt in om door te verkopen en
 * krijgt daarom een betere prijs.
 */
export default async function DistributeurPrijzenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const serieParam = typeof sp.serie === "string" ? sp.serie : "";
  const sent = sp.sent === "1";
  const fout = typeof sp.error === "string" ? sp.error : null;
  const [{ items, series }, klanten] = await Promise.all([
    buildDistributeurItems("ALL"),
    db.select({ id: contacts.id, name: contacts.name, email: contacts.email }).from(contacts).orderBy(contacts.name),
  ]);
  const klantOpties = klanten
    .filter((c) => c.email)
    .map((c) => ({ value: c.id, label: `${c.name} <${c.email}>` }));
  const serie = series.includes(serieParam) ? serieParam : "";
  const zichtbaar = serie ? items.filter((i) => i.groep === serie) : items;

  const maten = zichtbaar.flatMap((i) => i.maten);
  const omzetkans = maten.reduce((n, m) => n + margeVerkooppunt(m), 0);

  const href = (s: string) => (s ? `/prijslijst/distributeur?serie=${encodeURIComponent(s)}` : "/prijslijst/distributeur");

  return (
    <>
      <PageHeader
        title="Prijzen verkooppunten"
        subtitle="Flexibel Stone — voor winkels en showrooms die doorverkopen"
        actions={
          <Link href="/prijslijst" className="text-sm text-accent hover:underline">
            Naar de gewone prijslijst
          </Link>
        }
      />

      <Card className="mb-5 border-[#e8dfd0] bg-[#fdfaf5]">
        <CardHeader>
          <CardTitle>Wat een verkooppunt betaalt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="max-w-3xl text-muted">
            De adviesprijs ligt vast — dat is de verkoopprijs die overal geldt, ook bij ons in de
            showroom. Een verkooppunt koopt in voor <strong>{KORTING_VERKOOPPUNT}% onder die prijs</strong>,
            dus zijn marge staat vast en er valt niets te onderhandelen. Materiaal voor zijn eigen
            showroom koopt hij met <strong>{KORTING_SHOWROOM}% korting</strong>: bedoeld om te tonen, niet om
            door te verkopen.
          </p>
          <p className="max-w-3xl text-muted">
            Dit staat los van de B2B-prijzen voor architecten en bouwbedrijven; die kopen voor één
            project en hebben hun eigen lijst onder{" "}
            <Link href="/prijslijst" className="text-accent hover:underline">
              Prijslijst verkoop
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Panelen" value={zichtbaar.length} hint={serie || "hele collectie"} />
        <StatTile label="Maten" value={maten.length} />
        <StatTile label="Korting verkooppunt" value={`${KORTING_VERKOOPPUNT}%`} />
        <StatTile label="Korting showroom" value={`${KORTING_SHOWROOM}%`} hint="alleen om te tonen" />
      </div>

      {sent && (
        <p className="mb-4 max-w-2xl rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          ✅ De prijslijst is verstuurd.
        </p>
      )}
      {fout && <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{fout}</p>}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Document voor de klant</CardTitle>
          <span className="text-xs text-muted">
            Zelfde huisstijl als de andere prijslijsten, met foto&apos;s. Dit is het bestand dat je na de
            beurs meestuurt.
          </span>
        </CardHeader>
        <CardContent>
          <form method="GET" action="/prijslijst/distributeur/pdf" className="flex flex-wrap items-end gap-4" target="_blank">
            <Field label="Serie" htmlFor="d-serie">
              <Select id="d-serie" name="serie" defaultValue={serie}>
                <option value="">— Volledige collectie —</option>
                {series.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Taal van de PDF" htmlFor="d-taal">
              <Select id="d-taal" name="taal" defaultValue="es">
                <option value="es">🇪🇸 Spaans (Español)</option>
                <option value="en">🇬🇧 Engels (English)</option>
                <option value="nl">🇳🇱 Nederlands</option>
                <option value="de">🇩🇪 Duits (Deutsch)</option>
              </Select>
            </Field>
            <Button type="submit">Download prijslijst</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Naar een klant van de beurs mailen</CardTitle>
          <span className="text-xs text-muted">
            De taal volgt het contact; staat die niet vast, dan gaat hij in het Spaans.
          </span>
        </CardHeader>
        <CardContent>
          <form action={mailDistributeurPrijslijst} className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Klant" htmlFor="m-contact" hint="Alleen contacten met e-mailadres">
              <Combobox name="contactId" options={klantOpties} placeholder="Zoek klant…" />
            </Field>
            <Field label="Taal" htmlFor="m-taal">
              <Select id="m-taal" name="taal" defaultValue="">
                <option value="">Taal van het contact</option>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="nl">Nederlands</option>
                <option value="de">Deutsch</option>
              </Select>
            </Field>
            <input type="hidden" name="serie" value={serie} />
            <div className="sm:col-span-2">
              <Field label="Bericht (optioneel)" htmlFor="m-bericht">
                <textarea
                  id="m-bericht"
                  name="bericht"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Leuk je te spreken op de beurs. Hierbij onze prijzen…"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Versturen…">Verstuur per e-mail</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1">
        <Link
          href={href("")}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            serie ? "text-muted hover:bg-surface hover:text-foreground" : "bg-accent/10 font-medium text-accent"
          }`}
        >
          Alle series
        </Link>
        {series.map((s) => (
          <Link
            key={s}
            href={href(s)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              serie === s ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      <Table wrapperClassName="max-h-[70vh] overflow-y-auto rounded-lg border">
        <THead className="sticky top-0 z-10 bg-surface">
          <tr>
            <Th>Paneel</Th>
            <Th>Maat</Th>
            <Th className="text-right">Advies incl. btw</Th>
            <Th className="text-right">Advies ex. btw</Th>
            <Th className="text-right">Verkooppunt −{KORTING_VERKOOPPUNT}%</Th>
            <Th className="text-right">Showroom −{KORTING_SHOWROOM}%</Th>
            <Th className="text-right">Marge verkooppunt</Th>
          </tr>
        </THead>
        <TBody>
          {zichtbaar.flatMap((item) =>
            item.maten.map((m, i) => (
              <Tr key={`${item.sku}-${m.dim}-${i}`}>
                <Td>
                  {i === 0 ? (
                    <>
                      <span className="font-medium">{item.naam}</span>
                      {item.sku && <span className="ml-2 text-xs text-muted">{item.sku}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-muted">↳</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {m.dim}
                  {m.inStock && (
                    <Badge tone="neutral" className="ml-2">
                      voorraad
                    </Badge>
                  )}
                </Td>
                <Td className="text-right tabular-nums text-muted">{formatEUR(m.adviesIncl)}</Td>
                <Td className="text-right tabular-nums text-muted">{formatEUR(m.adviesEx)}</Td>
                <Td className="text-right tabular-nums font-semibold">{formatEUR(m.verkooppunt)}</Td>
                <Td className="text-right tabular-nums text-muted">{formatEUR(m.showroom)}</Td>
                <Td className="text-right tabular-nums text-muted">{formatEUR(margeVerkooppunt(m))}</Td>
              </Tr>
            )),
          )}
        </TBody>
      </Table>

      <p className="mt-3 text-xs text-muted">
        Alle bedragen ex. btw tenzij anders vermeld. Samen {formatEUR(omzetkans)} marge over deze{" "}
        {maten.length} maten als een verkooppunt alles één keer verkoopt.
      </p>
    </>
  );
}
