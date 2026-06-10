"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Size = { sku: string; label: string; priceEur?: number | null; inStock?: boolean };

/**
 * Bewerkt de beschikbare maten van een product (products.additionalSizes).
 * Per maat: afmeting, eigen SKU, prijs (ex. BTW) en of die maat op voorraad is.
 * Serialiseert naar een hidden input "additionalSizes" (JSON) voor de server action.
 */
export function SizesEditor({ initial }: { initial?: Size[] | null }) {
  const [rows, setRows] = useState<Size[]>(
    (initial ?? []).map((s) => ({
      sku: s.sku ?? "",
      label: s.label ?? "",
      priceEur: s.priceEur ?? null,
      inStock: !!s.inStock,
    })),
  );

  function update(i: number, patch: Partial<Size>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }
  function add() {
    setRows((r) => [...r, { sku: "", label: "", priceEur: null, inStock: false }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, j) => j !== i));
  }

  // Lege rijen (zonder afmeting) niet meesturen.
  const clean = rows.filter((r) => r.label.trim() || r.sku.trim());

  return (
    <div className="space-y-2">
      <input type="hidden" name="additionalSizes" value={JSON.stringify(clean)} />
      {rows.length > 0 && (
        <div className="grid grid-cols-[1.3fr_1.3fr_1fr_auto_auto] items-center gap-2 px-1 text-[11px] font-medium text-muted">
          <span>Afmeting</span>
          <span>SKU</span>
          <span>Prijs € (ex.)</span>
          <span>Voorraad</span>
          <span></span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1.3fr_1.3fr_1fr_auto_auto] items-center gap-2">
          <input
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="1200×600"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
          <input
            value={row.sku}
            onChange={(e) => update(i, { sku: e.target.value })}
            placeholder="MS-200-1"
            className="h-9 rounded-md border border-border bg-background px-2 font-mono text-xs"
          />
          <input
            value={row.priceEur ?? ""}
            onChange={(e) =>
              update(i, { priceEur: e.target.value === "" ? null : Number(e.target.value) })
            }
            type="number"
            step="0.01"
            min={0}
            placeholder="—"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
          <label className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={!!row.inStock}
              onChange={(e) => update(i, { inStock: e.target.checked })}
              className="size-4 rounded border-border"
            />
          </label>
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-md p-1.5 text-muted hover:bg-muted/50 hover:text-danger"
            title="Verwijderen"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted hover:bg-muted/40"
      >
        <Plus className="size-3.5" /> Maat toevoegen
      </button>
    </div>
  );
}
