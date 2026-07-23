import { sql } from "drizzle-orm";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { contacts, products } from "@/lib/db/schema";
import { mailPricelist } from "./actions";

export const metadata = { title: "Prijslijst verkoop" };

export default async function PrijslijstPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  const [collections, categories, wandpaneelSeries, contactsList] = await Promise.all([
    db
      .select({ name: products.collection })
      .from(products)
      .where(sql`${products.collection} is not null`)
      .groupBy(products.collection)
      .orderBy(products.collection),
    db
      .select({ name: products.category })
      .from(products)
      .where(sql`${products.category} is not null`)
      .groupBy(products.category)
      .orderBy(products.category),
    db
      .select({ name: products.category })
      .from(products)
      .where(sql`${products.collection} = 'Wandpanelen' and ${products.category} is not null and ${products.isActive} = true`)
      .groupBy(products.category)
      .orderBy(products.category),
    db.select({ id: contacts.id, name: contacts.name, email: contacts.email }).from(contacts).orderBy(contacts.name),
  ]);

  const contactOptions = contactsList
    .filter((c) => c.email)
    .map((c) => ({ value: c.id, label: `${c.name} <${c.email}>` }));

  return (
    <>
      <PageHeader title="Prijslijst verkoop" subtitle="Download of mail een huisstijl-prijslijst per collectie of categorie." />

      {sent && (
        <p className="mb-4 max-w-2xl rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          ✅ Prijslijst is per e-mail verzonden.
        </p>
      )}
      {error && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>📥 Downloaden / printen</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="GET" action="/prijslijst/pdf" className="space-y-4" target="_blank">
              <FiltersInputs collections={collections.map((c) => c.name!).filter(Boolean)} categories={categories.map((c) => c.name!).filter(Boolean)} />
              <Field label="Titel (optioneel)" htmlFor="title">
                <Input id="title" name="title" placeholder="Prijslijst Verkoop 2026" />
              </Field>
              <Button type="submit">Download PDF</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📧 Naar klant mailen</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={mailPricelist} className="space-y-4">
              <FiltersInputs collections={collections.map((c) => c.name!).filter(Boolean)} categories={categories.map((c) => c.name!).filter(Boolean)} />
              <Field label="Klant" htmlFor="contactId" hint="Alleen contacten met e-mailadres">
                <Combobox name="contactId" options={contactOptions} placeholder="Zoek klant…" />
              </Field>
              <Field label="Onderwerp" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue="Habitat One — Prijslijst verkoop" />
              </Field>
              <Field label="Bericht (optioneel)" htmlFor="message">
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Beste …, hierbij onze prijslijst. …"
                />
              </Field>
              <SubmitButton pendingLabel="Versturen…">Verstuur per e-mail</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 max-w-5xl border-[#e8dfd0] bg-[#fdfaf5]">
        <CardHeader>
          <CardTitle>🧱 Flexibel Stone — groothandelbrochure</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            Gebrande prijsbrochure voor groothandelklanten: per wandpaneel jouw inkoop bij Habitat en de
            adviesprijs voor de consument (ex/incl btw, ook per m²). Geldig bij afname per halve of hele
            container; alle prijzen ex btw.
          </p>
          <form method="GET" action="/prijslijst/groothandel/pdf" className="flex flex-wrap items-end gap-4" target="_blank">
            <Field label="Serie" htmlFor="gh-category">
              <Select id="gh-category" name="category" defaultValue="">
                <option value="">— Volledige collectie —</option>
                {wandpaneelSeries.map((c) => (
                  <option key={c.name} value={c.name!}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Taal van de PDF" htmlFor="gh-lang">
              <Select id="gh-lang" name="lang" defaultValue="nl">
                <option value="nl">🇳🇱 Nederlands</option>
                <option value="de">🇩🇪 Duits (Deutsch)</option>
                <option value="en">🇬🇧 Engels (English)</option>
                <option value="es">🇪🇸 Spaans (Español)</option>
              </Select>
            </Field>
            <Button type="submit">Download brochure</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function FiltersInputs({ collections, categories }: { collections: string[]; categories: string[] }) {
  return (
    <>
      <Field label="Doelgroep / prijsniveau" htmlFor="audience">
        <Select id="audience" name="audience" defaultValue="particulier">
          <option value="particulier">👤 Particulier — showroomprijs</option>
          <option value="trade">🔨 Aannemer / architect — B2B-prijs</option>
        </Select>
      </Field>
      <Field label="Taal van de PDF" htmlFor="lang">
        <Select id="lang" name="lang" defaultValue="nl">
          <option value="nl">🇳🇱 Nederlands</option>
          <option value="de">🇩🇪 Duits (Deutsch)</option>
          <option value="en">🇬🇧 Engels (English)</option>
          <option value="es">🇪🇸 Spaans (Español)</option>
        </Select>
      </Field>
      <Field label="Collectie" htmlFor="collection">
        <Select id="collection" name="collection" defaultValue="">
          <option value="">— Alle collecties —</option>
          {collections.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Categorie" htmlFor="category">
        <Select id="category" name="category" defaultValue="">
          <option value="">— Alle categorieën —</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyActive" defaultChecked className="size-4 rounded border-border" />
        Alleen actieve producten
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyWithPrice" defaultChecked className="size-4 rounded border-border" />
        Alleen producten met verkoopprijs
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyInStock" className="size-4 rounded border-border" />
        Alleen producten op voorraad
      </label>
    </>
  );
}

