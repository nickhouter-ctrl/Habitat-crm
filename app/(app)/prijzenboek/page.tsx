/**
 * Prijzenboek — de eenheidsprijzen waar de offerte-calculator mee rekent.
 *
 * Elke post: kost per eenheid, marge (% van de verkoopprijs) en de verkoopprijs
 * die daaruit volgt (afgerond, handmatig overschrijfbaar). De "controleer"-badge
 * staat op alles wat uit de seed komt: dat zijn indicaties, geen waarheid —
 * één keer bewust opslaan haalt de badge weg.
 */
import { asc } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatTile,
} from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PriceBookRowFields } from "@/components/price-book-row-fields";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { priceBookItems } from "@/lib/db/schema";
import { nacalculatieRijen } from "@/lib/nacalculatie";
import { moneyForInput } from "@/lib/parse-money";
import { DRIVERS, DRIVER_HANDMATIG, DRIVER_LABEL, EENHEDEN, HOOFDSTUKKEN, UURTARIEF_ONDERAANNEMER } from "@/lib/price-book";
import { formatEUR } from "@/lib/utils";
import { addPriceBookItem, deletePriceBookItem, savePriceBookItem, togglePriceBookActive, verversSanitairUitCatalogus } from "./actions";

export const metadata = { title: "Prijzenboek" };

