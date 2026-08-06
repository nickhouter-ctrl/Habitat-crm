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
import { BadkamerBlokken } from "@/components/badkamer-blokken";
import { BetalingsschemaBlok, MAX_TERMIJNEN } from "@/components/betalingsschema-blok";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { contacts, priceBookItems, projects } from "@/lib/db/schema";
import { moneyForInput, parseMoney } from "@/lib/parse-money";
import { marginOf } from "@/lib/pricing";
import { badkamerSamenstelling, DRIVERS, DRIVER_GROEP_LABEL, DRIVER_HANDMATIG, HOOFDSTUKKEN, type DriverGroep } from "@/lib/price-book";
import { SCHEMA_FASEN } from "@/lib/quote-clauses";
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

  // Badkamers per stuk (badkamer 1 = 5 m², 1 douche, …): de gedeelde helper
  // rekent de driver-totalen — exact dezelfde code als de aanmaak-actie.
  const { totalen: sanitairTotalen } = badkamerSamenstelling((veld) => params[veld] ?? "");

  // Afgeleide maten: containers/stort volgen het totale sloopwerk
  // (gesloopte wanden + vloeren + badkamervloeren).
  const afgeleiden: Record<string, number> = {
    ...sanitairTotalen,
    sloop_totaal_m2:
      (parseMoney(params.d_sloop_wanden_m2 ?? "") ?? 0) +
      (parseMoney(params.d_woonoppervlak_m2 ?? "") ?? 0) +
      sanitairTotalen.badkamer_m2,
  };

  // Maat → waarde uit de URL; aantal per post = maat × factor.
  const maat = (key: string) => afgeleiden[key] ?? parseMoney(params[`d_${key}`] ?? "") ?? 0;
  const aantalVoor = (p: (typeof posten)[number]) =>
    p.driver === DRIVER_HANDMATIG ? 0 : Math.round(maat(p.driver) * Number(p.factor) * 100) / 100;

  // Handmatige aanpassingen uit stap 2 ("Voorbeeld bijwerken") winnen van de
  // voorgerekende aantallen — zo kun je schaven en herrekenen zonder dat de
  // offerte al wordt aangemaakt.
  const qOverride = (p: (typeof posten)[number]) => parseMoney(params[`q_${p.id}`] ?? "");
  const qVan = (p: (typeof posten)[number]) => qOverride(p) ?? aantalVoor(p);

  // Totalen van het voorbeeld, inclusief handmatige aanpassingen.
  let verkoop = 0;
  let kost = 0;
  for (const p of posten) {
    const q = qVan(p);
    if (q > 0 && p.priceEur != null) {
      verkoop += q * Number(p.priceEur);
      kost += q * Number(p.costEur ?? 0);
    }
  }
  const margePct = verkoop > 0 ? (marginOf(verkoop, kost)?.pct ?? null) : null;
  const onvoorzien = parseMoney(params.onvoorzien ?? "") ?? 10;

  // Betalingsschema: aantal termijnen + omschrijving en % per termijn uit de
  // URL; standaard de bouwfase-termijnen in de gekozen offertetaal.
  const taal = (["nl", "en", "es"].includes(params.taal ?? "") ? params.taal : "nl") as "nl" | "en" | "es";
  const schemaStandaard = SCHEMA_FASEN.map((f) => ({ label: f[taal], pct: f.standaard }));
  const schemaAantal = Math.min(
    Math.max(Number.parseInt(params.s_aantal ?? "", 10) || schemaStandaard.length, 0),
    MAX_TERMIJNEN,
  );
  const termijnen = Array.from({ length: schemaAantal }, (_, idx) => ({
    label: (params[`s${idx + 1}_label`] ?? schemaStandaard[idx]?.label ?? "").trim(),
    pct: parseMoney(params[`s${idx + 1}_pct`] ?? "") ?? schemaStandaard[idx]?.pct ?? 0,
  }));
  const schemaSom = termijnen.reduce((s, t) => s + (t.label ? t.pct : 0), 0);
  const verkoopMetOnvoorzien = verkoop * (1 + onvoorzien / 100);

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

      {/* Eén formulier over beide stappen: elke knop (berekenen, bijwerken,
          aanmaken) verstuurt zo altijd de complete invoer. */}
      <form method="get">
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>1 · Maten van de woning</CardTitle>
          <span className="text-xs text-muted">alleen invullen wat van toepassing is — leeg = doet niet mee</span>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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

            <BetalingsschemaBlok defaults={params} standaard={schemaStandaard} />

            {groepen.map((groep) =>
              groep === "sanitair" ? (
                <BadkamerBlokken key={groep} defaults={params} />
              ) : (
                <div key={groep}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{DRIVER_GROEP_LABEL[groep]}</p>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {DRIVERS.filter((d) => d.groep === groep && !d.afgeleid).map((d) => (
                      <Field key={d.key} label={d.label} hint={d.eenheid}>
                        <Input name={`d_${d.key}`} inputMode="decimal" defaultValue={params[`d_${d.key}`] ?? ""} className="text-right" placeholder="—" />
                      </Field>
                    ))}
                  </div>
                </div>
              )
            )}

            <SubmitButton variant="primary" pendingLabel="Rekenen…">
              Bereken voorbeeld
            </SubmitButton>
          </div>
        </CardContent>
      </Card>

      {/* Stap 2 · het voorbeeld — zelfde formulier als stap 1, dus élke knop
          verstuurt altijd álle invoer (maten, badkamers, schema én aantallen).
          Vroeger waren dit twee losse formulieren: wie onderin klikte verloor
          de badkamer-invoer van boven en alles viel op 0. */}
      {bereken && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Voorbeeld — controleer en pas aan</CardTitle>
            <span className="text-xs text-muted">
              aantallen voorgerekend uit stap 1 (badkamers vullen ook de montage én de eigen producten) · 0 = regel vervalt
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Controle-regel: wat er uit de badkamer-blokken is meegerekend.
                  Staat hier bewust zichtbaar — als dit 0 toont terwijl boven wél
                  badkamers zijn ingevuld, is de invoer niet meegekomen. */}
              <p className="rounded-md bg-background/60 px-3 py-2 text-xs text-muted">
                Meegerekend uit de badkamers: <strong className="text-foreground">{sanitairTotalen.badkamers}</strong> badkamer{sanitairTotalen.badkamers === 1 ? "" : "s"} ·{" "}
                <strong className="text-foreground">{moneyForInput(sanitairTotalen.badkamer_m2) || 0} m²</strong> vloer ·{" "}
                <strong className="text-foreground">{sanitairTotalen.douches}</strong> douches · <strong className="text-foreground">{sanitairTotalen.baden}</strong> baden ·{" "}
                <strong className="text-foreground">{sanitairTotalen.wastafels}</strong> wastafels · <strong className="text-foreground">{sanitairTotalen.toiletten}</strong> toiletten
              </p>

              {HOOFDSTUKKEN.map((hoofdstuk) => {
                const rijen = posten.filter((p) => p.chapter === hoofdstuk);
                if (rijen.length === 0) return null;
                return (
                  <div key={hoofdstuk} className="rounded-md border">
                    <p className="border-b bg-background/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">{hoofdstuk}</p>
                    <div className="divide-y">
                      {rijen.map((p) => {
                        const q = qVan(p);
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
                {verkoop > 0 && schemaSom > 0 && (
                  <div className="mt-2 border-t pt-2 text-xs">
                    <p className="mb-1 font-medium uppercase tracking-wide text-muted">Betalingsschema (over {formatEUR(verkoopMetOnvoorzien)} ex btw)</p>
                    {termijnen.map((t, i) =>
                      t.pct > 0 && t.label ? (
                        <p key={i} className="text-muted">
                          {t.pct}% {t.label} — <span className="tabular-nums text-foreground">{formatEUR(Math.round((verkoopMetOnvoorzien * t.pct) / 100))}</span>
                        </p>
                      ) : null,
                    )}
                    {Math.round(schemaSom) !== 100 && (
                      <p className="mt-1 text-danger">De termijnen tellen op tot {schemaSom}% — pas de percentages in stap 1 aan naar 100%.</p>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted">
                  Aantallen die je hierboven aanpast worden bij het aanmaken opnieuw doorgerekend. De offerte wordt een
                  CONCEPT met de voorbehouden ({(params.taal ?? "nl").toUpperCase()}) eronder — versturen doe je vanuit de offerte zelf.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton variant="secondary" pendingLabel="Herrekenen…">
                  Voorbeeld bijwerken
                </SubmitButton>
                <SubmitButton formAction={createQuoteFromPriceBook} variant="primary" pendingLabel="Aanmaken…">
                  Offerte aanmaken (concept)
                </SubmitButton>
                <span className="text-xs text-muted">bijwerken herrekent alleen — er wordt pas iets aangemaakt met de rechterknop</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </form>

      {!bereken && (
        <p className="text-sm text-muted">
          Vul de maten in en klik <strong>Bereken voorbeeld</strong>. Prijzen aanpassen doe je in het{" "}
          <Link href="/prijzenboek" className="text-accent hover:underline">prijzenboek</Link>.
        </p>
      )}
    </>
  );
}
