/**
 * Alles van één arbeider op één pagina: zijn gegevens, waar hij gewerkt heeft,
 * wat dat kostte en welke facturen er op zijn naam staan.
 *
 * Bestond niet — de ploeglijst linkte naar de leverancierspagina, en die zoekt
 * op een aaneengeplakte naamsleutel. Wie op zijn factuur een naam méér draagt
 * dan op zijn ploegkaart ("Wilhelmus Mark Strijks" tegenover "Wilhelmus
 * Strijks") kwam daar op een leeg scherm uit. Hier wordt woord voor woord
 * vergeleken, en tellen ook de urenregels mee die alleen een naam dragen en
 * geen `worker_id` — dat is de helft van alle regels.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

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
  Textarea,
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { workers } from "@/lib/db/schema";
import { moneyForInput } from "@/lib/parse-money";
import { formatDate, formatEUR } from "@/lib/utils";
import { workerEntries, workerInvoices, workerProjects } from "@/lib/worker-stats";
import { toggleWorkerActive, updateWorker } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = await db.query.workers.findFirst({ where: eq(workers.id, id), columns: { name: true } });
  return { title: w ? `${w.name} · Ploeg` : "Ploeg" };
}

const BETAALWIJZE = { cash: "Contant", invoice: "Per factuur" } as const;

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const worker = await db.query.workers.findFirst({ where: eq(workers.id, id) });
  if (!worker) notFound();

  const [perWerf, regels, facturen] = await Promise.all([
    workerProjects(id),
    workerEntries(id),
    workerInvoices(id),
  ]);

  const uren = perWerf.reduce((s, p) => s + Number(p.uren ?? 0), 0);
  const kost = perWerf.reduce((s, p) => s + Number(p.kost ?? 0), 0);
  const contant = perWerf.reduce((s, p) => s + Number(p.contant ?? 0), 0);
  const gefactureerd = perWerf.reduce((s, p) => s + Number(p.gefactureerd ?? 0), 0);
  const wachtend = regels.filter((r) => r.wacht_op_akkoord);

  return (
    <>
      <PageHeader
        title={worker.name}
        subtitle={[worker.role, worker.active ? null : "inactief"].filter(Boolean).join(" · ") || undefined}
        actions={
          <Link href="/ploeg" className="text-sm text-accent hover:underline">
            ← Hele ploeg
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Uren geboekt" value={uren.toLocaleString("nl-NL")} hint="goedgekeurd" />
        <StatTile label="Arbeidskost" value={formatEUR(kost)} hint="ex. btw" />
        <StatTile label="Contant" value={formatEUR(contant)} hint="uitbetaald in de hand" />
        <StatTile label="Per factuur" value={formatEUR(gefactureerd)} hint="via zijn facturen" />
      </div>

      {wachtend.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <span className="font-medium">
              {wachtend.length} urenregel{wachtend.length === 1 ? "" : "s"} uit het urenportaal wacht
              nog op goedkeuring
            </span>
            <span className="text-muted">
              {" "}
              — die tellen nog niet mee in de cijfers hierboven. Goedkeuren doe je op de projectpagina.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
              <span className="text-xs text-muted">
                twee tarieven: contant werken gaat vaak tegen een ander tarief
              </span>
            </CardHeader>
            <CardContent>
              <form action={updateWorker.bind(null, worker.id)} className="space-y-3">
                <Field label="Naam">
                  <Input name="name" defaultValue={worker.name} required />
                </Field>
                <Field label="Functie">
                  <Input name="role" defaultValue={worker.role ?? ""} placeholder="bijv. tegelzetter" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tarief per factuur (€/u)">
                    <Input
                      name="hourlyCostEur"
                      inputMode="decimal"
                      defaultValue={moneyForInput(worker.hourlyCostEur)}
                    />
                  </Field>
                  <Field label="Tarief contant (€/u)" hint="leeg = zelfde als per factuur">
                    <Input
                      name="hourlyCostCashEur"
                      inputMode="decimal"
                      defaultValue={moneyForInput(worker.hourlyCostCashEur)}
                    />
                  </Field>
                </div>
                <Field label="Standaard betaalwijze" hint="voorinvulling bij het boeken van uren">
                  <Select name="defaultPaymentMethod" defaultValue={worker.defaultPaymentMethod}>
                    <option value="cash">Contant</option>
                    <option value="invoice">Per factuur</option>
                  </Select>
                </Field>
                <Field label="Taal urenportaal">
                  <Select name="portalLang" defaultValue={worker.portalLang ?? "es"}>
                    <option value="es">Español</option>
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <Field label="Notities">
                  <Textarea name="notes" rows={3} defaultValue={worker.notes ?? ""} placeholder="optioneel" />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingLabel="Opslaan…">Opslaan</SubmitButton>
                  <button
                    type="submit"
                    formAction={toggleWorkerActive.bind(null, worker.id, !worker.active)}
                    className="text-xs text-muted underline-offset-2 hover:underline"
                  >
                    {worker.active ? "Op inactief zetten" : "Heractiveren"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per werf</CardTitle>
              <span className="text-xs text-muted">waar zijn uren naartoe gingen</span>
            </CardHeader>
            {perWerf.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Nog geen uren geboekt.</p>
              </CardContent>
            ) : (
              <div className="divide-y">
                {perWerf.map((p) => (
                  <div key={p.project_id ?? "geen"} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      {p.project_id ? (
                        <Link href={`/projects/${p.project_id}`} className="font-medium hover:underline">
                          {p.project}
                        </Link>
                      ) : (
                        <span className="text-muted">zonder werf</span>
                      )}
                      <span className="ml-1.5 text-xs text-muted">
                        {Number(p.uren).toLocaleString("nl-NL")} uur
                        {p.laatst ? ` · tot ${formatDate(p.laatst)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium tabular-nums">{formatEUR(Number(p.kost))}</span>
                      <span className="block text-xs text-muted tabular-nums">
                        {formatEUR(Number(p.contant))} contant · {formatEUR(Number(p.gefactureerd))} factuur
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Urenregels</CardTitle>
              <span className="text-xs text-muted">nieuwste eerst</span>
            </CardHeader>
            {regels.length === 0 ? (
              <CardContent>
                <EmptyState
                  title="Nog geen uren"
                  description="Uren boek je op de projectpagina, of de arbeider vult ze zelf in via het urenportaal."
                />
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Datum</Th>
                    <Th>Werf</Th>
                    <Th className="text-right">Uren</Th>
                    <Th className="text-right">Tarief</Th>
                    <Th className="text-right">Kost</Th>
                    <Th>Betaling</Th>
                  </Tr>
                </THead>
                <TBody>
                  {regels.map((r) => (
                    <Tr key={r.id} className={r.wacht_op_akkoord ? "opacity-60" : ""}>
                      <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                      <Td>
                        {r.project_id ? (
                          <Link href={`/projects/${r.project_id}`} className="hover:underline">
                            {r.project}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                      </Td>
                      <Td className="text-right tabular-nums">{Number(r.hours).toLocaleString("nl-NL")}</Td>
                      <Td className="text-right tabular-nums text-muted">{formatEUR(Number(r.hourly_cost_eur))}</Td>
                      <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.kost))}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        {BETAALWIJZE[r.payment_method]}
                        {r.purchase_order_id && (
                          <Link
                            href={`/inkooporders/${r.purchase_order_id}`}
                            className="ml-1 text-accent hover:underline"
                          >
                            factuur
                          </Link>
                        )}
                        {r.wacht_op_akkoord && (
                          <Badge tone="warning" className="ml-1">wacht</Badge>
                        )}
                        {r.zelf_geboekt && !r.wacht_op_akkoord && (
                          <span className="ml-1 text-muted">· portaal</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Facturen op zijn naam</CardTitle>
              <span className="text-xs text-muted">uit de inkoop</span>
            </CardHeader>
            {facturen.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen facturen in de inkoop op deze naam.</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Referentie</Th>
                    <Th>Datum</Th>
                    <Th>Werf</Th>
                    <Th className="text-right">Ex. btw</Th>
                  </Tr>
                </THead>
                <TBody>
                  {facturen.map((f) => (
                    <Tr key={f.id}>
                      <Td>
                        <Link href={`/inkooporders/${f.id}`} className="text-accent hover:underline">
                          {f.reference ?? "zonder referentie"}
                        </Link>
                        {f.count_as_labor && <span className="block text-xs text-muted">geboekt als uren</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {f.order_date ? formatDate(f.order_date) : "—"}
                      </Td>
                      <Td className="text-muted">{f.project ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{formatEUR(Number(f.ex_btw))}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
