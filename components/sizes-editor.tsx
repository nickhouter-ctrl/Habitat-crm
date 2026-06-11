"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Size = {
  sku: string;
  label: string;
  priceEur?: number | null;
  purchaseEur?: number | null;
  costEur?: number | null;
  stockQty?: number | null;
  inStock?: boolean;
};

const numOrNull = (v: string) => (v === "" ? null : Number(v));
// Brede Afmeting-kolom zodat lange labels (bv. draairichtingen) volledig passen;
// horizontaal scrollbaar op smalle schermen i.p.v. ingedrukt.
const cols = "grid grid-cols-[minmax(180px,2.4fr)_minmax(110px,1.4fr)_1fr_1fr_1fr_0.8fr_auto] items-center gap-2 min-w-[720px]";
const cell = "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm";
const num = `${cell} text-right tabular-nums`;

/**
 * Bewerkt de beschikbare maten van een product (products.additionalSizes).
 * Per maat: afmeting, eigen SKU, inkoop-, kost- en verkoopprijs (ex. BTW) en voorraad.
 * Serialiseert naar een hidden input "additionalSizes" (JSON) voor de server action.
 */
export function SizesEditor({ initial }: { initial?: Size[] | null }) {
  const [rows, setRows] = useState<Size[]>(
    (initial ?? []).map((s) => ({
      sku: s.sku ?? "",
      label: s.label ?? "",
      priceEur: s.priceEur ?? null,
      purchaseEur: s.purchaseEur ?? null,
      costEur: s.costEur ?? null,
      stockQty: s.stockQty ?? null,
    })),
  );

  const update = (i: number, patch: Partial<Size>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const add = () =>
    setRows((r) => [
      ...r,
      { sku: "", label: "", priceEur: null, purchaseEur: null, costEur: null, stockQty: null },
    ]);
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  // Lege rijen niet meesturen; inStock afleiden uit voorraad.
  const clean = rows
    .filter((r) => r.label.trim() || r.sku.trim())
    .map((r) => ({ ...r, inStock: (r.stockQty ?? 0) > 0 }));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <input type="hidden" name="additionalSizes" value={JSON.stringify(clean)} />
      {rows.length > 0 && (
        <div className={`${cols} border-b border-border bg-background/60 px-2 py-1.5 text-[11px] font-medium text-muted`}>
          <span>Afmeting</span>
          <span>SKU</span>
          <span className="text-right">Inkoop €</span>
          <span className="text-right">Kostprijs €</span>
          <span className="text-right">Verkoop €</span>
          <span className="text-right">Voorraad</span>
          <span></span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className={`${cols} border-b border-border/40 px-2 py-1.5 last:border-b-0`}>
          <input
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="1200×600"
            className={cell}
          />
          <input
            value={row.sku}
            onChange={(e) => update(i, { sku: e.target.value })}
            placeholder="MS-200-1"
            className={`${cell} font-mono text-xs`}
          />
          <input
            value={row.purchaseEur ?? ""}
            onChange={(e) => update(i, { purchaseEur: numOrNull(e.target.value) })}
            type="number"
            step="0.01"
            min={0}
            placeholder="—"
            className={num}
          />
          <input
            value={row.costEur ?? ""}
            onChange={(e) => update(i, { costEur: numOrNull(e.target.value) })}
            type="number"
            step="0.01"
            min={0}
            placeholder="—"
            className={num}
          />
          <input
            value={row.priceEur ?? ""}
            onChange={(e) => update(i, { priceEur: numOrNull(e.target.value) })}
            type="number"
            step="0.01"
            min={0}
            placeholder="—"
            className={num}
          />
          <input
            value={row.stockQty ?? ""}
            onChange={(e) => update(i, { stockQty: numOrNull(e.target.value) })}
            type="number"
            step="1"
            min={0}
            placeholder="0"
            className={num}
          />
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
        className="m-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted hover:bg-muted/40"
      >
        <Plus className="size-3.5" /> Maat toevoegen
      </button>
    </div>
  );
}
