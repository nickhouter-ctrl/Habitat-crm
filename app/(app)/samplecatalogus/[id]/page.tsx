import { eq } from "drizzle-orm";
import { Plus, Printer, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  catalogCollections,
  catalogProducts,
  catalogVariants,
  catalogVariantSizes,
  products,
} from "@/lib/db/schema";
import { displaySku } from "@/lib/catalog";
import { formatEUR } from "@/lib/utils";
import {
  addSize,
  deleteSize,
  toggleVariantFlag,
  unmatchVariant,
  updateSize,
  updateVariantPricing,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  sample_only: "Alleen sample",
  available: "Leverbaar",
  discontinued: "Vervallen",
};

export default async function VariantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [v] = await db
    .select({
      id: catalogVariants.id,
      sku: catalogVariants.sku,
      legacySku: catalogVariants.legacySku,
      existingProductId: catalogVariants.existingProductId,
      color: catalogVariants.colorNameEn,
      colorCn: catalogVariants.colorNameCn,
      imageUrl: catalogVariants.imageUrl,
      hasSample: catalogVariants.hasSample,
      inRange: catalogVariants.inRange,
      salePrice: catalogVariants.salePrice,
      supplierPrice: catalogVariants.supplierPrice,
      currency: catalogVariants.currency,
      status: catalogVariants.status,
      notes: catalogVariants.notes,
      productId: catalogProducts.id,
      productName: catalogProducts.nameEn,
      productCn: catalogProducts.nameCn,
      collectionName: catalogCollections.nameEn,
    })
    .from(catalogVariants)
    .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
    .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
    .where(eq(catalogVariants.id, id))
    .limit(1);

  if (!v) notFound();

  const sizes = await db
    .select()
    .from(catalogVariantSizes)
    .where(eq(catalogVariantSizes.variantId, id))
    .orderBy(catalogVariantSizes.sortOrder);

  const linked = v.existingProductId
    ? await db.query.products.findFirst({
        where: eq(products.id, v.existingProductId),
        columns: { id: true, name: true, sku: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${v.productName} — ${v.color}`}
        subtitle={v.collectionName ?? undefined}
        actions={
          <div className="flex gap-2">
            <LinkButton href={`/labels/catalog/${id}`} variant="secondary">
              <Printer className="h-4 w-4" /> Label
            </LinkButton>
            <LinkButton href={`/bestellen?variant=${id}`}>
              <ShoppingCart className="h-4 w-4" /> Toevoegen aan bestelbon
            </LinkButton>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ---- foto + kerngegevens ---- */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            {v.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.imageUrl} alt={v.color} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-muted text-sm text-muted">
                Geen foto
              </div>
            )}
            <CardContent className="space-y-2 p-4 text-sm">
              <Row label="SKU">
                <span className="font-mono">{v.sku}</span>
              </Row>
              {v.legacySku && (
                <Row label="Bestaande SKU">
                  <span className="font-mono">{v.legacySku}</span>
                </Row>
              )}
              <Row label="Kleur">
                {v.color}
                {v.colorCn ? ` · ${v.colorCn}` : ""}
              </Row>
              <Row label="Status">
                <Badge tone={v.status === "available" ? "success" : "neutral"}>
                  {STATUS_LABEL[v.status] ?? v.status}
                </Badge>
              </Row>
            </CardContent>
          </Card>

          {/* vinkjes */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <FlagToggle id={id} field="hasSample" value={v.hasSample} label="Sample in huis" />
              <FlagToggle id={id} field="inRange" value={v.inRange} label="In assortiment" />
            </CardContent>
          </Card>

          {/* koppeling */}
          <Card>
            <CardHeader>
              <CardTitle>Koppeling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 text-sm">
              {linked ? (
                <>
                  <p>
                    Gekoppeld aan{" "}
                    <Link href={`/products/${linked.id}`} className="font-medium underline">
                      {linked.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted">{linked.sku}</span>
                  </p>
                  <form action={unmatchVariant}>
                    <input type="hidden" name="variantId" value={id} />
                    <SubmitButton variant="ghost" size="sm">
                      Koppeling verwijderen
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-muted">Nog niet aan een bestaand product gekoppeld.</p>
                  <LinkButton href={`/samplecatalogus/match?variant=${id}`} variant="secondary" size="sm">
                    Koppelen
                  </LinkButton>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- prijzen + maten ---- */}
        <div className="space-y-6">
          {/* variant-fallbackprijs */}
          <Card>
            <CardHeader>
              <CardTitle>Prijs (variant — fallback)</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form action={updateVariantPricing} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={id} />
                <LabeledInput name="salePrice" label="Verkoopprijs €" defaultValue={v.salePrice} />
                <LabeledInput name="supplierPrice" label="Inkoopprijs €" defaultValue={v.supplierPrice} />
                <SubmitButton size="sm">Opslaan</SubmitButton>
              </form>
              <p className="mt-2 text-xs text-muted">
                Prijs hoort bij de maat — vul bij voorkeur per maat in. Deze prijs geldt als
                fallback wanneer een maat geen eigen prijs heeft.
              </p>
            </CardContent>
          </Card>

          {/* maten met prijs per maat */}
          <Card>
            <CardHeader>
              <CardTitle>Beschikbare maten</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sizes.length === 0 ? (
                <p className="p-4 text-sm text-muted">Nog geen maten toegevoegd.</p>
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>Maat</Th>
                      <Th>Dikte</Th>
                      <Th>m²/doos</Th>
                      <Th>st/doos</Th>
                      <Th>Verkoop €</Th>
                      <Th>Inkoop €</Th>
                      <Th></Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {sizes.map((s) => (
                      <Tr key={s.id}>
                        <Td colSpan={7} className="p-0">
                          <form action={updateSize} className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr_1fr_1fr_auto] items-center gap-2 px-3 py-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="variantId" value={id} />
                            <Input name="productSize" defaultValue={s.productSize} className="h-8" />
                            <Input name="thicknessMm" defaultValue={s.thicknessMm ?? ""} className="h-8" />
                            <Input name="sqmPerBox" defaultValue={s.sqmPerBox ?? ""} className="h-8" />
                            <Input name="pcsPerBox" defaultValue={s.pcsPerBox ?? ""} className="h-8" />
                            <Input name="salePrice" defaultValue={s.salePrice ?? ""} className="h-8" />
                            <Input name="supplierPrice" defaultValue={s.supplierPrice ?? ""} className="h-8" />
                            <div className="flex gap-1">
                              <SubmitButton size="sm" variant="secondary">
                                ✓
                              </SubmitButton>
                            </div>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}

              {/* maat toevoegen */}
              <form action={addSize} className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr_1fr_1fr_auto] items-end gap-2 border-t border-border px-3 py-3">
                <input type="hidden" name="variantId" value={id} />
                <LabeledInput name="productSize" label="Maat" placeholder="1200x600" />
                <LabeledInput name="thicknessMm" label="Dikte" placeholder="2.5~3.5" />
                <LabeledInput name="sqmPerBox" label="m²/doos" />
                <LabeledInput name="pcsPerBox" label="st/doos" />
                <LabeledInput name="salePrice" label="Verkoop €" />
                <LabeledInput name="supplierPrice" label="Inkoop €" />
                <SubmitButton size="sm">
                  <Plus className="h-4 w-4" />
                </SubmitButton>
              </form>
            </CardContent>
          </Card>

          {sizes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Maat verwijderen</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 p-4">
                {sizes.map((s) => (
                  <form action={deleteSize} key={s.id}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="variantId" value={id} />
                    <ConfirmSubmit
                      className={buttonClass({ variant: "ghost", size: "sm" })}
                      message={`Maat ${s.productSize} verwijderen?`}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {s.productSize}
                    </ConfirmSubmit>
                  </form>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function LabeledInput({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <Input name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} className="h-8" />
    </label>
  );
}

function FlagToggle({
  id,
  field,
  value,
  label,
}: {
  id: string;
  field: "hasSample" | "inRange";
  value: boolean;
  label: string;
}) {
  return (
    <form action={toggleVariantFlag} className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value ? "false" : "true"} />
      <button
        type="submit"
        className={buttonClass({
          variant: value ? "primary" : "secondary",
          size: "sm",
        })}
      >
        {value ? "Aan" : "Uit"}
      </button>
    </form>
  );
}
