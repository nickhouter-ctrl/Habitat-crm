"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, Input, Select } from "@/components/ui";
import type { ProductOption } from "@/app/(app)/_options";
import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet } from "@/lib/documents";
import { LINE_CATEGORIES, vatForCategory } from "@/lib/products";
import { cn, formatEUR } from "@/lib/utils";

type Row = {
  name: string;
  description: string;
  units: string;
  price: string;
  taxRate: string;
  category: string;
  productId: string;
};

function emptyRow(category = "materiaal"): Row {
  return {
    name: "",
    description: "",
    units: "1",
    price: "",
    taxRate: String(vatForCategory(category)),
    category,
    productId: "",
  };
}

function rowsToItems(rows: Row[]): DocumentLineItem[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      description: r.description.trim() || undefined,
      units: Number(r.units) || 0,
      price: Number(r.price) || 0,
      taxRate: Number(r.taxRate) || 0,
      category: r.category || undefined,
      productId: r.productId || undefined,
    }))
    .filter((r) => r.name.length > 0);
}

export function LineItemsEditor({
  name = "items",
  initialItems,
  products = [],
}: {
  name?: string;
  initialItems?: DocumentLineItem[] | null;
  products?: ProductOption[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((it) => ({
          name: it.name,
          description: it.description ?? "",
          units: String(it.units),
          price: String(it.price),
          taxRate: String(it.taxRate ?? 21),
          category: it.category ?? "materiaal",
          productId: it.productId ?? "",
        }))
      : [emptyRow()],
  );

  const totals = computeTotals(rowsToItems(rows));

  const productOptions: ComboOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    group: p.category?.trim() || "Overig",
    hint: p.priceEur ? formatEUR(p.priceEur) : undefined,
  }));

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const addFromProduct = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const row: Row = {
      name: p.name,
      description: p.category ? p.category : "",
      units: "1",
      price: p.priceEur ?? "",
      taxRate: String(p.vatRate ?? 21),
      category: "materiaal",
      productId: p.id,
    };
    // Replace a single empty starter row, otherwise append.
    setRows((rs) =>
      rs.length === 1 && !rs[0].name.trim() && !rs[0].productId ? [row] : [...rs, row],
    );
  };

  const setCategory = (i: number, category: string) => {
    // Auto-fill the VAT for the chosen category (still editable afterwards).
    patchRow(i, { category, taxRate: String(vatForCategory(category)) });
  };

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          rows.map((r) => ({
            name: r.name.trim(),
            description: r.description.trim(),
            units: Number(r.units),
            price: Number(r.price),
            taxRate: Number(r.taxRate),
            category: r.category,
            productId: r.productId,
          })),
        )}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-sm font-semibold">Regels</h3>
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <div className="w-64">
              <Combobox
                resetOnSelect
                placeholder="+ product uit catalogus…"
                options={productOptions}
                onSelect={(v) => v && addFromProduct(v)}
                emptyText="Geen producten — voeg ze toe onder Producten"
              />
            </div>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Lege regel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-1 py-1.5">Omschrijving</th>
              <th className="w-40 px-1 py-1.5">Categorie</th>
              <th className="w-20 px-1 py-1.5 text-right">Aantal</th>
              <th className="w-28 px-1 py-1.5 text-right">Prijs (ex.)</th>
              <th className="w-16 px-1 py-1.5 text-right">BTW%</th>
              <th className="w-28 px-1 py-1.5 text-right">Netto</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-1 py-2">
                  <Input
                    value={r.name}
                    onChange={(e) => patchRow(i, { name: e.target.value, productId: "" })}
                    placeholder="Artikel of werkzaamheid"
                    className="mb-1"
                  />
                  <Input
                    value={r.description}
                    onChange={(e) => patchRow(i, { description: e.target.value })}
                    placeholder="Extra omschrijving (optioneel)"
                    className="text-xs"
                  />
                </td>
                <td className="px-1 py-2">
                  <Select
                    value={r.category}
                    onChange={(e) => setCategory(i, e.target.value)}
                  >
                    {LINE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label} ({c.vat}%)
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-1 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.units}
                    onChange={(e) => patchRow(i, { units: e.target.value })}
                    className="text-right"
                  />
                </td>
                <td className="px-1 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.price}
                    onChange={(e) => patchRow(i, { price: e.target.value })}
                    className="text-right"
                  />
                </td>
                <td className="px-1 py-2">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={r.taxRate}
                    onChange={(e) => patchRow(i, { taxRate: e.target.value })}
                    className="text-right"
                  />
                </td>
                <td className="px-1 py-2 text-right tabular-nums">
                  {formatEUR(
                    lineNet({ units: Number(r.units) || 0, price: Number(r.price) || 0 }),
                  )}
                </td>
                <td className="px-1 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title="Regel verwijderen"
                    className={cn(
                      "rounded p-1 text-muted transition-colors hover:bg-background hover:text-danger",
                      rows.length <= 1 && "invisible",
                    )}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Subtotaal</span>
          <span className="tabular-nums">{formatEUR(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">BTW</span>
          <span className="tabular-nums">{formatEUR(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Totaal</span>
          <span className="tabular-nums">{formatEUR(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
