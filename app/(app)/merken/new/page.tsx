import { tekst as uiTranslation } from '@/lib/i18n/server';
import { Card, CardContent, PageHeader } from "@/components/ui";

import { createBrand } from "../actions";
import { BrandForm } from "../brand-form";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Nieuw merk") };
}

export default async function NieuwMerkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const params = await searchParams;
  return (
    <>
      <PageHeader title={uiT("Nieuw merk")} subtitle={uiT("Logo en brochures kun je toevoegen zodra het merk is aangemaakt")} />
      {params.error === "validation" && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {uiT("Controleer de ingevulde velden — een naam is verplicht.")} </p>
      )}
      <Card>
        <CardContent className="pt-5">
          <BrandForm action={createBrand} submitLabel={uiT("Merk aanmaken")} />
        </CardContent>
      </Card>
    </>
  );
}
