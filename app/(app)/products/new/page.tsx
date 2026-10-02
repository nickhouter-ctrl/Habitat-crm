import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";

import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { getProductCategories, getProductCollections, listBrands } from "../../_options";
import { createProduct } from "../actions";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Nieuw product") };
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiT = await uiTranslation();
  const params = await searchParams;
  const [collections, categories, merken] = await Promise.all([
    getProductCollections(),
    getProductCategories(),
    listBrands(),
  ]);

  return (
    <>
      <PageHeader
        title={uiT("Nieuw product")}
        subtitle={uiT("Materiaal of dienst — komt in de productkeuze bij offertes/facturen")}
        actions={
          <Link href="/products" className="text-sm text-muted hover:underline">
            {uiT("← Producten")} </Link>
        }
      />
      {params.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {uiT("Controleer de gegevens (naam verplicht; geldige URL?).")} </p>
      )}
      <ProductForm
        action={createProduct}
        collections={collections}
        categories={categories}
        brands={merken}
        submitLabel={uiT("Product aanmaken")}
      />
    </>
  );
}
