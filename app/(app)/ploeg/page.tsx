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

export const metadata = { title: "Ploeg" };

export default async function PloegPage() {
  const rows = await workerOverview();
  const actief = rows.filter((w) => w.active);
  const inactief = rows.filter((w) => !w.active);
  const urenTotaal = rows.reduce((s, w) => s + Number(w.uren ?? 0), 0);
  const kostTotaal = rows.reduce((s, w) => s + Number(w.kost ?? 0), 0);
  const dubbel = rows.filter((w) => w.dubbele_naam);

  return (
    <>
      <PageHeader
        title="Ploeg"
        subtitle="De eigen jongens en onderaannemers. Klik op een naam voor zijn uren, werven en facturen."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Actief" value={String(actief.length)} />
        <StatTile label="Uren geboekt" value={urenTotaal.toLocaleString("nl-NL")} hint="goedgekeurd" />
        <StatTile label="Arbeidskost" value={formatEUR(kostTotaal)} hint="ex. btw, alle werven" />
        <StatTile label="Inactief" value={String(inactief.length)} tone="neutral" />
      </div>

      {dubbel.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">
              {dubbel.length} ploegkaarten delen een naam met een andere kaart.
            </p>
            <p className="mt-1 text-muted">
              Dan staan zijn uren verspreid en klopt geen van beide overzichten. Werkt iemand soms
              contant en soms op factuur, gebruik dan één kaart met twee tarieven —{" "}
              <span className="whitespace-nowrap">contant én per factuur</span> staan allebei op zijn
              pagina. Het gaat om: {dubbel.map((w) => w.name).join(", ")}.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Arbeiders</CardTitle>
          <span className="text-xs text-muted">tarieven, uren en kosten ex. btw, over alle werven</span>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState title="Nog geen arbeiders" description="Voeg hieronder de eerste toe." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Naam</Th>
                <Th>Functie</Th>
                <Th className="text-right">Per factuur</Th>
                <Th className="text-right">Contant</Th>
                <Th className="text-right">Uren</Th>
                <Th className="text-right">Arbeidskost</Th>
                <Th className="text-right">Werven</Th>
                <Th className="text-right">Laatst gewerkt</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((w) => (
                <Tr key={w.id} className={w.active ? "" : "opacity-60"}>
                  <Td>
                    <Link href={`/ploeg/${w.id}`} className="font-medium text-accent hover:underline">
                      {w.name}
                    </Link>
                    {!w.active && <Badge tone="neutral" className="ml-2">inactief</Badge>}
                    {w.dubbele_naam && (
                      <Badge tone="warning" className="ml-2">dubbele kaart</Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{w.role ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {Number(w.hourly_cost_eur ?? 0) > 0 ? `${formatEUR(w.hourly_cost_eur)}/u` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {Number(w.hourly_cost_cash_eur ?? 0) > 0
                      ? `${formatEUR(w.hourly_cost_cash_eur)}/u`
                      : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{Number(w.uren ?? 0).toLocaleString("nl-NL")}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(w.kost ?? 0))}</Td>
                  <Td className="text-right tabular-nums">{w.werven}</Td>
                  <Td className="text-right text-muted">{w.laatst ? formatDate(w.laatst) : "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arbeider toevoegen</CardTitle>
          <span className="text-xs text-muted">
            twee tarieven, want contant werken gaat vaak tegen een ander tarief dan op factuur
          </span>
        </CardHeader>
        <CardContent>
          <form action={createWorker} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <Field label="Naam" htmlFor="w-name">
              <Input id="w-name" name="name" required placeholder="Voornaam Achternaam" />
            </Field>
            <Field label="Functie" htmlFor="w-role">
              <Input id="w-role" name="role" placeholder="bijv. tegelzetter" />
            </Field>
            <Field label="Tarief per factuur (€/u)" htmlFor="w-rate" hint="ex. btw">
              <Input id="w-rate" name="hourlyCostEur" inputMode="decimal" placeholder="25,00" />
            </Field>
            <Field label="Tarief contant (€/u)" htmlFor="w-rate-cash" hint="ex. btw · leeg = zelfde als per factuur">
              <Input id="w-rate-cash" name="hourlyCostCashEur" inputMode="decimal" placeholder="20,00" />
            </Field>
            <Field label="Standaard betaalwijze" htmlFor="w-pay">
              <Select id="w-pay" name="defaultPaymentMethod" defaultValue="invoice">
                <option value="cash">Contant</option>
                <option value="invoice">Per factuur</option>
              </Select>
            </Field>
            <Field label="Taal urenportaal" htmlFor="w-lang">
              <Select id="w-lang" name="portalLang" defaultValue="es">
                <option value="es">Español</option>
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel="Bezig…">Toevoegen</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
