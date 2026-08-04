"use client";

/**
 * Meerdere producten tegelijk op een project boeken.
 *
 * Eén regel per keer werkte, maar bij een villa gaan er twintig posten naar de
 * werf en dan is twintig keer opnieuw zoeken-invullen-verzenden niet te doen.
 * Regels staan hier los in het formulier; pas bij verzenden gaan ze samen naar
 * de server, die ze stuk voor stuk boekt en meldt wat er niet lukte.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui";

export type LeverProduct = { value: string; label: string; hint?: string };

export function DeliveryLinesForm({
  action,
  producten,
}: {
  action: (formData: FormData) => void | Promise<void>;
  producten: ComboOption[];
}) {
  const [regels, setRegels] = useState<number[]>([0, 1, 2]);
  const [teller, setTeller] = useState(3);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        {regels.map((r, i) => (
          <div key={r} className="grid gap-2 lg:grid-cols-[2.2fr_0.6fr_0.9fr_auto] lg:items-end">
            <Field label={i === 0 ? "Product" : "\u00a0"} hint={i === 0 ? "typ een naam of SKU" : undefined}>
              <Combobox
                name={`productId_${r}`}
                options={producten}
                placeholder="zoek product…"
                clearable
                menuClassName="w-[28rem]"
              />
            </Field>
            <Field label={i === 0 ? "Aantal" : "\u00a0"}>
              <Input name={`qty_${r}`} inputMode="decimal" className="text-right" placeholder="1" />
            </Field>
            <Field label={i === 0 ? "Verkoopprijs p/st" : "\u00a0"} hint={i === 0 ? "leeg = catalogusprijs" : undefined}>
              <Input name={`price_${r}`} inputMode="decimal" className="text-right" placeholder="—" />
            </Field>
            <button
              type="button"
              onClick={() => setRegels((rs) => (rs.length > 1 ? rs.filter((x) => x !== r) : rs))}
              className="mb-1 rounded p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30"
              disabled={regels.length === 1}
              aria-label="Regel verwijderen"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setRegels((rs) => [...rs, teller]);
          setTeller((t) => t + 1);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-background"
      >
        <Plus className="size-4" /> Regel erbij
      </button>

      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <Field label="Datum" htmlFor="lev-date">
          <Input id="lev-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Notitie" htmlFor="lev-note" className="min-w-56 flex-1">
          <Input id="lev-note" name="note" placeholder="bijv. geleverd op de werf, week 32" />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Boeken…">
          + Geleverd boeken
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">
        Lege regels worden overgeslagen. Ligt er van één product te weinig op voorraad, dan wordt alleen die regel niet
        geboekt — de rest gaat gewoon door.
      </p>
    </form>
  );
}
