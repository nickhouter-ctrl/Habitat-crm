import { requireModuleRead } from "@/lib/auth/guards";
import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { sql } from "drizzle-orm";
import Link from "next/link";
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

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Prijslijst verkoop") };
}

export default async function PrijslijstPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access=await requireModuleRead("verkoopprijzen");
  const uiT = await uiTranslation();
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
<TabsRoot defaultTab="download" ids={["download","mail","partners"]} param="section">
      <PageHeader title={uiT("Prijslijst verkoop")} subtitle={uiT("Download of mail een huisstijl-prijslijst per collectie of categorie.")} />
<TabsBar tabs={[{id:"download",label:uiT("Downloaden & printen")},{id:"mail",label:uiT("Naar klant mailen")},{id:"partners",label:uiT("Verkooppunten")}]}/>

      {sent && (
        <p className="mb-4 max-w-2xl rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          {uiT("✅ Prijslijst is per e-mail verzonden.")} </p>
      )}
      {error && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <TabPanel id="download"><Card>
          <CardHeader>
            <CardTitle>{uiT("📥 Downloaden / printen")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="GET" action="/prijslijst/pdf" className="space-y-4" target="_blank">
              <FiltersInputs collections={collections.map((c) => c.name!).filter(Boolean)} categories={categories.map((c) => c.name!).filter(Boolean)} />
              <Field label={uiT("Titel (optioneel)")} htmlFor="title">
                <Input id="title" name="title" placeholder={uiT("Prijslijst Verkoop 2026")} />
              </Field>
              <Button type="submit">{uiT("Download PDF")}</Button>
            </form>
          </CardContent>
        </Card></TabPanel>

        <TabPanel id="mail"><Card>
          <CardHeader>
            <CardTitle>{uiT("📧 Naar klant mailen")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={mailPricelist} className="space-y-4">
              <FiltersInputs collections={collections.map((c) => c.name!).filter(Boolean)} categories={categories.map((c) => c.name!).filter(Boolean)} />
              <Field label={uiT("Klant")} htmlFor="contactId" hint={uiT("Alleen contacten met e-mailadres")}>
                <Combobox name="contactId" options={contactOptions} placeholder={uiT("Zoek klant…")} />
              </Field>
              <Field label={uiT("Onderwerp")} htmlFor="subject">
                <Input id="subject" name="subject" defaultValue="Habitat One — Prijslijst verkoop" />
              </Field>
              <Field label={uiT("Bericht (optioneel)")} htmlFor="message">
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder={uiT("Beste …, hierbij onze prijslijst. …")}
                />
              </Field>
              <SubmitButton pendingLabel={uiT("Versturen…")}>{uiT("Verstuur per e-mail")}</SubmitButton>
            </form>
          </CardContent>
        </Card></TabPanel>
      </div>

      <TabPanel id="partners"><Card className="mt-5 max-w-5xl border-[#e8dfd0] bg-[#fdfaf5]">
        <CardHeader>
          <CardTitle>{uiT("🏬 Flexibel Stone — prijzen voor verkooppunten")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            {uiT("Voor winkels en showrooms die doorverkopen: 50% onder de vaste adviesprijs, en 70% korting op materiaal voor hun eigen showroom. Een ander niveau dan de B2B-prijs hierboven, die voor architecten en bouwbedrijven is.")} </p>
          <Link href="/prijslijst/distributeur" className="text-sm font-medium text-accent hover:underline">
            {uiT("Bekijk en verstuur de lijst →")} </Link>
        </CardContent>
      </Card></TabPanel>

      <TabPanel id="partners"><Card className="mt-5 max-w-5xl border-[#e8dfd0] bg-[#fdfaf5]">
        <CardHeader>
          <CardTitle>{uiT("🧱 Flexibel Stone — groothandelbrochure")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            {uiT("Gebrande prijsbrochure voor groothandelklanten: per wandpaneel jouw inkoop bij Habitat en de adviesprijs voor de consument (ex/incl btw, ook per m²). Geldig bij afname per halve of hele container; alle prijzen ex btw.")} </p>
          <form method="GET" action="/prijslijst/groothandel/pdf" className="flex flex-wrap items-end gap-4" target="_blank">
            <Field label={uiT("Serie")} htmlFor="gh-category">
              <Select id="gh-category" name="category" defaultValue="">
                <option value="">{uiT("— Volledige collectie —")}</option>
                {wandpaneelSeries.map((c) => (
                  <option key={c.name} value={c.name!}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={uiT("Taal van de PDF")} htmlFor="gh-lang">
              <Select id="gh-lang" name="lang" defaultValue="nl">
                <option value="nl">{uiT("🇳🇱 Nederlands")}</option>
                <option value="de">{uiT("🇩🇪 Duits (Deutsch)")}</option>
                <option value="en">{uiT("🇬🇧 Engels (English)")}</option>
                <option value="es">{uiT("🇪🇸 Spaans (Español)")}</option>
              </Select>
            </Field>
            <Button type="submit">{uiT("Download brochure")}</Button>
          </form>
        </CardContent>
      </Card></TabPanel>

</TabsRoot>
</>
  );
}

async function FiltersInputs({ collections, categories }: { collections: string[]; categories: string[] }) {
  const uiT = await uiTranslation();
  return (
    <>
      <Field label={uiT("Doelgroep / prijsniveau")} htmlFor="audience">
        <Select id="audience" name="audience" defaultValue="particulier">
          <option value="particulier">{uiT("👤 Particulier — showroomprijs")}</option>
          <option value="trade">{uiT("🔨 Aannemer / architect — B2B-prijs")}</option>
        </Select>
      </Field>
      <Field label={uiT("Taal van de PDF")} htmlFor="lang">
        <Select id="lang" name="lang" defaultValue="nl">
          <option value="nl">{uiT("🇳🇱 Nederlands")}</option>
          <option value="de">{uiT("🇩🇪 Duits (Deutsch)")}</option>
          <option value="en">{uiT("🇬🇧 Engels (English)")}</option>
          <option value="es">{uiT("🇪🇸 Spaans (Español)")}</option>
        </Select>
      </Field>
      <Field label={uiT("Collectie")} htmlFor="collection">
        <Select id="collection" name="collection" defaultValue="">
          <option value="">{uiT("— Alle collecties —")}</option>
          {collections.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label={uiT("Categorie")} htmlFor="category">
        <Select id="category" name="category" defaultValue="">
          <option value="">{uiT("— Alle categorieën —")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyActive" defaultChecked className="size-4 rounded border-border" />
        {uiT("Alleen actieve producten")} </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyWithPrice" defaultChecked className="size-4 rounded border-border" />
        {uiT("Alleen producten met verkoopprijs")} </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="onlyInStock" className="size-4 rounded border-border" />
        {uiT("Alleen producten op voorraad")} </label>
    </>
  );
}

