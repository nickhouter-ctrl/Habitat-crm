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
    | "imageUrl"
    | "isActive"
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

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="SKU / code" htmlFor="sku">
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
            </Field>
            <Field
              label="Barcode (EAN-13)"
              htmlFor="barcode"
              hint="Leeg laten = automatisch genereren"
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

          <Field label="Omschrijving" htmlFor="description">
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

          <div className="pt-1">
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
