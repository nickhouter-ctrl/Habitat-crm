/**
 * Offerte-calculator: maten van de woning in, complete offerte uit.
 *
 * Stap 1 is een GET-formulier (geen verborgen toestand): m² en aantallen per
 * maat. De server rekent daaruit per prijzenboek-post het aantal (maat × factor)
 * en toont het voorbeeld — elk aantal nog aanpasbaar, handmatige posten op 0.
 * Pas de POST-knop maakt het concept; wat je op het scherm zag is wat er op de
 * offerte komt, en dat concept blijft in de offerte-editor volledig bewerkbaar.
 */
import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
} from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { contacts, priceBookItems, projects } from "@/lib/db/schema";
import { moneyForInput, parseMoney } from "@/lib/parse-money";
import { marginOf } from "@/lib/pricing";
import { DRIVERS, DRIVER_GROEP_LABEL, DRIVER_HANDMATIG, HOOFDSTUKKEN, type DriverGroep } from "@/lib/price-book";
import { formatEUR } from "@/lib/utils";
import { createQuoteFromPriceBook } from "../actions";

export const metadata = { title: "Offerte calculeren" };

export default async function OfferteCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const bereken = params.bereken === "1";

  const [posten, contactRows, projectRows] = await Promise.all([
    db.select().from(priceBookItems).where(eq(priceBookItems.active, true)).orderBy(asc(priceBookItems.sortOrder)),
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
  ]);

  // Maat → waarde uit de URL; aantal per post = maat × factor.
  const maat = (key: string) => parseMoney(params[`d_${key}`] ?? "") ?? 0;
  const aantalVoor = (p: (typeof posten)[number]) =>
    p.driver === DRIVER_HANDMATIG ? 0 : Math.round(maat(p.driver) * Number(p.factor) * 100) / 100;

  // Totalen van het voorbeeld (alleen de voorgerekende aantallen — wat de
  // gebruiker daarna nog aanpast telt de server bij het aanmaken opnieuw).
  let verkoop = 0;
  let kost = 0;
  for (const p of posten) {
    const q = aantalVoor(p);
    if (q > 0 && p.priceEur != null) {
      verkoop += q * Number(p.priceEur);
      kost += q * Number(p.costEur ?? 0);
    }
  }
  const margePct = verkoop > 0 ? (marginOf(verkoop, kost)?.pct ?? null) : null;
  const onvoorzien = parseMoney(params.onvoorzien ?? "") ?? 10;

  const groepen = [...new Set(DRIVERS.map((d) => d.groep))] as DriverGroep[];

  return (
    <>
      <PageHeader
        title="Offerte calculeren"
        subtitle="maten van de woning in → complete offerte met marges, stelposten en voorbehouden uit"
        actions={
          <LinkButton href="/prijzenboek" variant="ghost">
            ← Prijzenboek
          </LinkButton>
        }
      />

      {params.fout === "leeg" && (
        <p className="mb-4 rounded-md bg-warning/10 p-3 text-sm">Geen regels met een aantal — vul minstens één maat of aantal in.</p>
      )}

      {/* Stap 1 · de maten */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>1 · Maten van de woning</CardTitle>
          <span className="text-xs text-muted">alleen invullen wat van toepassing is — leeg = doet niet mee</span>
        </CardHeader>
        <CardContent>
          <form method="get" className="space-y-4">
            <input type="hidden" name="bereken" value="1" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Klant">
                <Combobox name="contactId" defaultValue={params.contactId ?? ""} clearable placeholder="zoek klant…" options={contactRows.map((c) => ({ value: c.id, label: c.name }))} />
              </Field>
              <Field label="Project" hint="optioneel">
                <Combobox name="projectId" defaultValue={params.projectId ?? ""} clearable placeholder="zoek project…" options={projectRows.map((p) => ({ value: p.id, label: p.name }))} />
              </Field>
              <Field label="Taal offerte-voorwaarden">
                <Select name="taal" defaultValue={params.taal ?? "nl"}>
                  <option value="nl">Nederlands</option>
                  <option value="en">Engels</option>
                  <option value="es">Spaans</option>
                </Select>
              </Field>
              <Field label="Onvoorzien (%)" hint="zichtbare regel op de offerte">
                <Input name="onvoorzien" inputMode="decimal" defaultValue={params.onvoorzien ?? "10"} className="text-right" />
              </Field>
            </div>

            {groepen.map((groep) => (
              <div key={groep}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{DRIVER_GROEP_LABEL[groep]}</p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {DRIVERS.filter((d) => d.groep === groep).map((d) => (
                    <Field key={d.key} label={d.label} hint={d.eenheid}>
                      <Input name={`d_${d.key}`} inputMode="decimal" defaultValue={params[`d_${d.key}`] ?? ""} className="text-right" placeholder="—" />
                    </Field>
                  ))}
                </div>
              </div>
            ))}

            <SubmitButton variant="primary" pendingLabel="Rekenen…">
              Bereken voorbeeld
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Stap 2 · het voorbeeld */}
      {bereken && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Voorbeeld — controleer en pas aan</CardTitle>
            <span className="text-xs text-muted">
              elk aantal is aanpasbaar · 0 = regel vervalt · handmatige posten (septictank, groepenkast, …) vul je hier in
            </span>
          </CardHeader>
          <CardContent>
            <form action={createQuoteFromPriceBook} className="space-y-4">
              <input type="hidden" name="contactId" value={params.contactId ?? ""} />
              <input type="hidden" name="projectId" value={params.projectId ?? ""} />
              <input type="hidden" name="taal" value={params.taal ?? "nl"} />
              <input type="hidden" name="onvoorzien" value={String(onvoorzien)} />

              {HOOFDSTUKKEN.map((hoofdstuk) => {
                const rijen = posten.filter((p) => p.chapter === hoofdstuk);
                if (rijen.length === 0) return null;
                return (
                  <div key={hoofdstuk} className="rounded-md border">
                    <p className="border-b bg-background/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">{hoofdstuk}</p>
                    <div className="divide-y">
                      {rijen.map((p) => {
                        const q = aantalVoor(p);
                        return (
                          <div key={p.id} className="grid items-center gap-2 px-3 py-1.5 text-sm lg:grid-cols-[2fr_0.8fr_0.9fr_0.9fr]">
                            <div>
                              <span className="font-medium">{p.name}</span>
                              {p.isStelpost && <Badge tone="info" className="ml-1.5">stelpost</Badge>}
                              {p.priceEur == null && <Badge tone="warning" className="ml-1.5">geen prijs</Badge>}
                              {p.stelpostNote ? <span className="block text-xs text-muted">{p.stelpostNote}</span> : null}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Input name={`q_${p.id}`} inputMode="decimal" defaultValue={q > 0 ? moneyForInput(q) : ""} placeholder="0" className="w-24 text-right" disabled={p.priceEur == null} />
                              <span className="text-xs text-muted">{p.unit}</span>
                            </div>
                            <span className="text-right tabular-nums text-muted">{p.priceEur != null ? `${formatEUR(Number(p.priceEur))} /${p.unit}` : "—"}</span>
                            <span className="text-right tabular-nums font-medium">{q > 0 && p.priceEur != null ? formatEUR(q * Number(p.priceEur)) : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="text-muted">Voorgerekend: verkoop <strong className="tabular-nums text-foreground">{formatEUR(verkoop)}</strong></span>
                  <span className="text-muted">+ onvoorzien {onvoorzien}% → <strong className="tabular-nums text-foreground">{formatEUR(verkoop * (1 + onvoorzien / 100))}</strong></span>
                  <span className="text-muted">kostprijs <strong className="tabular-nums text-foreground">{formatEUR(kost)}</strong></span>
                  <span className={`font-semibold tabular-nums ${margePct != null && margePct < 15 ? "text-danger" : "text-success"}`}>
                    marge {margePct != null ? `${margePct.toFixed(1).replace(".", ",")}%` : "—"}
                  </span>
                </div>
                {margePct != null && margePct < 15 && (
                  <p className="mt-1 text-xs text-danger">Onder de 15%-norm — controleer de prijzen in het prijzenboek voordat je dit verstuurt.</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Aantallen die je hierboven aanpast worden bij het aanmaken opnieuw doorgerekend. De offerte wordt een
                  CONCEPT met de voorbehouden ({(params.taal ?? "nl").toUpperCase()}) eronder — versturen doe je vanuit de offerte zelf.
                </p>
              </div>

              <SubmitButton variant="primary" pendingLabel="Aanmaken…">
                Offerte aanmaken (concept)
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {!bereken && (
        <p className="text-sm text-muted">
          Vul de maten in en klik <strong>Bereken voorbeeld</strong>. Prijzen aanpassen doe je in het{" "}
          <Link href="/prijzenboek" className="text-accent hover:underline">prijzenboek</Link>.
        </p>
      )}
    </>
  );
}
