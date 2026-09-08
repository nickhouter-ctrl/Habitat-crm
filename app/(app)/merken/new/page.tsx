import { Card, CardContent, PageHeader } from "@/components/ui";

import { createBrand } from "../actions";
import { BrandForm } from "../brand-form";

export const metadata = { title: "Nieuw merk" };

export default async function NieuwMerkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader title="Nieuw merk" subtitle="Logo en brochures kun je toevoegen zodra het merk is aangemaakt" />
      {params.error === "validation" && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          Controleer de ingevulde velden — een naam is verplicht.
        </p>
      )}
      <Card>
        <CardContent className="pt-5">
          <BrandForm action={createBrand} submitLabel="Merk aanmaken" />
        </CardContent>
      </Card>
    </>
  );
}
