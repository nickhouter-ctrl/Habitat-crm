import { tekst as uiTranslation } from '@/lib/i18n/server';
import { Combobox } from "@/components/combobox";
import { CostBreakdown } from "@/components/cost-breakdown";
import {
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { SizesEditor } from "@/components/sizes-editor";
import { SubmitButton } from "@/components/submit-button";
import type { Product } from "@/lib/db/schema";
import { PRODUCT_UNITS } from "@/lib/products";

export async function ProductForm({
  action,
  product,
  collections,
  categories,
  brands = [],
  variantsManaged = false,
  submitLabel = "Opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  product?: Pick<
    Product,
    | "name"
    | "sku"
    | "barcode"
    | "stockQty"
    | "stockMin"
    | "collection"
    | "category"
    | "subcategory"
    | "unit"
    | "priceEur"
    | "tradePriceEur"
    | "vatRate"
    | "purchaseCostEur"
    | "freightCostEur"
    | "transportCostEur"
    | "otherCostEur"
    | "dutyPct"
    | "targetMarginPct"
    | "description"
    | "widthMm"
    | "heightMm"
    | "lengthMm"
    | "thicknessMm"
    | "imageUrl"
    | "isActive"
    | "pushToWebsite"
    | "websiteProductId"
    | "additionalSizes"
    | "brandId"
  >;
  collections: string[];
  categories: string[];
  brands?: Array<{ id: string; name: string }>;
  /** Aan = de uitvoeringen worden beheerd in hun eigen kaart (merkproducten),
   *  en de maten hieronder zijn daar de afgeleide weergave van. */
  variantsManaged?: boolean;
  submitLabel?: string;
}) {
  const uiT = await uiTranslation();
  return (
    <Card className="max-w-4xl">
      <CardContent>
        <form action={action} className="space-y-5">
          <Field label={uiT("Naam *")} htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={product?.name ?? ""}
              required
              placeholder={uiT("bv. Magic Stone Bianco 60×60")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-5">
            <Field label={uiT("SKU / code")} htmlFor="sku">
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
            </Field>
            {brands.length > 0 && (
              <Field
                label={uiT("Merk")}
                htmlFor="brandId"
                hint={uiT("bepaalt logo, inkoopkorting en of er aannemerskorting geldt")}
              >
                <Select id="brandId" name="brandId" defaultValue={product?.brandId ?? ""}>
                  <option value="">{uiT("Eigen assortiment")}</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label={uiT("Barcode (EAN-13)")}
              htmlFor="barcode"
              hint={uiT("Leeg laten = automatisch genereren")}
              className="sm:col-span-2"
            >
              <Input
                id="barcode"
                name="barcode"
                defaultValue={product?.barcode ?? ""}
                inputMode="numeric"
              />
            </Field>
            <Field label={uiT("Voorraad")} htmlFor="stockQty" hint={uiT("huidige stand")}>
              <Input
                id="stockQty"
                name="stockQty"
                type="number"
                step="0.001"
                defaultValue={product?.stockQty ?? ""}
                className="text-right"
              />
            </Field>
            <Field label={uiT("Min. voorraad")} htmlFor="stockMin" hint={uiT("alert onder dit aantal")}>
              <Input
                id="stockMin"
                name="stockMin"
                type="number"
                step="0.001"
                min="0"
                defaultValue={product?.stockMin ?? ""}
                className="text-right"
                placeholder={uiT("leeg = geen alert")}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={uiT("Collectie")}
              hint={uiT("Bovenste indeling — bv. Wandpanelen / Badkamer / Accessoires.")}
            >
              <Combobox
                name="collection"
                allowCustom
                clearable
                defaultValue={product?.collection ?? ""}
                placeholder={uiT("bv. Wandpanelen")}
                options={collections.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field
              label={uiT("Categorie")}
              hint={uiT("Productfamilie, bv. &quot;Italian Travertine&quot;.")}
            >
              <Combobox
                name="category"
                allowCustom
                clearable
                defaultValue={product?.category ?? ""}
                placeholder={uiT("bv. Italian Travertine")}
                options={categories.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label={uiT("Subcategorie (optioneel)")} htmlFor="subcategory">
              <Input
                id="subcategory"
                name="subcategory"
                defaultValue={product?.subcategory ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={uiT("Eenheid")} htmlFor="unit">
              <Select id="unit" name="unit" defaultValue={product?.unit ?? "stuk"}>
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={uiT("Showroom-prijs (particulier, ex. BTW)")}
              htmlFor="priceEur"
              hint={
                product?.priceEur && product?.vatRate
                  ? uiT("Incl {v0}% BTW: € {v1}", { v0: product.vatRate, v1: (Number(product.priceEur) * (1 + Number(product.vatRate) / 100)).toFixed(2) })
                  : undefined
              }
            >
              <Input
                id="priceEur"
                name="priceEur"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={product?.priceEur ?? ""}
              />
            </Field>
            <Field label={uiT("BTW %")} htmlFor="vatRate">
              <Select id="vatRate" name="vatRate" defaultValue={String(product?.vatRate ?? 21)}>
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
                <option value="0">0%</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={uiT("Aannemers-prijs (B2B, ex. BTW)")}
              htmlFor="tradePriceEur"
              hint={
                product?.tradePriceEur && product?.vatRate
                  ? uiT("Incl {v0}% BTW: € {v1} · leeg = automatisch 20% onder de verkoopprijs", { v0: product.vatRate, v1: (Number(product.tradePriceEur) * (1 + Number(product.vatRate) / 100)).toFixed(2) })
                  : uiT("Leeg = automatisch 20% onder de verkoopprijs (showroom × 0,80)")
              }
              className="sm:col-span-2"
            >
              <Input
                id="tradePriceEur"
                name="tradePriceEur"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={product?.tradePriceEur ?? ""}
                placeholder={uiT("bv. 20.6198")}
              />
            </Field>
          </div>

          <CostBreakdown initial={product} />

          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              {uiT("Afmetingen (mm) — synced naar de website")} </legend>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label={uiT("Breedte")} htmlFor="widthMm">
                <Input
                  id="widthMm"
                  name="widthMm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={product?.widthMm ?? ""}
                  className="text-right"
                />
              </Field>
              <Field label={uiT("Hoogte")} htmlFor="heightMm">
                <Input
                  id="heightMm"
                  name="heightMm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={product?.heightMm ?? ""}
                  className="text-right"
                />
              </Field>
              <Field label={uiT("Lengte")} htmlFor="lengthMm">
                <Input
                  id="lengthMm"
                  name="lengthMm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={product?.lengthMm ?? ""}
                  className="text-right"
                />
              </Field>
              <Field label={uiT("Dikte")} htmlFor="thicknessMm">
                <Input
                  id="thicknessMm"
                  name="thicknessMm"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={product?.thicknessMm ?? ""}
                  className="text-right"
                />
              </Field>
            </div>
          </fieldset>

          {variantsManaged ? (
            <Field
              label={uiT("Beschikbare maten")}
              hint={uiT("dit product heeft uitvoeringen; die beheer je in de kaart hieronder")}
            >
              <ul className="rounded-lg border border-border px-3 py-2 text-sm text-muted">
                {(product?.additionalSizes ?? []).slice(0, 8).map((m) => (
                  <li key={m.sku} className="flex justify-between gap-3">
                    <span>{m.label}</span>
                    <span className="font-mono text-xs">{m.sku}</span>
                  </li>
                ))}
                {(product?.additionalSizes?.length ?? 0) > 8 && (
                  <li className="pt-1 text-xs">{uiT("en nog")} {(product?.additionalSizes?.length ?? 0) - 8}…</li>
                )}
                {!product?.additionalSizes?.length && <li>{uiT("nog geen uitvoeringen")}</li>}
              </ul>
            </Field>
          ) : (
            <Field
              label={uiT("Beschikbare maten")}
              htmlFor="additionalSizes"
              hint={uiT("Per maat: afmeting, eigen SKU, prijs (ex. BTW) en of die maat op voorraad is. Kiesbaar bij offertes/bestellen.")}
            >
              <SizesEditor initial={product?.additionalSizes ?? null} />
            </Field>
          )}

          <Field
            label={uiT("Omschrijving")}
            htmlFor="description"
            hint={uiT("Wordt automatisch vertaald naar NL/DE/EN/ES bij het pushen naar de website.")}
          >
            <Textarea id="description" name="description" defaultValue={product?.description ?? ""} />
          </Field>

          <Field label={uiT("Afbeelding-URL (optioneel)")} htmlFor="imageUrl">
            <Input
              id="imageUrl"
              name="imageUrl"
              type="url"
              defaultValue={product?.imageUrl ?? ""}
              placeholder="https://…"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={product?.isActive ?? true}
              className="size-4 rounded border-border"
            />
            {uiT("Actief (verschijnt in de productkeuze bij offertes/facturen)")} </label>

          <div className="rounded-md border border-border p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="pushToWebsite"
                defaultChecked={product?.pushToWebsite ?? false}
                className="size-4 rounded border-border"
              />
              {uiT("Op de website tonen (habitat-one)")} </label>
            <p className="mt-1 text-xs text-muted">
              {product?.websiteProductId
                ? uiT("Staat al op de website (id {v0}). Bestaande gegevens worden bij elke sync bijgewerkt.", { v0: product.websiteProductId })
                : product?.pushToWebsite
                  ? uiT("Klaargezet om gepubliceerd te worden — wordt aangemaakt zodra je de sync draait.")
                  : uiT("Niet zichtbaar op de website.")}
            </p>
          </div>

          <div className="pt-1">
            <SubmitButton pendingLabel={uiT("Opslaan…")}>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
