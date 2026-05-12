"use client";

import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type {
  PurchaseOrder,
  PurchaseOrderAttachment,
  PurchaseOrderLineItem,
} from "@/lib/db/schema";
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

type ParseResult = {
  attachment: PurchaseOrderAttachment;
  parsed: {
    supplier?: string;
    reference?: string;
    orderDate?: string;
    expectedDate?: string;
    currency?: string;
    items: (PurchaseOrderLineItem & { productId?: string })[];
  } | null;
  note?: string;
  error?: string;
};

export function PurchaseOrderForm({
  order,
  products,
  action,
}: {
  order?: PurchaseOrder;
  products: POProductOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [supplier, setSupplier] = useState(order?.supplier ?? "");
  const [reference, setReference] = useState(order?.reference ?? "");
  const [status, setStatus] = useState(order?.status ?? "ordered");
  const [currency, setCurrency] = useState(order?.currency ?? "EUR");
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(
    order?.items?.length ? order.items.map(toRow) : [toRow({})],
  );
  const [attachments, setAttachments] = useState<PurchaseOrderAttachment[]>(
    order?.attachments ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/inkooporders/parse", { method: "POST", body: fd });
      const data: ParseResult = await res.json();
      if (!res.ok || data.error) {
        setUploadMsg({ kind: "err", text: data.error ?? "Upload mislukt." });
        return;
      }
      setAttachments((a) => [...a, data.attachment]);
      if (data.parsed) {
        const p = data.parsed;
        if (p.supplier && !supplier) setSupplier(p.supplier);
        if (p.reference && !reference) setReference(p.reference);
        if (p.currency) setCurrency(p.currency);
        if (p.orderDate && !orderDate) setOrderDate(p.orderDate);
        if (p.expectedDate && !expectedDate) setExpectedDate(p.expectedDate);
        if (p.items.length) {
          setRows((rs) => {
            const existing = rowsToItems(rs);
            const fresh = p.items.map(toRow);
            // If the form only has the one empty starter row, replace it.
            return existing.length === 0 ? fresh : [...rs, ...fresh];
          });
        }
      }
      setUploadMsg({ kind: "ok", text: data.note ?? "Bestand toegevoegd." });
    } catch {
      setUploadMsg({ kind: "err", text: "Er ging iets mis bij het uploaden." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />

      {/* Upload / auto-read */}
      <div className="rounded-lg border border-dashed bg-surface/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "Bezig met uitlezen…" : "Proforma / PI uploaden"}
          </Button>
          <span className="text-xs text-muted">
            PDF wordt automatisch uitgelezen (leverancier, regels, aantallen). Excel/afbeelding wordt
            alleen als bijlage bewaard.
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
        {uploadMsg && (
          <p className={cn("mt-2 text-xs", uploadMsg.kind === "ok" ? "text-accent" : "text-danger")}>
            {uploadMsg.text}
          </p>
        )}
        {attachments.length > 0 && (
          <ul className="mt-3 space-y-1">
            {attachments.map((a, i) => (
              <li
                key={a.path}
                className="flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="flex-1 truncate">{a.name}</span>
                {a.size != null && (
                  <span className="text-xs text-muted">{Math.round(a.size / 1024)} kB</span>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                  className="text-muted hover:text-danger"
                  aria-label="Bijlage verwijderen"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leverancier" htmlFor="supplier">
          <Input
            id="supplier"
            name="supplier"
            required
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="KingKonree International (H.K) Limited"
          />
        </Field>
        <Field label="Referentie / PI-nummer" htmlFor="reference">
          <Input
            id="reference"
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="33#kkr20251126xm"
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrder["status"])}>
            {Object.entries(PO_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valuta" htmlFor="currency">
          <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => (
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
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </Field>
        <Field label="Verwacht binnen" htmlFor="expectedDate">
          <Input
            id="expectedDate"
            name="expectedDate"
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Regels</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, toRow({})])}>
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
                  <Input value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} placeholder="SKU" />
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
                  className="mt-0.5 flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Levertijd, aanbetaling, opmerkingen…"
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit">{order ? "Opslaan" : "Bestelling aanmaken"}</Button>
      </div>
    </form>
  );
}
