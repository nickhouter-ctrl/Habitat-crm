import Link from "next/link";

import { Combobox } from "@/components/combobox";
import { TabPanel, TabsBar, TabsRoot } from "@/components/tabs";
import { SubmitButton } from "@/components/submit-button";
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
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import { KORTING_SHOWROOM, KORTING_VERKOOPPUNT } from "@/lib/distributeur-prijzen";
import { formatEUR } from "@/lib/utils";
import { FileText, Table2 } from "lucide-react";
import { mailDistributeurPrijslijst } from "./actions";

export const metadata = { title: "Prijzen verkooppunten" };
export const dynamic = "force-dynamic";

/**
 * Wat een verkooppunt betaalt voor Flexibel Stone.
 *
 * Eén scherm met drie dingen, in die volgorde: de afspraak, het document dat je
 * verstuurt, en de prijzen zelf om na te kijken. De marge staat er bewust niet
 * bij: bij een vaste korting van 50% is de marge in euro's precies gelijk aan
 * de inkoopprijs, en een kolom die hetzelfde getal herhaalt maakt een prijslijst
 * alleen maar moeilijker te lezen.
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
  const serie = series.includes(serieParam) ? serieParam : "";
  const zichtbaar = serie ? items.filter((i) => i.groep === serie) : items;
  const aantalMaten = zichtbaar.reduce((n, i) => n + i.maten.length, 0);

  const klantOpties = klanten
    .filter((c) => c.email)
    .map((c) => ({ value: c.id, label: `${c.name} <${c.email}>` }));

  return (
    <>
      <PageHeader
        title="Prijzen verkooppunten"
        subtitle="Flexibel Stone — voor winkels en showrooms die doorverkopen"
        actions={
          <Link href="/prijslijst" className="text-sm text-accent hover:underline">
            Prijslijst verkoop
          </Link>
        }
      />

      {sent && (
        <p className="mb-5 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          De prijslijst is verstuurd.
        </p>
      )}
      {fout && <p className="mb-5 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{fout}</p>}

      {/* ---- De afspraak: twee getallen, verder niets ---- */}
      <Card className="mb-5">
        <CardContent className="grid gap-6 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center">
          <div>
            <p className="font-display text-4xl font-semibold tabular-nums text-accent">−{KORTING_VERKOOPPUNT}%</p>
            <p className="mt-1 text-sm font-medium">Inkoop verkooppunt</p>
          </div>
          <div className="sm:border-l sm:pl-6">
            <p className="font-display text-4xl font-semibold tabular-nums">−{KORTING_SHOWROOM}%</p>
            <p className="mt-1 text-sm font-medium">Eigen showroom</p>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-muted sm:border-l sm:pl-6">
            De adviesprijs ligt vast — overal dezelfde, ook bij ons. Daardoor staat de marge van het
            verkooppunt vast en valt er niets te onderhandelen. Showroommateriaal is om te tonen, niet
            om door te verkopen. Losse projectprijzen voor architecten en bouwbedrijven staan bij{" "}
            <Link href="/prijslijst" className="text-accent hover:underline">
              Prijslijst verkoop
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {/* Twee dingen doe je hier: prijzen nakijken en het document versturen.
          In tabs, zodat je niet langs het een moet scrollen om bij het ander te
          komen. */}
      <TabsRoot defaultTab="prijzen" ids={["prijzen", "document"]}>
        <TabsBar
          tabs={[
            { id: "prijzen", label: "Prijzen", icon: <Table2 />, badge: aantalMaten },
            { id: "document", label: "Document versturen", icon: <FileText /> },
          ]}
        />

        <TabPanel id="prijzen">
        {/* ---- De prijzen zelf ---- */}
        <Card>
          <CardHeader className="flex-wrap">
            <div>
              <CardTitle>{serie || "Alle series"}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {zichtbaar.length} {zichtbaar.length === 1 ? "paneel" : "panelen"} · {aantalMaten}{" "}
                {aantalMaten === 1 ? "maat" : "maten"} · bedragen ex. btw
              </p>
            </div>
            {/* Negentig series in een rij knoppen werd een muur; een keuzelijst is
                rustiger en op een smal scherm ook nog bruikbaar. */}
            <form method="GET" action="/prijslijst/distributeur" className="flex items-end gap-2">
              <Select name="serie" defaultValue={serie} className="min-w-52">
                <option value="">Alle series</option>
                {series.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Toon
              </Button>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            <Table wrapperClassName="max-h-[68vh] overflow-y-auto">
              <THead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <Th>Maat</Th>
                  <Th className="text-right">Adviesprijs</Th>
                  <Th className="text-right">Verkooppunt −{KORTING_VERKOOPPUNT}%</Th>
                  <Th className="text-right">Showroom −{KORTING_SHOWROOM}%</Th>
                </tr>
              </THead>
              <TBody>
                {zichtbaar.map((item) => (
                  <>
                    <Tr key={`${item.sku}-kop`} className="bg-background/60">
                      <Td colSpan={4} className="py-2">
                        <span className="font-medium">{item.naam}</span>
                        {item.sku && <span className="ml-2 text-xs text-muted">{item.sku}</span>}
                      </Td>
                    </Tr>
                    {item.maten.map((m, i) => (
                      <Tr key={`${item.sku}-${m.dim}-${i}`}>
                        <Td className="whitespace-nowrap pl-6">
                          {m.dim}
                          {m.inStock && (
                            <Badge tone="neutral" className="ml-2">
                              voorraad
                            </Badge>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-right tabular-nums text-muted">
                          {formatEUR(m.adviesEx)}
                          <span className="ml-2 text-xs opacity-70">{formatEUR(m.adviesIncl)} incl.</span>
                        </Td>
                        <Td className="text-right tabular-nums font-semibold">{formatEUR(m.verkooppunt)}</Td>
                        <Td className="text-right tabular-nums text-muted">{formatEUR(m.showroom)}</Td>
                      </Tr>
                    ))}
                  </>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        </TabPanel>

        <TabPanel id="document">
        {/* ---- Het document ---- */}
        <Card className="mb-5">
          <CardHeader>
            <div>
              <CardTitle>Het document</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Met foto&apos;s, in de huisstijl. Dit stuur je na de beurs mee.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form method="GET" action="/prijslijst/distributeur/pdf" className="flex flex-wrap items-end gap-4" target="_blank">
              <Field label="Serie" htmlFor="d-serie">
                <Select id="d-serie" name="serie" defaultValue={serie} className="min-w-52">
                  <option value="">Volledige collectie</option>
                  {series.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Taal" htmlFor="d-taal">
                <Select id="d-taal" name="taal" defaultValue="es">
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="nl">Nederlands</option>
                  <option value="de">Deutsch</option>
                </Select>
              </Field>
              <Button type="submit">Download</Button>
            </form>

            <details className="group border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                Of mail hem direct naar een klant
              </summary>
              <form action={mailDistributeurPrijslijst} className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
                <Field label="Klant" htmlFor="m-contact" hint="Alleen contacten met e-mailadres">
                  <Combobox name="contactId" options={klantOpties} placeholder="Zoek klant…" />
                </Field>
                <Field label="Taal" htmlFor="m-taal" hint="Leeg = de taal van het contact">
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
                  <Field label="Bericht" htmlFor="m-bericht" hint="Optioneel">
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
            </details>
          </CardContent>
        </Card>
        </TabPanel>
      </TabsRoot>

    </>
  );
}
