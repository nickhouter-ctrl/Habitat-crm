import { asc, sql } from "drizzle-orm";
import { Trash2 } from "lucide-react";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/db";
import { catalogCollections, catalogProducts } from "@/lib/db/schema";
import {
  createCatalogProduct,
  createCollection,
  createVariant,
  deleteCatalogProduct,
  deleteCollection,
} from "../actions";

export const metadata = { title: "Catalogus — beheer" };
export const dynamic = "force-dynamic";

export default async function CatalogManagePage() {
  const collections = await db
    .select()
    .from(catalogCollections)
    .orderBy(asc(catalogCollections.sortOrder), asc(catalogCollections.nameEn));

  const productRows = await db
    .select({
      id: catalogProducts.id,
      nameEn: catalogProducts.nameEn,
      collectionId: catalogProducts.collectionId,
      variants: sql<number>`(select count(*)::int from catalog_variants v where v.product_id = ${catalogProducts.id})`,
    })
    .from(catalogProducts)
    .orderBy(asc(catalogProducts.nameEn));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogus — beheer"
        subtitle="Collecties, producten en kleuren (varianten) beheren."
        actions={<LinkButton href="/samplecatalogus" variant="secondary">← Terug</LinkButton>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* nieuwe collectie */}
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe collectie (serie)</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCollection} className="space-y-3">
              <Field name="nameEn" label="Naam (EN)" required placeholder="3D Big Panel Series" />
              <Field name="nameCn" label="Naam (CN)" />
              <Field name="sortOrder" label="Sortering" placeholder="0" />
              <SubmitButton size="sm">Toevoegen</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {/* nieuw product */}
        <Card>
          <CardHeader>
            <CardTitle>Nieuw product (item)</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCatalogProduct} className="space-y-3">
              <SelectField name="collectionId" label="Collectie" options={collections} />
              <Field name="nameEn" label="Naam (EN)" required placeholder="Travertine" />
              <Field name="nameCn" label="Naam (CN)" />
              <Field name="sortOrder" label="Sortering" placeholder="0" />
              <SubmitButton size="sm">Toevoegen</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {/* nieuwe variant */}
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe kleur (variant)</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createVariant} className="space-y-3">
              <SelectField
                name="productId"
                label="Product"
                options={productRows.map((p) => ({ id: p.id, nameEn: p.nameEn }))}
              />
              <Field name="colorNameEn" label="Kleur (EN)" required placeholder="Pure White" />
              <Field name="colorNameCn" label="Kleur (CN)" />
              <Field name="imageUrl" label="Foto-URL" />
              <p className="text-xs text-muted">SKU wordt automatisch toegekend (MS-###).</p>
              <SubmitButton size="sm">Toevoegen</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* overzicht collecties → producten */}
      <div className="space-y-4">
        {collections.map((c) => {
          const prods = productRows.filter((p) => p.collectionId === c.id);
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {c.nameEn}
                  {c.nameCn ? <span className="ml-2 text-sm text-muted">{c.nameCn}</span> : null}
                </CardTitle>
                <form action={deleteCollection}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit
                    className={buttonClass({ variant: "ghost", size: "sm" })}
                    message={`Collectie "${c.nameEn}" en alle producten/varianten erin verwijderen?`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmSubmit>
                </form>
              </CardHeader>
              <CardContent>
                {prods.length === 0 ? (
                  <p className="text-sm text-muted">Nog geen producten.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {prods.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2">
                        <span className="text-sm">
                          {p.nameEn}{" "}
                          <span className="text-xs text-muted">({p.variants} kleuren)</span>
                        </span>
                        <form action={deleteCatalogProduct}>
                          <input type="hidden" name="id" value={p.id} />
                          <ConfirmSubmit
                            className={buttonClass({ variant: "ghost", size: "sm" })}
                            message={`Product "${p.nameEn}" verwijderen?`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </ConfirmSubmit>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <Input name={name} required={required} placeholder={placeholder} />
    </label>
  );
}

function SelectField({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: { id: string; nameEn: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select
        name={name}
        required
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">— kies —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nameEn}
          </option>
        ))}
      </select>
    </label>
  );
}
