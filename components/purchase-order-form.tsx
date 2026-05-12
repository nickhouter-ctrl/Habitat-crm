"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { PurchaseOrder, PurchaseOrderLineItem } from "@/lib/db/schema";
import { formatMoney, poLineTotal, PO_STATUS_META } from "@/lib/purchase-orders";
import { cn } from "@/lib/utils";

export type POProductOption = { id: string; name: string; sku: string | null };

type Row = {
  productId: string;
  name: string;
  sku: string;
  units: string;
  unitPrice: string;
  note: string;
};

function toRow(it: Partial<PurchaseOrderLineItem>): Row {
  return {
    productId: it.productId ?? "",
    name: it.name ?? "",
    sku: it.sku ?? "",
    units: it.units != null ? String(it.units) : "1",
    unitPrice: it.unitPrice != null ? String(it.unitPrice) : "",
    note: it.note ?? "",
  };
}

function rowsToItems(rows: Row[]): PurchaseOrderLineItem[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      sku: r.sku.trim() || undefined,
      productId: r.productId || undefined,
      units: Number(r.units) || 0,
      unitPrice: Number(r.unitPrice) || 0,
      note: r.note.trim() || undefined,
    }))
    .filter((r) => r.name.length > 0 || r.units !== 0);
}

const CURRENCIES = ["EUR", "USD", "GBP", "CNY"];

export function PurchaseOrderForm({
  order,
  products,
  action,
}: {
  order?: PurchaseOrder;
  products: POProductOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(
    order?.items?.length ? order.items.map(toRow) : [toRow({})],
  );
  const [currency, setCurrency] = useState(order?.currency ?? "EUR");

  const productOptions = useMemo<ComboOption[]>(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.sku ? `${p.name} · ${p.sku}` : p.name,
        hint: p.sku ?? undefined,
      })),
    [products],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const items = rowsToItems(rows);
  const total = items.reduce((s, it) => s + poLineTotal(it), 0);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leverancier" htmlFor="supplier">
          <Input
            id="supplier"
            name="supplier"
            required
            defaultValue={order?.supplier ?? ""}
            placeholder="KingKonree International (H.K) Limited"
          />
        </Field>
        <Field label="Referentie / PI-nummer" htmlFor="reference">
          <Input
            id="reference"
            name="reference"
            defaultValue={order?.reference ?? ""}
            placeholder="33#kkr20251126xm"
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={order?.status ?? "ordered"}>
            {Object.entries(PO_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valuta" htmlFor="currency">
          <Select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Besteldatum" htmlFor="orderDate">
          <Input
            id="orderDate"
            name="orderDate"
            type="date"
            defaultValue={order?.orderDate ?? ""}
          />
        </Field>
        <Field label="Verwacht binnen" htmlFor="expectedDate">
          <Input
            id="expectedDate"
            name="expectedDate"
            type="date"
            defaultValue={order?.expectedDate ?? ""}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Regels</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows((rs) => [...rs, toRow({})])}
          >
            <Plus className="size-4" /> Regel
          </Button>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const lineTotal = (Number(r.units) || 0) * (Number(r.unitPrice) || 0);
            return (
              <div
                key={i}
                className="grid items-start gap-2 rounded-md border bg-surface/40 p-2 sm:grid-cols-[1fr_1fr_5rem_7rem_2.25rem]"
              >
                <div className="space-y-1">
                  <Combobox
                    options={productOptions}
                    defaultValue={r.productId}
                    placeholder="Koppel product (optioneel)…"
                    clearable
                    emptyText="Geen product"
                    onSelect={(v) => {
                      const p = v ? productById.get(v) : undefined;
                      update(i, {
                        productId: v ?? "",
                        ...(p ? { name: r.name || p.name, sku: r.sku || (p.sku ?? "") } : {}),
                      });
                    }}
                  />
                  <Input
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Omschrijving"
                  />
                </div>
                <div className="space-y-1">
                  <Input
                    value={r.sku}
                    onChange={(e) => update(i, { sku: e.target.value })}
                    placeholder="SKU"
                  />
                  <Input
                    value={r.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    placeholder="Notitie (kleur, maat…)"
                  />
                </div>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={r.units}
                  onChange={(e) => update(i, { units: e.target.value })}
                  placeholder="Aantal"
                  className="text-right"
                />
                <div className="space-y-1">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={r.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                    placeholder="Stukprijs"
                    className="text-right"
                  />
                  <div className="px-1 text-right text-xs text-muted tabular-nums">
                    {formatMoney(lineTotal, currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                  className={cn(
                    "mt-0.5 flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger",
                  )}
                  aria-label="Regel verwijderen"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end text-sm">
          <span className="text-muted">Totaal:&nbsp;</span>
          <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>

      <Field label="Notities" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={order?.notes ?? ""}
          placeholder="Levertijd, aanbetaling, opmerkingen…"
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit">{order ? "Opslaan" : "Bestelling aanmaken"}</Button>
      </div>
    </form>
  );
}
