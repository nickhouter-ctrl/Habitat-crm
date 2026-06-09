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

export const metadata = { title: "Nieuw project" };

export default async function NewProjectPage() {
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
        title="Nieuw project"
        subtitle="Een project bundelt offertes, facturen, inkoop en uren voor één klus."
        actions={
          <LinkButton href="/deals" variant="ghost">
            ← Terug
          </LinkButton>
        }
      />

      <Card>
        <CardContent className="p-5">
          <form action={createProject} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Naam" htmlFor="name">
                <Input id="name" name="name" required placeholder="bv. Renovatie villa Montgó" />
              </Field>
              <Field label="Code (optioneel)" htmlFor="code" hint="korte projectcode, bv. MTG-01">
                <Input id="code" name="code" />
              </Field>
              <Field label="Verantwoordelijke" htmlFor="ownerId">
                <Combobox name="ownerId" options={ownerOptions} placeholder="kies medewerker" clearable />
              </Field>
              <Field label="Klant" htmlFor="contactId">
                <Combobox name="contactId" options={contactOptions} placeholder="zoek contact" clearable />
              </Field>
              <Field label="Pand (optioneel)" htmlFor="propertyId">
                <Combobox name="propertyId" options={propertyOptions} placeholder="zoek pand" clearable />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Startdatum" htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" />
                </Field>
                <Field label="Einddatum" htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" />
                </Field>
              </div>
            </div>
            <Field label="Omschrijving" htmlFor="description">
              <Textarea id="description" name="description" rows={4} placeholder="Korte omschrijving van de klus…" />
            </Field>
            <SubmitButton pendingLabel="Aanmaken…">Project aanmaken</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
