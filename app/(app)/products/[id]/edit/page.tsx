import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/barcode";
import { ProductForm } from "@/components/product-form";
import {
  Badge,
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
import {
  deleteProduct,
  generateBarcode,
  pushProductToWebsiteAction,
  removeProductPhoto,
  updateProduct,
  uploadProductPhoto,
} from "../../actions";

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
  const uploadPhoto = uploadProductPhoto.bind(null, id);
  const removePhoto = removeProductPhoto.bind(null, id);
  const pushSite = pushProductToWebsiteAction.bind(null, id);
  const hasGithubToken = Boolean(process.env.GITHUB_TOKEN_HABITAT_ONE);

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
      {sp.error === "upload" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Geen bestand gekozen of upload mislukt.
        </p>
      )}
      {typeof sp.pushed === "string" && (
        <p className="mb-4 max-w-2xl rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          {sp.pushed === "created" ? "Aangemaakt op de website" : "Bijgewerkt op de website"} (id {sp.websiteId}) — commit {sp.commit}. Vercel-deploy van de site loopt.
        </p>
      )}
      {typeof sp.pushError === "string" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Push mislukt: {sp.pushError}
        </p>
      )}

      <Card className="mb-4 max-w-2xl">
        <CardHeader>
          <CardTitle>Barcode</CardTitle>
          {product.barcode && (
            <a
              href={`/labels/${id}`}
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

      <div className="mb-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Foto</CardTitle>
            {product.imageUrl && (
              <form action={removePhoto}>
                <button className={buttonClass({ variant: "ghost", size: "sm" })}>verwijderen</button>
              </form>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-32 w-full rounded border border-border object-contain"
              />
            ) : (
              <p className="text-sm text-muted">Nog geen foto geüpload.</p>
            )}
            <form action={uploadPhoto} encType="multipart/form-data" className="space-y-2">
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
                className="block w-full text-sm"
              />
              <Button type="submit" size="sm" variant="secondary">
                {product.imageUrl ? "Vervangen" : "Uploaden"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Website</CardTitle>
            {product.websiteProductId && (
              <Badge tone="success">✓ op site (id {product.websiteProductId})</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted">
              {product.websiteProductId
                ? "Bestaande website-entry wordt bij elke push bijgewerkt (naam, omschrijving, afmetingen, foto)."
                : product.pushToWebsite
                  ? "Klaargezet — klik 'Push naar website' om 'm aan te maken."
                  : "Vink 'Op de website tonen' aan in het formulier en sla op om te kunnen pushen."}
            </p>
            {!hasGithubToken && (
              <p className="text-xs text-warning">
                ⚠️ GITHUB_TOKEN_HABITAT_ONE niet ingesteld — push faalt.
              </p>
            )}
            <form action={pushSite}>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!product.pushToWebsite && !product.websiteProductId}
              >
                Push naar website
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

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
