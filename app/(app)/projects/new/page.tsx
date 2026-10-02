import { tekst as uiTranslation } from '@/lib/i18n/server';
import { asc } from "drizzle-orm";

import {
  Card,
  CardContent,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import { contacts, properties, users } from "@/lib/db/schema";
import { createProject } from "../actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Nieuw project") };
}

export default async function NewProjectPage() {
  const uiT = await uiTranslation();
  const [contactOpts, ownerOpts, propertyOpts] = await Promise.all([
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.email)),
    db.select({ id: properties.id, title: properties.title }).from(properties).orderBy(asc(properties.title)),
  ]);

  const contactOptions: ComboOption[] = contactOpts.map((c) => ({ value: c.id, label: c.name }));
  const ownerOptions: ComboOption[] = ownerOpts.map((u) => ({ value: u.id, label: u.name ?? u.email }));
  const propertyOptions: ComboOption[] = propertyOpts.map((p) => ({ value: p.id, label: p.title }));

  return (
    <>
      <PageHeader
        title={uiT("Nieuw project")}
        subtitle={uiT("Een project bundelt offertes, facturen, inkoop en uren voor één klus.")}
        actions={
          <LinkButton href="/deals" variant="ghost">
            {uiT("← Terug")} </LinkButton>
        }
      />

      <Card>
        <CardContent className="p-5">
          <form action={createProject} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={uiT("Naam")} htmlFor="name">
                <Input id="name" name="name" required placeholder={uiT("bv. Renovatie villa Montgó")} />
              </Field>
              <Field label={uiT("Code (optioneel)")} htmlFor="code" hint={uiT("korte projectcode, bv. MTG-01")}>
                <Input id="code" name="code" />
              </Field>
              <Field label={uiT("Verantwoordelijke")} htmlFor="ownerId">
                <Combobox name="ownerId" options={ownerOptions} placeholder={uiT("kies medewerker")} clearable />
              </Field>
              <Field label={uiT("Klant")} htmlFor="contactId">
                <Combobox name="contactId" options={contactOptions} placeholder={uiT("zoek contact")} clearable />
              </Field>
              <Field label={uiT("Pand (optioneel)")} htmlFor="propertyId">
                <Combobox name="propertyId" options={propertyOptions} placeholder={uiT("zoek pand")} clearable />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={uiT("Startdatum")} htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" />
                </Field>
                <Field label={uiT("Einddatum")} htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" />
                </Field>
              </div>
            </div>
            <Field label={uiT("Omschrijving")} htmlFor="description">
              <Textarea id="description" name="description" rows={4} placeholder={uiT("Korte omschrijving van de klus…")} />
            </Field>
            <SubmitButton pendingLabel={uiT("Aanmaken…")}>{uiT("Project aanmaken")}</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
