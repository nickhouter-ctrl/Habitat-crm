import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
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
import { cn, formatDate, formatEUR } from "@/lib/utils";
import { workerEntries, workerInvoices, workerProjects } from "@/lib/worker-stats";
import { toggleWorkerActive, updateWorker } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = await db.query.workers.findFirst({ where: eq(workers.id, id), columns: { name: true } });
  return { title: w ? `${w.name} · Ploeg` : "Ploeg" };
}

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
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
  const wachtend = regels.filter((r) => r.wacht_op_akkoord);
  const laatst = regels.find((r) => !r.wacht_op_akkoord)?.date ?? null;

  return (
    <>
      <PageHeader
        title={worker.name}
        subtitle={[worker.role, worker.active ? null : "inactief"].filter(Boolean).join(" · ") || undefined}
        actions={
          <Link href="/ploeg" className="text-sm text-accent hover:underline">
            {uiT("← Hele ploeg")} </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={uiT("Uren geboekt")} value={uren.toLocaleString(uiDateLocale)} hint={uiT("goedgekeurd")} />
        <StatTile label={uiT("Arbeidskost")} value={formatEUR(kost)} hint={uiT("ex. btw")} />
        <StatTile label={uiT("Werven")} value={String(perWerf.length)} hint={uiT("waar hij gewerkt heeft")} />
        <StatTile label={uiT("Laatst gewerkt")} value={laatst ? formatDate(laatst, uiDateLocale) : "—"} />
      </div>

      {wachtend.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <span className="font-medium">
              {wachtend.length} {uiT(wachtend.length === 1 ? "urenregel" : "urenregels")} {uiT("uit het urenportaal wacht nog op goedkeuring")} </span>
            <span className="text-muted">
              {" "}
              {uiT("— die tellen nog niet mee in de cijfers hierboven. Goedkeuren doe je op de projectpagina.")} </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Gegevens")}</CardTitle>
              <span className="text-xs text-muted">
{uiT("een tweede tarief is optioneel; bij het boeken van uren kies je welke geldt")} </span>
            </CardHeader>
            <CardContent>
              <form action={updateWorker.bind(null, worker.id)} className="space-y-3">
                <Field label={uiT("Naam")}>
                  <Input name="name" defaultValue={worker.name} required />
                </Field>
                <Field label={uiT("Functie")}>
                  <Input name="role" defaultValue={worker.role ?? ""} placeholder={uiT("bijv. tegelzetter")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={uiT("Uurtarief (€/u)")} hint={uiT("ex. btw")}>
                    <Input
                      name="hourlyCostEur"
                      inputMode="decimal"
                      defaultValue={moneyForInput(worker.hourlyCostEur)}
                    />
                  </Field>
                  <Field label={uiT("Tweede tarief (€/u)")} hint={uiT("optioneel — een afwijkend tarief dat soms geldt")}>
                    <Input
                      name="hourlyCostCashEur"
                      inputMode="decimal"
                      defaultValue={moneyForInput(worker.hourlyCostCashEur)}
                    />
                  </Field>
                </div>
                <Field label={uiT("Taal urenportaal")}>
                  <Select name="portalLang" defaultValue={worker.portalLang ?? "es"}>
                    <option value="es">Español</option>
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <Field label={uiT("Notities")}>
                  <Textarea name="notes" rows={3} defaultValue={worker.notes ?? ""} placeholder={uiT("optioneel")} />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingLabel={uiT("Opslaan…")}>{uiT("Opslaan")}</SubmitButton>
                  <button
                    type="submit"
                    formAction={toggleWorkerActive.bind(null, worker.id, !worker.active)}
                    className="text-xs text-muted underline-offset-2 hover:underline"
                  >
                    {worker.active ? uiT("Op inactief zetten") : uiT("Heractiveren")}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Per werf")}</CardTitle>
              <span className="text-xs text-muted">{uiT("waar zijn uren naartoe gingen")}</span>
            </CardHeader>
            {perWerf.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">{uiT("Nog geen uren geboekt.")}</p>
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
                        <span className="text-muted">{uiT("zonder werf")}</span>
                      )}
                      <span className="ml-1.5 text-xs text-muted">
                        {Number(p.uren).toLocaleString(uiDateLocale)} {uiT("uur")} {p.laatst ? uiT(" · tot {v0}", { v0: formatDate(p.laatst, uiDateLocale) }) : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-medium tabular-nums">
                      {formatEUR(Number(p.kost))}
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
              <CardTitle>{uiT("Urenregels")}</CardTitle>
              <span className="text-xs text-muted">{uiT("nieuwste eerst")}</span>
            </CardHeader>
            {regels.length === 0 ? (
              <CardContent>
                <EmptyState
                  title={uiT("Nog geen uren")}
                  description={uiT("Uren boek je op de projectpagina, of de arbeider vult ze zelf in via het urenportaal.")}
                />
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>{uiT("Datum")}</Th>
                    <Th>{uiT("Werf")}</Th>
                    <Th className="text-right">{uiT("Uren")}</Th>
                    <Th className="text-right">{uiT("Tarief")}</Th>
                    <Th className="text-right">{uiT("Kost")}</Th>
                    <Th></Th>
                  </Tr>
                </THead>
                <TBody>
                  {regels.map((r) => (
                    <Tr key={r.id} className={r.wacht_op_akkoord ? "opacity-60" : ""}>
                      <Td className="whitespace-nowrap">{formatDate(r.date, uiDateLocale)}</Td>
                      <Td>
                        {r.project_id ? (
                          <Link href={`/projects/${r.project_id}`} className="hover:underline">
                            {r.project}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {/* Komt de regel van een inkoopfactuur, dan is de notitie
                            zelf de weg ernaartoe. Een los linkje "factuur" ernaast
                            leverde in de kolom Betaling "Per factuur factuur" op. */}
                        {r.purchase_order_id ? (
                          <Link
                            href={`/inkooporders/${r.purchase_order_id}`}
                            className="block text-xs text-accent hover:underline"
                          >
                            {r.note ?? `via factuur ${r.reference ?? ""}`.trim()}
                          </Link>
                        ) : (
                          r.note && <span className="block text-xs text-muted">{r.note}</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{Number(r.hours).toLocaleString(uiDateLocale)}</Td>
                      <Td className="text-right tabular-nums text-muted">{formatEUR(Number(r.hourly_cost_eur))}</Td>
                      <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.kost))}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        {r.wacht_op_akkoord && <Badge tone="warning">{uiT("wacht op akkoord")}</Badge>}
                        {r.zelf_geboekt && !r.wacht_op_akkoord && (
                          <span className="text-muted">{uiT("via portaal")}</span>
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
              <CardTitle>{uiT("Facturen op zijn naam")}</CardTitle>
              <span className="text-xs text-muted">{uiT("uit de inkoop")}</span>
            </CardHeader>
            {facturen.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">{uiT("Geen facturen in de inkoop op deze naam.")}</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>{uiT("Referentie")}</Th>
                    <Th>{uiT("Datum")}</Th>
                    <Th>{uiT("Werf")}</Th>
                    <Th className="text-right">{uiT("Ex. btw")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {facturen.map((f) => (
                    <Tr key={f.id}>
                      <Td>
                        <Link href={`/inkooporders/${f.id}`} className="text-accent hover:underline">
                          {f.reference ?? uiT("zonder referentie")}
                        </Link>
                        {f.count_as_labor && <span className="block text-xs text-muted">{uiT("geboekt als uren")}</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {f.order_date ? formatDate(f.order_date, uiDateLocale) : "—"}
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
