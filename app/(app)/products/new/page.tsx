import Link from "next/link";

import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { getProductCategories } from "../../_options";
import { createProduct } from "../actions";

export const metadata = { title: "Nieuw product" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const categories = await getProductCategories();

  return (
    <>
      <PageHeader
        title="Nieuw product"
        subtitle="Materiaal of dienst — komt in de productkeuze bij offertes/facturen"
        actions={
          <Link href="/products" className="text-sm text-muted hover:underline">
            ← Producten
          </Link>
        }
      />
      {params.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (naam verplicht; geldige URL?).
        </p>
      )}
      <ProductForm action={createProduct} categories={categories} submitLabel="Product aanmaken" />
    </>
  );
}
