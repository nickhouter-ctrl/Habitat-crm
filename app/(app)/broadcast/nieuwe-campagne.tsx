import { tekst as uiTranslation } from '@/lib/i18n/server';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";
import { groupLabel } from "@/lib/leads/groups";

import { createCampaign } from "./actions";

export const CATEGORY_LABEL: Record<string, string> = {
  architect: "Architect",
  aannemer: "Aannemer",
  makelaar: "Makelaar",
  interieur: "Interieur",
  projectontwikkelaar: "Projectontwikkelaar",
  hovenier: "Hovenier",
  overig: "Overig",
};

/**
 * Een nieuwe campagne beginnen. Bewust maar drie beslissingen: voor wie, in
 * welke taal, en welke producten erin komen. Onderwerp en tekst komen op de
 * volgende stap, want dáár staat het voorbeeld van de mail ernaast — een
 * onderwerp bedenken zonder te zien hoe de mail eruitziet, werkt niet.
 */
export async function NieuweCampagne({
  groupOpts,
}: {
  groupOpts: { collection: string; n: number; image: string | null }[];
}) {
  const uiT = await uiTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiT("Nieuwe campagne")}</CardTitle>
        <span className="text-xs text-muted">{uiT("stap 1 van 2")}</span>
      </CardHeader>
      <CardContent>
        <form action={createCampaign} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={uiT("Naam")} htmlFor="name" hint={uiT("Alleen voor jullie — de ontvanger ziet deze niet")}>
              <Input id="name" name="name" required placeholder={uiT("Voorjaarsselectie architecten")} />
            </Field>
            <Field label={uiT("Taal van de e-mail")} htmlFor="language" hint={uiT("Spaanse bedrijven → Español")}>
              <Select id="language" name="language" defaultValue="es">
                <option value="es">{uiT("Español (standaard)")}</option>
                <option value="nl">Nederlands</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{uiT("Naar wie gaat hij?")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="categories" value={v} defaultChecked={v !== "overig"} />
                  {uiT(l)}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="includeCustomers" />
              {uiT("Ook naar bestaande klanten (contacten met e-mailadres)")} </label>
            <p className="text-xs text-muted">
              {uiT("Afgemelde adressen, bestaande contacten en bedrijven die recent al mail kregen vallen er automatisch buiten. Het exacte aantal zie je op de volgende stap.")} </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{uiT("Welke producten komen erin?")}</legend>
            {groupOpts.length === 0 ? (
              <p className="text-xs text-muted">{uiT("Geen productgroepen met foto beschikbaar.")}</p>
            ) : (
              <>
                <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-auto rounded-lg border p-2 sm:grid-cols-3">
                  {groupOpts.map((g) => (
                    <label
                      key={g.collection}
                      className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-xs transition-colors hover:bg-background"
                    >
                      <input type="checkbox" name="groups" value={g.collection} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {g.image && <img src={g.image} alt="" className="size-10 shrink-0 rounded object-cover" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{uiT(groupLabel(g.collection))}</span>
                        <span className="text-muted">{g.n} {uiT("producten")}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">{uiT("Maximaal zes groepen komen als tegel in de mail te staan.")}</p>
              </>
            )}
          </fieldset>

          <Button type="submit" variant="primary">
            {uiT("Volgende: onderwerp en tekst →")} </Button>
        </form>
      </CardContent>
    </Card>
  );
}
