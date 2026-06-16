import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, PageHeader } from "@/components/ui";
import { ContactCreateForm, type ContactFormInitial } from "@/components/contact-create-form";
import { db } from "@/lib/db";
import { companies, contacts } from "@/lib/db/schema";
import { addressSuggestions } from "../../../documents/actions";
import { updateContact } from "../../actions";

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

  const company = contact.companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, contact.companyId),
        columns: { name: true },
      })
    : null;

  // Huidig type → klanttype voor de knoppenkeuze.
  const klanttype: ContactFormInitial["klanttype"] =
    contact.type === "supplier"
      ? "leverancier"
      : contact.type === "partner"
        ? "partner"
        : contact.companyId
          ? "zakelijk"
          : "particulier";

  const initial: ContactFormInitial = {
    klanttype,
    firstName: contact.firstName,
    lastName: contact.lastName,
    companyName: company?.name ?? null,
    email: contact.email,
    phone: contact.phone,
    addressLine: contact.addressLine,
    postalCode: contact.postalCode,
    city: contact.city,
    province: contact.province,
    preferredLanguage: contact.preferredLanguage,
    notes: contact.notes,
  };

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
          <ContactCreateForm
            action={save}
            onSuggest={addressSuggestions}
            initial={initial}
            submitLabel="Wijzigingen opslaan"
          />
        </CardContent>
      </Card>
    </>
  );
}
