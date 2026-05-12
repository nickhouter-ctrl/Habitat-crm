import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/barcode";
import { ProductForm } from "@/components/product-form";
import {
  Button,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { getProductCategories, getProductCollections } from "../../../_options";
import { deleteProduct, generateBarcode, updateProduct } from "../../actions";

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

  const [product, collections, categories] = await Promise.all([
    db.query.products.findFirst({ where: eq(products.id, id) }),
    getProductCollections(),
    getProductCategories(),
  ]);
  if (!product) notFound();

  const update = updateProduct.bind(null, id);
  const remove = deleteProduct.bind(null, id);
  const genBarcode = generateBarcode.bind(null, id);

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

      <Card className="mb-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Barcode</CardTitle>
          {product.barcode && (
            <a
              href={`/products/${id}/label`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Label printen
            </a>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {product.barcode ? (
            <div className="flex flex-wrap items-center gap-6">
              <Barcode value={product.barcode} />
              <code className="font-mono text-sm">{product.barcode}</code>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nog geen barcode. Genereer er automatisch een (EAN-13), of vul er handmatig één in
              hierboven en sla op.
            </p>
          )}
          <form action={genBarcode}>
            <Button type="submit" size="sm" variant="secondary">
              {product.barcode ? "Nieuwe barcode genereren" : "Barcode genereren"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ProductForm
        action={update}
        product={product}
        collections={collections}
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
