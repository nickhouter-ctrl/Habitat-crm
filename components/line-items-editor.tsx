"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button, Input } from "@/components/ui";
import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet } from "@/lib/documents";
import { cn, formatEUR } from "@/lib/utils";

type Row = {
  name: string;
  description: string;
  units: string;
  price: string;
  taxRate: string;
};

function emptyRow(): Row {
  return { name: "", description: "", units: "1", price: "", taxRate: "21" };
}

function rowsToItems(rows: Row[]): DocumentLineItem[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      description: r.description.trim() || undefined,
      units: Number(r.units) || 0,
      price: Number(r.price) || 0,
      taxRate: Number(r.taxRate) || 0,
    }))
    .filter((r) => r.name.length > 0);
}

/**
 * Editable list of document line items. Serialises its state into a hidden
 * `<input name>` so a surrounding <form> picks it up; the server recomputes
 * totals from it.
 */
export function LineItemsEditor({
  name = "items",
  initialItems,
}: {
  name?: string;
  initialItems?: DocumentLineItem[] | null;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((it) => ({
          name: it.name,
          description: it.description ?? "",
          units: String(it.units),
          price: String(it.price),
          taxRate: String(it.taxRate ?? 21),
        }))
      : [emptyRow()],
  );

  const totals = computeTotals(rowsToItems(rows));

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

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
          })),
        )}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Regels</h3>
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          <Plus className="size-4" /> Regel toevoegen
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-1 py-1.5">Omschrijving</th>
              <th className="w-20 px-1 py-1.5 text-right">Aantal</th>
              <th className="w-28 px-1 py-1.5 text-right">Prijs (ex.)</th>
              <th className="w-20 px-1 py-1.5 text-right">BTW %</th>
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
                    onChange={(e) => patchRow(i, { name: e.target.value })}
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
