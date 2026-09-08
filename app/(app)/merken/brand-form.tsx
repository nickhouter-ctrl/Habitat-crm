import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Brand } from "@/lib/db/schema";

/**
 * Formulier voor een merk. Gedeeld door "nieuw" en "bewerken", zoals de andere
 * modules dat ook doen (zie components/product-form.tsx).
 */
export function BrandForm({
  brand,
  action,
  submitLabel,
}: {
  brand?: Brand;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const getal = (v: string | null | undefined) => (v == null ? "" : String(Number(v)));

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Naam" className="sm:col-span-2">
        <Input name="name" defaultValue={brand?.name ?? ""} required maxLength={120} placeholder="BRAUER" />
      </Field>

      <Field label="Productcode-voorvoegsel" hint="komt vóór de code van de leverancier, bv. BRA">
        <Input name="skuPrefix" defaultValue={brand?.skuPrefix ?? ""} maxLength={10} placeholder="BRA" />
      </Field>

      <Field label="Naam op inkoopfacturen" hint="waarmee facturen van dit merk herkend worden">
        <Input name="supplierName" defaultValue={brand?.supplierName ?? ""} maxLength={200} />
      </Field>

      <Field label="Inkoopkorting (%)" hint="onze dealerkorting op de adviesprijs">
        <Input
          name="dealerDiscountPct"
          defaultValue={getal(brand?.dealerDiscountPct)}
          inputMode="decimal"
          placeholder="42"
          className="text-right"
        />
      </Field>

      <Field
        label="Aannemerskorting (%)"
        hint="leeg = geen korting voor aannemers, en dus geen automatische −20%"
      >
        <Input
          name="tradeDiscountPct"
          defaultValue={getal(brand?.tradeDiscountPct)}
          inputMode="decimal"
          placeholder="leeg laten"
          className="text-right"
        />
      </Field>

      <Field label="Website">
        <Input name="websiteUrl" type="url" defaultValue={brand?.websiteUrl ?? ""} placeholder="https://" />
      </Field>

      <Field label="Btw-tarief (%)">
        <Input
          name="defaultVatRate"
          defaultValue={brand?.defaultVatRate ?? 21}
          inputMode="numeric"
          className="text-right"
        />
      </Field>

      <Field label="Notitie" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={brand?.notes ?? ""} maxLength={2000} rows={3} />
      </Field>

      <Field label="Actief" className="sm:col-span-2">
        <Select name="isActive" defaultValue={brand ? String(brand.isActive) : "true"}>
          <option value="true">Ja — kiesbaar bij producten</option>
          <option value="false">Nee</option>
        </Select>
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton variant="primary" pendingLabel="Bezig…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
