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
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { priceBookItems } from "@/lib/db/schema";
import { moneyForInput } from "@/lib/parse-money";
import { DRIVERS, DRIVER_HANDMATIG, DRIVER_LABEL, EENHEDEN, HOOFDSTUKKEN } from "@/lib/price-book";
import { formatEUR } from "@/lib/utils";
import { addPriceBookItem, deletePriceBookItem, savePriceBookItem, togglePriceBookActive } from "./actions";

export const metadata = { title: "Prijzenboek" };

export default async function PrijzenboekPage() {
  const posten = await db.select().from(priceBookItems).orderBy(asc(priceBookItems.sortOrder), asc(priceBookItems.name));
  const teControleren = posten.filter((p) => p.needsReview).length;
  const zonderPrijs = posten.filter((p) => p.active && p.priceEur == null).length;

  return (
    <>
      <PageHeader
        title="Prijzenboek"
        subtitle="eenheidsprijzen voor de offerte-calculator · marge zit in de prijs, dus nooit meer te laag offreren"
        actions={
          <LinkButton href="/prijzenboek/offerte" variant="primary">
            Offerte calculeren
          </LinkButton>
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
              {rijen.map((p) => (
                <form
                  key={p.id}
                  action={savePriceBookItem.bind(null, p.id)}
                  className={`grid gap-2 rounded-md border p-2.5 lg:grid-cols-[1.6fr_0.6fr_1fr_0.5fr_0.6fr_0.5fr_0.7fr_auto] lg:items-center ${p.active ? "" : "opacity-50"}`}
                >
                  <div>
                    <Input name="name" defaultValue={p.name} className="font-medium" />
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
                  <Input name="factor" defaultValue={moneyForInput(p.factor)} className="text-right" title="Factor: aantal = maat × factor" />
                  <Input name="costEur" defaultValue={moneyForInput(p.costEur)} placeholder="kost" className="text-right" title="Onze kost per eenheid" />
                  <Input name="marginPct" defaultValue={moneyForInput(p.marginPct)} className="text-right" title="Marge, % van de verkoopprijs" />
                  <Input
                    name="priceEur"
                    defaultValue={moneyForInput(p.priceEur)}
                    placeholder="auto"
                    className="text-right font-semibold"
                    title="Verkoop per eenheid — leeg laten = kost ÷ (1 − marge)"
                  />
                  <div className="flex items-center gap-1.5">
                    {p.needsReview && <Badge tone="warning">controleer</Badge>}
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

      <p className="text-xs text-muted">
        Verkoopprijs = kost ÷ (1 − marge). Voorbeeld: kost € 70 met 30% marge → {formatEUR(100)}. Eigen producten kies
        je in de offerte-editor via de productkiezer — die rekenen met hun eigen catalogusmarge.{" "}
        <Link href="/prijzenboek/offerte" className="text-accent hover:underline">
          Naar de calculator
        </Link>
        .
      </p>
    </>
  );
}
