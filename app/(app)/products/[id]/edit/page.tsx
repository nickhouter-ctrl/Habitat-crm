import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/product-form";
import { Button, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { getProductCategories } from "../../../_options";
import { deleteProduct, updateProduct } from "../../actions";

export const metadata = { title: "Product bewerken" };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [product, categories] = await Promise.all([
    db.query.products.findFirst({ where: eq(products.id, id) }),
    getProductCategories(),
  ]);
  if (!product) notFound();

  const update = updateProduct.bind(null, id);
  const remove = deleteProduct.bind(null, id);

  return (
    <>
      <PageHeader
        title="Product bewerken"
        subtitle={product.name}
        actions={
          <Link href="/products" className="text-sm text-muted hover:underline">
            ← Producten
          </Link>
        }
      />
      {sp.saved === "1" && (
        <p className="mb-4 max-w-2xl rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          Opgeslagen.
        </p>
      )}
      {sp.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (naam verplicht; geldige URL?).
        </p>
      )}
      <ProductForm
        action={update}
        product={product}
        categories={categories}
        submitLabel="Wijzigingen opslaan"
      />
      <form action={remove} className="mt-4 max-w-2xl">
        <Button type="submit" variant="ghost" size="sm" className="text-danger">
          Product verwijderen
        </Button>
      </form>
    </>
  );
}
