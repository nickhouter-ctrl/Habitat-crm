import { Combobox } from "@/components/combobox";
import { CostBreakdown } from "@/components/cost-breakdown";
import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { Product } from "@/lib/db/schema";
import { PRODUCT_UNITS } from "@/lib/products";

export function ProductForm({
  action,
  product,
  collections,
  categories,
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
    | "additionalSizes"
    | "imageUrl"
    | "isActive"
    | "pushToWebsite"
    | "websiteProductId"
  >;
  collections: string[];
  categories: string[];
  submitLabel?: string;
}) {
  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form action={action} className="space-y-5">
          <Field label="Naam *" htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={product?.name ?? ""}
              required
              placeholder="bv. Magic Stone Bianco 60×60"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-5">
            <Field label="SKU / code" htmlFor="sku">
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
            </Field>
            <Field
              label="Barcode (EAN-13)"
              htmlFor="barcode"
              hint="Leeg laten = automatisch genereren"
              className="sm:col-span-2"
            >
              <Input
                id="barcode"
                name="barcode"
                defaultValue={product?.barcode ?? ""}
                inputMode="numeric"
              />
            </Field>
            <Field label="Voorraad" htmlFor="stockQty" hint="huidige stand">
              <Input
                id="stockQty"
                name="stockQty"
                type="number"
                step="0.001"
                defaultValue={product?.stockQty ?? ""}
                className="text-right"
              />
            </Field>
            <Field label="Min. voorraad" htmlFor="stockMin" hint="alert onder dit aantal">
              <Input
                id="stockMin"
                name="stockMin"
                type="number"
                step="0.001"
                min="0"
                defaultValue={product?.stockMin ?? ""}
                className="text-right"
                placeholder="leeg = geen alert"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Collectie"
              hint="Bovenste indeling — bv. Wandpanelen / Badkamer / Accessoires."
            >
              <Combobox
                name="collection"
                allowCustom
                clearable
                defaultValue={product?.collection ?? ""}
                placeholder="bv. Wandpanelen"
                options={collections.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field
              label="Categorie"
              hint="Productfamilie, bv. &quot;Italian Travertine&quot;."
            >
              <Combobox
                name="category"
                allowCustom
                clearable
                defaultValue={product?.category ?? ""}
                placeholder="bv. Italian Travertine"
                options={categories.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="Subcategorie (optioneel)" htmlFor="subcategory">
              <Input
                id="subcategory"
                name="subcategory"
                defaultValue={product?.subcategory ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Eenheid" htmlFor="unit">
              <Select id="unit" name="unit" defaultValue={product?.unit ?? "stuk"}>
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Verkoopprijs €/eenh. (ex. BTW)" htmlFor="priceEur">
              <Input
                id="priceEur"
                name="priceEur"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product?.priceEur ?? ""}
              />
            </Field>
            <Field label="BTW %" htmlFor="vatRate">
              <Select id="vatRate" name="vatRate" defaultValue={String(product?.vatRate ?? 21)}>
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
                <option value="0">0%</option>
              </Select>
            </Field>
          </div>

          <CostBreakdown initial={product} />

          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              Afmetingen (mm) — synced naar de website
            </legend>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Breedte" htmlFor="widthMm">
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
              <Field label="Hoogte" htmlFor="heightMm">
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
              <Field label="Lengte" htmlFor="lengthMm">
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
              <Field label="Dikte" htmlFor="thicknessMm">
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
            <Field
              label="Beschikbare maten (optioneel)"
              htmlFor="additionalSizes"
              hint="Eén maat per regel — bv. '2400 × 1190 mm'. Toont op de site als 'ook leverbaar in'."
            >
              <Textarea
                id="additionalSizes"
                name="additionalSizes"
                rows={3}
                defaultValue={(product?.additionalSizes ?? []).join("\n")}
                placeholder={"2400 × 590 mm\n1200 × 190 mm"}
              />
            </Field>
          </fieldset>

          <Field
            label="Omschrijving"
            htmlFor="description"
            hint="Wordt automatisch vertaald naar NL/DE/EN/ES bij het pushen naar de website."
          >
            <Textarea id="description" name="description" defaultValue={product?.description ?? ""} />
          </Field>

          <Field label="Afbeelding-URL (optioneel)" htmlFor="imageUrl">
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
            Actief (verschijnt in de productkeuze bij offertes/facturen)
          </label>

          <div className="rounded-md border border-border p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="pushToWebsite"
                defaultChecked={product?.pushToWebsite ?? false}
                className="size-4 rounded border-border"
              />
              Op de website tonen (habitat-one)
            </label>
            <p className="mt-1 text-xs text-muted">
              {product?.websiteProductId
                ? `Staat al op de website (id ${product.websiteProductId}). Bestaande gegevens worden bij elke sync bijgewerkt.`
                : product?.pushToWebsite
                  ? "Klaargezet om gepubliceerd te worden — wordt aangemaakt zodra je de sync draait."
                  : "Niet zichtbaar op de website."}
            </p>
          </div>

          <div className="pt-1">
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
