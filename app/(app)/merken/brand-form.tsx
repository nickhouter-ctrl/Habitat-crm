import { tekst as uiTranslation } from '@/lib/i18n/server';
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Brand } from "@/lib/db/schema";

/**
 * Formulier voor een merk. Gedeeld door "nieuw" en "bewerken", zoals de andere
 * modules dat ook doen (zie components/product-form.tsx).
 */
export async function BrandForm({
  brand,
  action,
  submitLabel,
}: {
  brand?: Brand;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const uiT = await uiTranslation();
  const getal = (v: string | null | undefined) => (v == null ? "" : String(Number(v)));

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label={uiT("Naam")} className="sm:col-span-2">
        <Input name="name" defaultValue={brand?.name ?? ""} required maxLength={120} placeholder={uiT("BRAUER")} />
      </Field>

      <Field label={uiT("Productcode-voorvoegsel")} hint={uiT("komt vóór de code van de leverancier, bv. BRA")}>
        <Input name="skuPrefix" defaultValue={brand?.skuPrefix ?? ""} maxLength={10} placeholder={uiT("BRA")} />
      </Field>

      <Field label={uiT("Naam op inkoopfacturen")} hint={uiT("waarmee facturen van dit merk herkend worden")}>
        <Input name="supplierName" defaultValue={brand?.supplierName ?? ""} maxLength={200} />
      </Field>

      <Field label={uiT("Inkoopkorting (%)")} hint={uiT("onze dealerkorting op de adviesprijs")}>
        <Input
          name="dealerDiscountPct"
          defaultValue={getal(brand?.dealerDiscountPct)}
          inputMode="decimal"
          placeholder="42"
          className="text-right"
        />
      </Field>

      <Field
        label={uiT("Aannemerskorting (%)")}
        hint={uiT("leeg = geen korting voor aannemers, en dus geen automatische −20%")}
      >
        <Input
          name="tradeDiscountPct"
          defaultValue={getal(brand?.tradeDiscountPct)}
          inputMode="decimal"
          placeholder={uiT("leeg laten")}
          className="text-right"
        />
      </Field>

      <Field label={uiT("Website")}>
        <Input name="websiteUrl" type="url" defaultValue={brand?.websiteUrl ?? ""} placeholder="https://" />
      </Field>

      <Field label={uiT("Btw-tarief (%)")}>
        <Input
          name="defaultVatRate"
          defaultValue={brand?.defaultVatRate ?? 21}
          inputMode="numeric"
          className="text-right"
        />
      </Field>

      <Field label={uiT("Notitie")} className="sm:col-span-2">
        <Textarea name="notes" defaultValue={brand?.notes ?? ""} maxLength={2000} rows={3} />
      </Field>

      <Field
        label={uiT("Voorraad")}
        className="sm:col-span-2"
        hint={uiT("Bepaalt of een offerte om voorraad zeurt of om een bestelling vraagt")}
      >
        <Select name="orderOnDemand" defaultValue={brand ? String(brand.orderOnDemand) : "false"}>
          <option value="false">{uiT("Wij houden dit merk op voorraad")}</option>
          <option value="true">{uiT("Wordt per order besteld — geen voorraad")}</option>
        </Select>
      </Field>

      <Field label={uiT("Actief")} className="sm:col-span-2">
        <Select name="isActive" defaultValue={brand ? String(brand.isActive) : "true"}>
          <option value="true">{uiT("Ja — kiesbaar bij producten")}</option>
          <option value="false">{uiT("Nee")}</option>
        </Select>
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton variant="primary" pendingLabel={uiT("Bezig…")}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
