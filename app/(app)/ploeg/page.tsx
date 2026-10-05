import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
/**
 * De ploeg: één regel per arbeider, met wat hij tot nu toe heeft gedaan.
 *
 * Stond hier eerder als een lijst van openstaande bewerkformulieren — zes velden
 * per persoon, allemaal tegelijk op het scherm — waardoor je nergens zag wie
 * hoeveel uren maakte of op welke werf hij zat. Bewerken gebeurt nu op zijn
 * eigen pagina; deze lijst is om te kíjken en door te klikken.
 */
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
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
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatEUR } from "@/lib/utils";
import { workerOverview } from "@/lib/worker-stats";
import { createWorker } from "./actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Ploeg") };
}

export default async function PloegPage() {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const rows = await workerOverview();
  const actief = rows.filter((w) => w.active);
  const inactief = rows.filter((w) => !w.active);
  const urenTotaal = rows.reduce((s, w) => s + Number(w.uren ?? 0), 0);
  const kostTotaal = rows.reduce((s, w) => s + Number(w.kost ?? 0), 0);
  const dubbel = rows.filter((w) => w.dubbele_naam);

  return (
    <>
<TabsRoot defaultTab="workers" ids={["workers","add"]} param="section">
      <PageHeader
        title={uiT("Ploeg")}
        subtitle={uiT("De eigen jongens en onderaannemers. Klik op een naam voor zijn uren, werven en facturen.")}
      />
<TabsBar tabs={[{id:"workers",label:uiT("Arbeiders")},{id:"add",label:uiT("Arbeider toevoegen")}]}/>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={uiT("Actief")} value={String(actief.length)} />
        <StatTile label={uiT("Uren geboekt")} value={urenTotaal.toLocaleString(uiDateLocale)} hint={uiT("goedgekeurd")} />
        <StatTile label={uiT("Arbeidskost")} value={formatEUR(kostTotaal)} hint={uiT("ex. btw, alle werven")} />
        <StatTile label={uiT("Inactief")} value={String(inactief.length)} tone="neutral" />
      </div>

      {dubbel.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">
              {dubbel.length} {uiT("ploegkaarten delen een naam met een andere kaart.")} </p>
            <p className="mt-1 text-muted">
              {uiT("Dan staan zijn uren verspreid en klopt geen van beide overzichten. Werkt iemand tegen twee verschillende tarieven, gebruik dan één kaart met beide tarieven erop. Het gaat om:")}{" "}
              {dubbel.map((w) => w.name).join(", ")}.
            </p>
          </CardContent>
        </Card>
      )}

      <TabPanel id="workers"><Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{uiT("Arbeiders")}</CardTitle>
          <span className="text-xs text-muted">{uiT("alle bedragen zonder btw, over alle werven")}</span>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title={uiT("Nog geen arbeiders")} description={uiT("Voeg hieronder de eerste toe.")} />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{uiT("Naam")}</Th>
                <Th>{uiT("Functie")}</Th>
                <Th className="text-right">{uiT("Uurtarief")}</Th>
                <Th className="text-right">{uiT("Tweede tarief")}</Th>
                <Th className="text-right">{uiT("Uren")}</Th>
                <Th className="text-right">{uiT("Arbeidskost")}</Th>
                <Th className="text-right">{uiT("Werven")}</Th>
                <Th className="text-right">{uiT("Laatst gewerkt")}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((w) => (
                <Tr key={w.id} className={w.active ? "" : "opacity-60"}>
                  <Td>
                    <Link href={`/ploeg/${w.id}`} className="font-medium text-accent hover:underline">
                      {w.name}
                    </Link>
                    {!w.active && <Badge tone="neutral" className="ml-2">{uiT("inactief")}</Badge>}
                    {w.dubbele_naam && (
                      <Badge tone="warning" className="ml-2">{uiT("dubbele kaart")}</Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{w.role ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {Number(w.hourly_cost_eur ?? 0) > 0 ? uiT("{v0}/u", { v0: formatEUR(w.hourly_cost_eur) }) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {Number(w.hourly_cost_cash_eur ?? 0) > 0
                      ? uiT("{v0}/u", { v0: formatEUR(w.hourly_cost_cash_eur) })
                      : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{Number(w.uren ?? 0).toLocaleString(uiDateLocale)}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(w.kost ?? 0))}</Td>
                  <Td className="text-right tabular-nums">{w.werven}</Td>
                  <Td className="text-right text-muted">{w.laatst ? formatDate(w.laatst, uiDateLocale) : "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card></TabPanel>

      <TabPanel id="add"><Card>
        <CardHeader>
          <CardTitle>{uiT("Arbeider toevoegen")}</CardTitle>
          <span className="text-xs text-muted">
{uiT("een tweede tarief is optioneel — je kiest bij het boeken van uren welke geldt")} </span>
        </CardHeader>
        <CardContent>
          <form action={createWorker} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <Field label={uiT("Naam")} htmlFor="w-name">
              <Input id="w-name" name="name" required placeholder={uiT("Voornaam Achternaam")} />
            </Field>
            <Field label={uiT("Functie")} htmlFor="w-role">
              <Input id="w-role" name="role" placeholder={uiT("bijv. tegelzetter")} />
            </Field>
            <Field label={uiT("Uurtarief (€/u)")} htmlFor="w-rate" hint={uiT("ex. btw")}>
              <Input id="w-rate" name="hourlyCostEur" inputMode="decimal" placeholder="25,00" />
            </Field>
            <Field label={uiT("Tweede tarief (€/u)")} htmlFor="w-rate-cash" hint={uiT("optioneel — geldt soms")}>
              <Input id="w-rate-cash" name="hourlyCostCashEur" inputMode="decimal" placeholder="20,00" />
            </Field>
            <Field label={uiT("Taal urenportaal")} htmlFor="w-lang">
              <Select id="w-lang" name="portalLang" defaultValue="es">
                <option value="es">Español</option>
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel={uiT("Bezig…")}>{uiT("Toevoegen")}</SubmitButton>
          </form>
        </CardContent>
      </Card></TabPanel>

</TabsRoot>
</>
  );
}
