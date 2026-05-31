import Link from "next/link";

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
import { createContact } from "../actions";
import {
  contactTypeMeta,
  languageMeta,
  leadStageMeta,
} from "../../_meta";

export const metadata = { title: "Nieuw contact" };

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const hasError = params.error === "validation";

  return (
    <>
      <PageHeader
        title="Nieuw contact"
        subtitle="Voeg een lead, klant, eigenaar of leverancier toe"
        actions={
          <Link href="/contacts" className="text-sm text-muted hover:underline">
            ← Terug naar contacten
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
          <form action={createContact} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Voornaam" htmlFor="firstName">
                <Input id="firstName" name="firstName" autoComplete="given-name" />
              </Field>
              <Field label="Achternaam" htmlFor="lastName">
                <Input id="lastName" name="lastName" autoComplete="family-name" />
              </Field>
            </div>

            <Field
              label="Weergavenaam"
              htmlFor="name"
              hint="Laat leeg om voor- en achternaam te combineren."
            >
              <Input id="name" name="name" placeholder="bv. Familie Janssen / Bouwbedrijf X" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-mail" htmlFor="email">
                <Input id="email" name="email" type="email" autoComplete="email" />
              </Field>
              <Field label="Functie" htmlFor="jobTitle">
                <Input id="jobTitle" name="jobTitle" />
              </Field>
              <Field label="Telefoon" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" />
              </Field>
              <Field label="Mobiel" htmlFor="mobile">
                <Input id="mobile" name="mobile" type="tel" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type" htmlFor="type">
                <Select id="type" name="type" defaultValue="lead">
                  {(
                    Object.keys(contactTypeMeta) as Array<keyof typeof contactTypeMeta>
                  ).map((k) => (
                    <option key={k} value={k}>
                      {contactTypeMeta[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lead-fase" htmlFor="stage" hint="Alleen relevant voor leads.">
                <Select id="stage" name="stage" defaultValue="new">
                  {(
                    Object.keys(leadStageMeta) as Array<keyof typeof leadStageMeta>
                  ).map((k) => (
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
                  defaultValue="es"
                >
                  {(Object.keys(languageMeta) as Array<keyof typeof languageMeta>).map(
                    (k) => (
                      <option key={k} value={k}>
                        {languageMeta[k]}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
            </div>

            <Field label="Adres (straat + nr.)" htmlFor="addressLine">
              <Input id="addressLine" name="addressLine" placeholder="bv. Camí de la Fontana 3" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Postcode" htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" />
              </Field>
              <Field label="Plaats" htmlFor="city">
                <Input id="city" name="city" />
              </Field>
              <Field label="Provincie" htmlFor="province">
                <Input id="province" name="province" />
              </Field>
              <Field label="Land" htmlFor="country">
                <Input id="country" name="country" defaultValue="España" />
              </Field>
            </div>
            <Field label="Bron" htmlFor="source" hint="bv. website, doorverwijzing">
              <Input id="source" name="source" />
            </Field>

            <Field label="Notities" htmlFor="notes">
              <Textarea id="notes" name="notes" />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit">Contact opslaan</Button>
              <Link
                href="/contacts"
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
