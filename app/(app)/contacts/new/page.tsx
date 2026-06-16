import Link from "next/link";

import { Card, CardContent, PageHeader } from "@/components/ui";
import { ContactCreateForm } from "@/components/contact-create-form";
import { addressSuggestions } from "../../documents/actions";
import { createContact } from "../actions";

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
        subtitle="Voeg een particuliere of zakelijke klant, leverancier of partner toe"
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
          <ContactCreateForm action={createContact} onSuggest={addressSuggestions} />
        </CardContent>
      </Card>
    </>
  );
}
