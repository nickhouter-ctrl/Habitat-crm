"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";

import { buttonClass, Input } from "@/components/ui";
import { supplierForSku } from "@/lib/suppliers";
import { addToOrder, searchOrderable } from "./actions";

type Prod = {
  id: string;
  name: string;
  sku: string | null;
  collection: string | null;
  imageUrl: string | null;
  additionalSizes: Array<{ sku: string; label: string; stockQty?: number | null }> | null;
};
type Var = {
  id: string;
  sku: string;
  legacySku: string | null;
  color: string;
  productName: string | null;
  collectionName: string | null;
};

export function OrderSearch({ suppliers }: { suppliers: string[] }) {
  const uiT = useUiTranslation();
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<{ products: Prod[]; variants: Var[] }>({
    products: [],
    variants: [],
  });
  const [pending, start] = useTransition();

  function run(q: string) {
    setTerm(q);
    if (q.trim().length < 2) {
      setRes({ products: [], variants: [] });
      return;
    }
    start(async () => setRes(await searchOrderable(q)));
  }

  const empty = res.products.length === 0 && res.variants.length === 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={term}
          onChange={(e) => run(e.target.value)}
          placeholder={uiT("Zoek product of catalogus-SKU om toe te voegen…")}
          className="pl-9"
        />
      </div>

      {pending && <p className="text-xs text-muted">{uiT("Zoeken…")}</p>}

      {!empty && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {res.variants.map((v) => (
            <AddRow
              key={`v-${v.id}`}
              kind="catalog"
              refId={v.id}
              title={`${v.productName} — ${v.color}`}
              subtitle={`${v.collectionName ?? ""} · ${v.legacySku ?? v.sku}`}
              tag="Catalogus"
              defaultSupplier="Magic Stone"
              suppliers={suppliers}
            />
          ))}
          {res.products.map((p) => (
            <AddRow
              key={`p-${p.id}`}
              kind="product"
              refId={p.id}
              title={p.name}
              subtitle={[p.collection, p.sku].filter(Boolean).join(" · ")}
              tag="Product"
              defaultSupplier={supplierForSku(p.sku)}
              imageUrl={p.imageUrl}
              sizes={p.additionalSizes ?? []}
              suppliers={suppliers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddRow({
  kind,
  refId,
  title,
  subtitle,
  tag,
  defaultSupplier,
  imageUrl,
  sizes = [],
  suppliers,
}: {
  kind: "catalog" | "product";
  refId: string;
  title: string;
  subtitle: string;
  tag: string;
  defaultSupplier: string;
  imageUrl?: string | null;
  sizes?: Array<{ sku: string; label: string; stockQty?: number | null }>;
  suppliers: string[];
}) {
  const uiT = useUiTranslation();
  return (
    <form action={addToOrder} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="refId" value={refId} />
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted">
          <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">{tag}</span>
          {subtitle}
        </p>
      </div>
      <input
        name="supplierName"
        defaultValue={defaultSupplier}
        list="supplier-list"
        placeholder={uiT("Leverancier")}
        className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm"
      />
      <datalist id="supplier-list">
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {sizes.length > 0 && (
        <select
          name="size"
          title={uiT("Maat")}
          className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{uiT("Standaardmaat")}</option>
          {sizes.map((sz) => (
            <option key={sz.sku || sz.label} value={sz.label}>
              {sz.label}
              {(sz.stockQty ?? 0) > 0 ? uiT(" — {v0} op vrd", { v0: sz.stockQty ?? 0 }) : ""}
            </option>
          ))}
        </select>
      )}
      <input
        name="qty"
        type="number"
        min={1}
        step="any"
        defaultValue={1}
        className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
      />
      <select
        name="unit"
        defaultValue="stuk"
        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="stuk">{uiT("stuk")}</option>
        <option value="doos">{uiT("doos")}</option>
        <option value="m2">{uiT("m²")}</option>
      </select>
      <button type="submit" className={buttonClass({ size: "sm" })}>
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}
