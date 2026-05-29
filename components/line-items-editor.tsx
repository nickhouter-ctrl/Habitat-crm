"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, Input, Select } from "@/components/ui";
import type { ProductOption } from "@/app/(app)/_options";
import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet, lineUnitPrice } from "@/lib/documents";
import { LINE_CATEGORIES, vatForCategory } from "@/lib/products";
import { cn, formatEUR } from "@/lib/utils";

/** Below this margin a line is flagged amber; below 0 it's flagged red. */
const LOW_MARGIN_PCT = 15;

/** Rond een geldbedrag af op 2 decimalen (centen). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Row = {
  name: string;
  description: string;
  units: string;
  price: string;
  discount: string;
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
    discount: "0",
    taxRate: String(vatForCategory(category)),
    category,
    productId: "",
  };
}

function rowToItem(r: Row): DocumentLineItem {
  return {
    name: r.name.trim(),
    description: r.description.trim() || undefined,
    units: Number(r.units) || 0,
    price: Number(r.price) || 0,
    discount: Number(r.discount) || 0,
    taxRate: Number(r.taxRate) || 0,
    category: r.category || undefined,
    productId: r.productId || undefined,
  };
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
          price: String(round2(Number(it.price) || 0)),
          discount: String(it.discount ?? 0),
          taxRate: String(it.taxRate ?? 21),
          category: it.category ?? "materiaal",
          productId: it.productId ?? "",
        }))
      : [emptyRow()],
  );

  // Klanttype bepaalt welke prijs we trekken uit de productcatalogus.
  // 'particulier' = showroom-prijs (priceEur); 'aannemer' = B2B (tradePriceEur,
  // valt terug op priceEur als die leeg is).
  const [audience, setAudience] = useState<"particulier" | "aannemer">("particulier");

  const totals = computeTotals(rows.map(rowToItem).filter((r) => r.name.length > 0));
  const costById = new Map(products.map((p) => [p.id, p.costEur != null ? Number(p.costEur) : null]));

  const priceFor = (p: { priceEur: string | null; tradePriceEur: string | null }) =>
    audience === "aannemer" && p.tradePriceEur ? p.tradePriceEur : p.priceEur;

  const productOptions: ComboOption[] = products.map((p) => ({
    value: p.id,
    // SKU vooraan zodat je 'm kunt typen om te zoeken
    label: p.sku ? `${p.sku} — ${p.name}` : p.name,
    group: p.category?.trim() || "Overig",
    hint: priceFor(p) ? formatEUR(priceFor(p)!) : undefined,
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
      price: priceFor(p) ? String(round2(Number(priceFor(p)))) : "",
      discount: "0",
      taxRate: String(p.vatRate ?? 21),
      category: "materiaal",
      productId: p.id,
    };
    setRows((rs) =>
      rs.length === 1 && !rs[0].name.trim() && !rs[0].productId ? [row] : [...rs, row],
    );
  };

  const setCategory = (i: number, category: string) => {
    patchRow(i, { category, taxRate: String(vatForCategory(category)) });
  };

  // Margin info for a row that's linked to a product with a known cost.
  // "marge" = winst als % van de verkoopprijs (zoals in de productcatalogus).
  const marginFor = (r: Row) => {
    const cost = r.productId ? costById.get(r.productId) ?? null : null;
    if (cost == null || cost <= 0) return null;
    const unit = lineUnitPrice({ price: Number(r.price) || 0, discount: Number(r.discount) || 0 });
    const listPrice = Number(r.price) || 0;
    const pct = unit > 0 ? ((unit - cost) / unit) * 100 : -100;
    const breakEvenDiscount = listPrice > 0 ? Math.max(0, (1 - cost / listPrice) * 100) : 0;
    return { cost, pct, breakEvenDiscount };
  };

  const anyLoss = rows.some((r) => {
    const m = marginFor(r);
    return m != null && m.pct < 0;
  });

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
            price: round2(Number(r.price) || 0),
            discount: Number(r.discount) || 0,
            taxRate: Number(r.taxRate),
            category: r.category,
            productId: r.productId,
          })),
        )}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Regels</h3>
          <div className="flex items-center overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setAudience("particulier")}
              className={cn(
                "px-3 py-1.5",
                audience === "particulier" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft",
              )}
              title="Showroom-prijzen voor particulieren"
            >
              👤 Particulier
            </button>
            <button
              type="button"
              onClick={() => setAudience("aannemer")}
              className={cn(
                "border-l border-border px-3 py-1.5",
                audience === "aannemer" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft",
              )}
              title="Aannemers-/architectenprijs (~20% lager)"
            >
              🔨 Aannemer
            </button>
          </div>
        </div>
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
        <table className="w-full min-w-[920px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-1 py-1.5">Omschrijving</th>
              <th className="w-36 px-1 py-1.5">Categorie</th>
              <th className="w-16 px-1 py-1.5 text-right">Aantal</th>
              <th className="w-24 px-1 py-1.5 text-right">Prijs (ex.)</th>
              <th className="w-20 px-1 py-1.5 text-right">Korting%</th>
              <th className="w-20 px-1 py-1.5 text-right">BTW%</th>
              <th className="w-28 px-1 py-1.5 text-right">Netto</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => {
              const m = marginFor(r);
              const loss = m != null && m.pct < 0;
              const low = m != null && m.pct >= 0 && m.pct < LOW_MARGIN_PCT;
              const hasDiscount = (Number(r.discount) || 0) > 0;
              return (
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
                    {m != null && (
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-xs",
                          loss ? "font-medium text-danger" : low ? "text-warning" : "text-muted",
                        )}
                      >
                        {(loss || low) && <AlertTriangle className="size-3 shrink-0" />}
                        Kostprijs {formatEUR(m.cost)} · marge {m.pct.toFixed(0)}%
                        {loss && " — verlies!"}
                        {(loss || low) &&
                          ` · max. korting zonder verlies: ${m.breakEvenDiscount.toFixed(0)}%`}
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-2">
                    <Select value={r.category} onChange={(e) => setCategory(i, e.target.value)}>
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
                      step="any"
                      min="0"
                      value={r.price}
                      onChange={(e) => patchRow(i, { price: e.target.value })}
                      onBlur={(e) =>
                        patchRow(i, {
                          price:
                            e.target.value === ""
                              ? ""
                              : String(round2(Number(e.target.value) || 0)),
                        })
                      }
                      className="text-right"
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={r.discount}
                      onChange={(e) => patchRow(i, { discount: e.target.value })}
                      className={cn("text-right", (loss || low) && "border-warning")}
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
                    {formatEUR(lineNet(rowToItem(r)))}
                    {hasDiscount && (
                      <span className="block text-xs text-muted line-through">
                        {formatEUR((Number(r.units) || 0) * (Number(r.price) || 0))}
                      </span>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {anyLoss && (
        <p className="flex items-center gap-1.5 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          <AlertTriangle className="size-4" /> Eén of meer regels staan onder de kostprijs — controleer de korting.
        </p>
      )}

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