export default async function PrijzenboekPage() {
  const [posten, nacalc] = await Promise.all([
    db.select().from(priceBookItems).orderBy(asc(priceBookItems.sortOrder), asc(priceBookItems.name)),
    nacalculatieRijen(),
  ]);
  const teControleren = posten.filter((p) => p.needsReview).length;
  const zonderPrijs = posten.filter((p) => p.active && p.priceEur == null).length;

  return (
    <>
      <PageHeader
        title="Prijzenboek"
        subtitle="eenheidsprijzen voor de offerte-calculator · alle bedragen excl. btw · marge zit in de prijs, dus nooit meer te laag offreren"
        actions={
          <div className="flex items-center gap-2">
            <form action={verversSanitairUitCatalogus}>
              <SubmitButton variant="ghost" pendingLabel="Verversen…" title="Zet de eigen-collectie badkamerposten op de actuele catalogusgemiddelden">
                Sanitair ← catalogus
              </SubmitButton>
            </form>
            <LinkButton href="/calculator" variant="primary">
              Offerte calculeren
            </LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Posten" value={posten.length} />
        <StatTile label="Nog controleren" value={teControleren} hint="startprijzen uit de seed" tone={teControleren ? "warning" : "neutral"} />
        <StatTile label="Zonder prijs" value={zonderPrijs} hint="doen niet mee in de calculator" tone={zonderPrijs ? "warning" : "neutral"} />
        <StatTile label="Stelposten" value={posten.filter((p) => p.isStelpost).length} hint="duurdere keuze = meerprijs" />
      </div>

      {teControleren > 0 && (
        <p className="mb-5 rounded-md bg-warning/10 p-3 text-sm">
          De prijzen met <Badge tone="warning">controleer</Badge> zijn indicatieve startwaarden — geen echte calculatie.
          Loop ze na en sla op; daarna verdwijnt de markering.
        </p>
      )}

      {HOOFDSTUKKEN.map((hoofdstuk) => {
        const rijen = posten.filter((p) => p.chapter === hoofdstuk);
        return (
          <Card key={hoofdstuk} className="mb-4">
            <CardHeader>
              <CardTitle>{hoofdstuk}</CardTitle>
              <span className="text-xs text-muted">
                {rijen.length} {rijen.length === 1 ? "post" : "posten"}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Kolomkoppen — dezelfde grid als de rijen eronder. */}
              <div className="hidden gap-2 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted lg:grid lg:grid-cols-[1.5fr_0.55fr_0.9fr_0.42fr_0.42fr_0.42fr_0.55fr_0.55fr_0.42fr_0.62fr_8.5rem]">
                <span>Post &amp; omschrijving</span>
                <span>Eenheid</span>
                <span>Aantal volgt uit</span>
                <span className="text-right">Factor</span>
                <span className="text-right" title="Snijverlies %: automatisch bij het aantal opgeteld">Snij %</span>
                <span className="text-right" title={`Uren ploeg per eenheid × € ${UURTARIEF_ONDERAANNEMER}/uur`}>Uren</span>
                <span className="text-right">Mat. p/e</span>
                <span className="text-right">Kost p/e</span>
                <span className="text-right">Marge %</span>
                <span className="text-right">Verkoop p/e</span>
                <span />
              </div>
              {rijen.map((p) => (
                <form
                  key={p.id}
                  action={savePriceBookItem.bind(null, p.id)}
                  className={`grid gap-2 rounded-md border p-2.5 lg:grid-cols-[1.5fr_0.55fr_0.9fr_0.42fr_0.42fr_0.42fr_0.55fr_0.55fr_0.42fr_0.62fr_8.5rem] lg:items-center ${p.active ? "" : "opacity-50"}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Input name="name" defaultValue={p.name} className="font-medium" />
                      {p.needsReview && <Badge tone="warning">controleer</Badge>}
                    </div>
                    <Input name="description" defaultValue={p.description ?? ""} placeholder="wat is inbegrepen…" className="mt-1 text-xs" />
                  </div>
                  <Select name="unit" defaultValue={p.unit} title="Eenheid">
                    {EENHEDEN.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </Select>
                  <Select name="driver" defaultValue={p.driver} title="Maat waar het aantal uit volgt">
                    <option value={DRIVER_HANDMATIG}>{DRIVER_LABEL.get(DRIVER_HANDMATIG)}</option>
                    {DRIVERS.map((d) => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </Select>
                  <PriceBookRowFields
                    factor={moneyForInput(p.factor)}
                    wastePct={moneyForInput(p.wastePct)}
                    laborHours={moneyForInput(p.laborHours)}
                    materialCostEur={moneyForInput(p.materialCostEur)}
                    costEur={moneyForInput(p.costEur)}
                    marginPct={moneyForInput(p.marginPct)}
                    priceEur={moneyForInput(p.priceEur)}
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">Opslaan</SubmitButton>
                    <button type="submit" formAction={togglePriceBookActive.bind(null, p.id, !p.active)} className="text-xs text-muted hover:underline">
                      {p.active ? "uit" : "aan"}
                    </button>
                    <ConfirmSubmit
                      formAction={deletePriceBookItem.bind(null, p.id)}
                      message={`"${p.name}" verwijderen uit het prijzenboek?`}
                      className="rounded p-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      ×
                    </ConfirmSubmit>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted lg:col-span-8">
                    <input type="checkbox" name="isStelpost" defaultChecked={p.isStelpost} />
                    <span className="shrink-0">Stelpost</span>
                    <Input name="stelpostNote" defaultValue={p.stelpostNote ?? ""} placeholder="bv. tegels t/m € 30/m² inbegrepen — duurdere keuze wordt verrekend" className="text-xs" />
                  </label>
                </form>
              ))}

              <form action={addPriceBookItem.bind(null, hoofdstuk)} className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Input name="name" placeholder="nieuwe post…" className="w-64" required />
                <Select name="unit" defaultValue="stuk" className="w-24">
                  {EENHEDEN.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </Select>
                <Input name="costEur" placeholder="kost p/e" inputMode="decimal" className="w-28 text-right" />
                <SubmitButton size="sm" variant="ghost" pendingLabel="…">+ post</SubmitButton>
              </form>
            </CardContent>
          </Card>
        );
      })}

      {nacalc.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Nacalculatie — gecalculeerd vs. werkelijk</CardTitle>
            <span className="text-xs text-muted">projecten met budgetregels uit een gecalculeerde offerte</span>
          </CardHeader>
          <CardContent>
            <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted sm:grid">
              <span>Project</span>
              <span className="text-right">Gecalculeerde kost</span>
              <span className="text-right">Werkelijke kost</span>
              <span className="text-right">Afwijking</span>
            </div>
            {nacalc.map((r) => {
              const afw = r.werkelijkeKost - r.begrootKost;
              const pct = r.begrootKost > 0 ? (afw / r.begrootKost) * 100 : null;
              return (
                <div key={r.projectId} className="grid gap-2 rounded-md border p-2.5 text-sm sm:grid-cols-[1.6fr_1fr_1fr_1fr] sm:items-center">
                  <Link href={`/projects/${r.projectId}`} className="font-medium hover:underline">
                    {r.naam}
                  </Link>
                  <span className="text-right tabular-nums">{formatEUR(r.begrootKost)}</span>
                  <span className="text-right tabular-nums">{formatEUR(r.werkelijkeKost)}</span>
                  <span className={`text-right tabular-nums font-medium ${afw > 0 ? "text-danger" : "text-success"}`}>
                    {afw > 0 ? "+" : ""}
                    {formatEUR(afw)}
                    {pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)` : ""}
                  </span>
                </div>
              );
            })}
            <p className="mt-2 text-xs text-muted">
              Loopt de werkelijke kost structureel vóór op de calculatie, verhoog dan de kostprijzen hierboven — de
              verkoop rekent vanzelf mee. Werkelijke kost = arbeid + inkoop + losse kosten + geleverde producten.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted">
        Verkoopprijs = kost ÷ (1 − marge), excl. btw. Voorbeeld: kost € 70 met 30% marge → {formatEUR(100)}. Pas je
        kost of marge aan, dan rekent het verkoopveld direct mee; zelf een verkoopprijs typen mag altijd. Eigen producten kies
        je in de offerte-editor via de productkiezer — die rekenen met hun eigen catalogusmarge.{" "}
        <Link href="/calculator" className="text-accent hover:underline">
          Naar de calculator
        </Link>
        .
      </p>
    </>
  );
}
