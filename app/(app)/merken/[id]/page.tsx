import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";

import { deleteBrand, removeBrandLogo, updateBrand, uploadBrandLogoAction } from "../actions";
import { BrandForm } from "../brand-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const merk = await db.query.brands.findFirst({ where: eq(brands.id, id), columns: { name: true } });
  return { title: merk?.name ?? "Merk" };
}

export default async function MerkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const merk = await db.query.brands.findFirst({ where: eq(brands.id, id) });
  if (!merk) notFound();

  const [{ aantalProducten }] = await db
    .select({ aantalProducten: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.brandId, id));
  const [{ aantalUitvoeringen }] = await db
    .select({ aantalUitvoeringen: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(eq(productVariants.brandId, id));

  const recent = await db
    .select({ id: products.id, name: products.name, sku: products.sku, category: products.category })
    .from(products)
    .where(eq(products.brandId, id))
    .orderBy(asc(products.name))
    .limit(12);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {merk.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={merk.logoUrl} alt="" className="h-7 w-auto max-w-40 object-contain" />
            ) : null}
            {merk.name}
          </span>
        }
        subtitle={`${aantalProducten} producten · ${aantalUitvoeringen} uitvoeringen`}
        actions={
          <LinkButton href="/merken" variant="ghost">
            ← Merken
          </LinkButton>
        }
      />

      {sp.saved && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Opgeslagen.</p>}
      {sp.error === "upload" && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          Het logo is niet opgeslagen. Gebruik SVG, PNG, JPG of WebP, maximaal 25 MB.
        </p>
      )}
      {sp.error === "inuse" && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          Dit merk kan niet weg: er hangen nog {aantalProducten} producten aan. Koppel die eerst los.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Gegevens</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandForm brand={merk} action={updateBrand.bind(null, id)} submitLabel="Opslaan" />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <span className="text-xs text-muted">verschijnt bij de producten van dit merk</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {merk.logoUrl ? (
                <div className="flex items-center justify-center rounded-md border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={merk.logoUrl} alt={merk.name} className="h-12 w-auto max-w-full object-contain" />
                </div>
              ) : (
                <p className="text-sm text-muted">Nog geen logo.</p>
              )}
              <form action={uploadBrandLogoAction.bind(null, id)} className="space-y-2">
                <Input type="file" name="logo" accept="image/svg+xml,image/png,image/jpeg,image/webp,image/avif" required />
                <SubmitButton variant="secondary" size="sm" pendingLabel="Bezig…">
                  {merk.logoUrl ? "Logo vervangen" : "Logo uploaden"}
                </SubmitButton>
              </form>
              {merk.logoUrl && (
                <form action={removeBrandLogo.bind(null, id)}>
                  <ConfirmSubmit
                    message="Logo verwijderen?"
                    className="text-sm text-muted underline underline-offset-2 hover:text-ink"
                  >
                    Logo verwijderen
                  </ConfirmSubmit>
                </form>
              )}
            </CardContent>
          </Card>

          {recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Producten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {recent.map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`/products/${p.id}/edit`} className="truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{p.sku ?? p.category ?? ""}</span>
                  </div>
                ))}
                {aantalProducten > recent.length && (
                  <Link
                    href={`/products?merk=${id}`}
                    className="block pt-1 text-xs text-muted underline underline-offset-2"
                  >
                    alle {aantalProducten} producten
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-5">
              <form action={deleteBrand.bind(null, id)}>
                <ConfirmSubmit
                  message={`Merk ${merk.name} verwijderen?`}
                  className="rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  Merk verwijderen
                </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
