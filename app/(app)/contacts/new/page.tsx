import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";

import { Card, CardContent, PageHeader } from "@/components/ui";
import { ContactCreateForm } from "@/components/contact-create-form";
import { addressSuggestions } from "../../documents/actions";
import { createContact } from "../actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Nieuw contact") };
}

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const params = await searchParams;
  const hasError = params.error === "validation";

  return (
    <>
      <PageHeader
        title={uiT("Nieuw contact")}
        subtitle={uiT("Voeg een particuliere of zakelijke klant, leverancier of partner toe")}
        actions={
          <Link href="/contacts" className="text-sm text-muted hover:underline">
            {uiT("← Terug naar contacten")} </Link>
        }
      />

      <Card className="max-w-2xl">
        <CardContent>
          {hasError && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
              {uiT("Controleer de ingevulde gegevens (geldig e-mailadres?).")} </p>
          )}
          <ContactCreateForm action={createContact} onSuggest={addressSuggestions} />
        </CardContent>
      </Card>
    </>
  );
}
