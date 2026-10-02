import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";

import { PropertyForm } from "@/components/property-form";
import { PageHeader } from "@/components/ui";
import { getPropertyFormOptions } from "../../_options";
import { createProperty } from "../actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Nieuw pand") };
}

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const params = await searchParams;
  const { contacts, users } = await getPropertyFormOptions();

  return (
    <>
      <PageHeader
        title={uiT("Nieuw pand")}
        subtitle={uiT("Vastgoed te koop")}
        actions={
          <Link href="/properties" className="text-sm text-muted hover:underline">
            {uiT("← Panden")} </Link>
        }
      />
      {params.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {uiT("Controleer de gegevens (titel verplicht).")} </p>
      )}
      <PropertyForm
        action={createProperty}
        contacts={contacts}
        users={users}
        submitLabel={uiT("Pand aanmaken")}
      />
    </>
  );
}
