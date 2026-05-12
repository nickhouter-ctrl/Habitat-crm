"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet, type DocKind } from "@/lib/documents";
import { cn, formatEUR } from "@/lib/utils";

type Option = { id: string; name: string };
type Row = {
  name: string;
  description: string;
  units: string;
  price: string;
  taxRate: string;
};

const KIND_LABEL: Record<DocKind, string> = {
  estimate: "Offerte",
  proforma: "Pro-forma",
  invoice: "Factuur",
  creditnote: "Creditnota",
  salesreceipt: "Bon",
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Concept" },
  { value: "sent", label: "Verstuurd" },
  { value: "accepted", label: "Geaccepteerd" },
  { value: "rejected", label: "Afgewezen" },
  { value: "partially_paid", label: "Deels betaald" },
  { value: "paid", label: "Betaald" },
  { value: "overdue", label: "Achterstallig" },
  { value: "void", label: "Geannuleerd" },
];

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

export function DocumentForm({
  action,
  kind,
  doc,
  defaultDocNumber,
  contacts,
  deals,
  properties,
  defaults,
  submitLabel = "Opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  kind: DocKind;
  doc?: {
    docNumber: string | null;
    status: string;
    title: string | null;
    contactId: string | null;
    dealId: string | null;
    propertyId: string | null;
    issueDate: string | null;
    dueDate: string | null;
    notes: string | null;
    items: DocumentLineItem[] | null;
  };
  defaultDocNumber?: string;
  contacts: Option[];
  deals: Option[];
  properties: Option[];
  defaults?: { contactId?: string; dealId?: string; propertyId?: string };
  submitLabel?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    doc?.items && doc.items.length > 0
      ? doc.items.map((it) => ({
          name: it.name,
          description: it.description ?? "",
          units: String(it.units),
          price: String(it.price),
          taxRate: String(it.taxRate ?? 21),
        }))
      : [emptyRow()],
  );

  const items = rowsToItems(rows);
  const totals = computeTotals(items);

  const today = new Date().toISOString().slice(0, 10);

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value="EUR" />
      <input
        type="hidden"
        name="items"
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

      <Card className="max-w-3xl">
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={`${KIND_LABEL[kind]}nummer`} htmlFor="docNumber">
              <Input
                id="docNumber"
                name="docNumber"
                defaultValue={doc?.docNumber ?? defaultDocNumber ?? ""}
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={doc?.status ?? "draft"}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Datum" htmlFor="issueDate">
              <Input
                id="issueDate"
                name="issueDate"
                type="date"
                defaultValue={doc?.issueDate ?? today}
              />
            </Field>
            <Field label="Vervaldatum" htmlFor="dueDate">
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={doc?.dueDate ?? ""}
              />
            </Field>
          </div>

          <Field label="Onderwerp / titel" htmlFor="title">
            <Input
              id="title"
              name="title"
              defaultValue={doc?.title ?? ""}
              placeholder={kind === "invoice" ? "bv. Renovatie keuken — eindfactuur" : "bv. Renovatie keuken & badkamer"}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Klant (contact)" htmlFor="contactId">
              <Select
                id="contactId"
                name="contactId"
                defaultValue={doc?.contactId ?? defaults?.contactId ?? ""}
              >
                <option value="">— geen —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deal" htmlFor="dealId">
              <Select
                id="dealId"
                name="dealId"
                defaultValue={doc?.dealId ?? defaults?.dealId ?? ""}
              >
                <option value="">— geen —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pand" htmlFor="propertyId">
              <Select
                id="propertyId"
                name="propertyId"
                defaultValue={doc?.propertyId ?? defaults?.propertyId ?? ""}
              >
                <option value="">— geen —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card className="max-w-3xl">
        <CardContent className="space-y-3">
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
                      {formatEUR(lineNet({ units: Number(r.units) || 0, price: Number(r.price) || 0 }))}
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
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardContent>
          <Field label="Notities / voorwaarden" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={doc?.notes ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
