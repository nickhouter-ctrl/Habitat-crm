import { and, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/barcode";
import { ConfirmSubmit } from "@/components/confirm-submit";
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
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { documents, products, projects } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
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

  // Waar staat dit product gereserveerd (geaccepteerde offertes) of verkocht
  // (facturen − creditnota's)? Per project optellen.
  const refDocs = await db
    .select({
      kind: documents.kind,
      status: documents.status,
      items: documents.items,
      projectId: documents.projectId,
      projectName: projects.name,
    })
    .from(documents)
    .leftJoin(projects, eq(documents.projectId, projects.id))
    .where(
      and(
        inArray(documents.kind, ["estimate", "invoice", "creditnote"]),
        sql`${documents.items}::text like ${"%" + id + "%"}`,
      ),
    );
  const perProject = new Map<string, { name: string; reserved: number; sold: number }>();
  for (const d of refDocs) {
    const key = d.projectId ?? "__none__";
    for (const it of normalizeDocItems(d.items)) {
      if (it.productId !== id || !it.units) continue;
      const e = perProject.get(key) ?? { name: d.projectName ?? "(geen project)", reserved: 0, sold: 0 };
      const u = Number(it.units) || 0;
      if (d.kind === "estimate" && d.status === "accepted") e.reserved += u;
      else if (d.kind === "invoice") e.sold += u;
      else if (d.kind === "creditnote") e.sold -= u;
      perProject.set(key, e);
    }
  }
  const allocation = [...perProject.entries()]
    .map(([projectId, e]) => ({ projectId, ...e, reservedNet: Math.max(0, e.reserved - e.sold) }))
    .filter((e) => e.reservedNet > 0 || e.sold !== 0)
    .sort((a, b) => b.reservedNet + b.sold - (a.reservedNet + a.sold));
  const totReserved = allocation.reduce((s, e) => s + e.reservedNet, 0);
  const totSold = allocation.reduce((s, e) => s + e.sold, 0);
  const unit = product.unit ?? "";

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

      {allocation.length > 0 && (
        <Card className="mb-4 max-w-2xl overflow-hidden">
          <CardHeader>
            <CardTitle>Per project — gereserveerd / verkocht</CardTitle>
            <span className="text-xs text-muted">
              {totReserved > 0 && (
                <span className="font-medium text-warning">{totReserved} {unit} gereserveerd</span>
              )}
              {totReserved > 0 && totSold !== 0 ? " · " : ""}
              {totSold !== 0 && (
                <span className="font-medium text-success">{totSold} {unit} verkocht</span>
              )}
            </span>
          </CardHeader>
          <Table>
            <THead>
              <Tr>
                <Th>Project</Th>
                <Th className="text-right">Gereserveerd</Th>
                <Th className="text-right">Verkocht</Th>
              </Tr>
            </THead>
            <TBody>
              {allocation.map((e) => (
                <Tr key={e.projectId}>
                  <Td className="font-medium">
                    {e.projectId === "__none__" ? (
                      <span className="text-muted">{e.name}</span>
                    ) : (
                      <Link href={`/projects/${e.projectId}`} className="hover:underline">
                        {e.name}
                      </Link>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.reservedNet > 0 ? (
                      <span className="text-warning">{e.reservedNet} {unit}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.sold !== 0 ? (
                      <span className="text-success">{e.sold} {unit}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <p className="px-5 py-3 text-xs text-muted">
            Gereserveerd = uit geaccepteerde offertes; verkocht = uit facturen (− creditnota's). Voorraad nu: {product.stockQty != null ? `${Number(product.stockQty)} ${unit}` : "—"}.
          </p>
        </Card>
      )}

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
        <ConfirmSubmit
          message={`Product "${product.name}" definitief verwijderen?`}
          className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          Product verwijderen
        </ConfirmSubmit>
      </form>
    </>
  );
}
