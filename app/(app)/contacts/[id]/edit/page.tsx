import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { updateContact } from "../../actions";
import { contactTypeMeta, languageMeta, leadStageMeta } from "../../../_meta";

export const metadata = { title: "Contact bewerken" };

export default async function EditContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const hasError = sp.error === "validation";

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!contact) notFound();

  const save = updateContact.bind(null, id);

  return (
    <>
      <PageHeader
        title="Contact bewerken"
        subtitle={contact.name}
        actions={
          <Link href={`/contacts/${id}`} className="text-sm text-muted hover:underline">
            ← Terug naar contact
          </Link>
        }
      />

      <Card className="max-w-2xl">
        <CardContent>
          {hasError && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
              Controleer de ingevulde gegevens (geldig e-mailadres?).
            </p>
          )}
          <form action={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Voornaam" htmlFor="firstName">
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={contact.firstName ?? ""}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Achternaam" htmlFor="lastName">
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={contact.lastName ?? ""}
                  autoComplete="family-name"
                />
              </Field>
            </div>

            <Field
              label="Weergavenaam"
              htmlFor="name"
              hint="Laat leeg om voor- en achternaam te combineren."
            >
              <Input
                id="name"
                name="name"
                defaultValue={contact.name ?? ""}
                placeholder="bv. Familie Janssen / Bouwbedrijf X"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-mail" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={contact.email ?? ""}
                  autoComplete="email"
                />
              </Field>
              <Field label="Functie" htmlFor="jobTitle">
                <Input id="jobTitle" name="jobTitle" defaultValue={contact.jobTitle ?? ""} />
              </Field>
              <Field label="Telefoon" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
              </Field>
              <Field label="Mobiel" htmlFor="mobile">
                <Input id="mobile" name="mobile" type="tel" defaultValue={contact.mobile ?? ""} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type" htmlFor="type">
                <Select id="type" name="type" defaultValue={contact.type ?? "lead"}>
                  {(Object.keys(contactTypeMeta) as Array<keyof typeof contactTypeMeta>).map(
                    (k) => (
                      <option key={k} value={k}>
                        {contactTypeMeta[k].label}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
              <Field label="Lead-fase" htmlFor="stage" hint="Alleen relevant voor leads.">
                <Select id="stage" name="stage" defaultValue={contact.stage ?? "new"}>
                  {(Object.keys(leadStageMeta) as Array<keyof typeof leadStageMeta>).map((k) => (
                    <option key={k} value={k}>
                      {leadStageMeta[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Voorkeurstaal" htmlFor="preferredLanguage">
                <Select
                  id="preferredLanguage"
                  name="preferredLanguage"
                  defaultValue={contact.preferredLanguage ?? "es"}
                >
                  {(Object.keys(languageMeta) as Array<keyof typeof languageMeta>).map((k) => (
                    <option key={k} value={k}>
                      {languageMeta[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bron" htmlFor="source" hint="bv. website, doorverwijzing">
                <Input id="source" name="source" defaultValue={contact.source ?? ""} />
              </Field>
              <Field label="Plaats" htmlFor="city">
                <Input id="city" name="city" defaultValue={contact.city ?? ""} />
              </Field>
            </div>

            <Field label="Notities" htmlFor="notes">
              <Textarea id="notes" name="notes" defaultValue={contact.notes ?? ""} />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit">Wijzigingen opslaan</Button>
              <Link
                href={`/contacts/${id}`}
                className="rounded-md px-3 py-2 text-sm text-muted hover:underline"
              >
                Annuleren
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
