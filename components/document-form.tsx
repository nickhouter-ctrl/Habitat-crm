"use client";

import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { LineItemsEditor } from "@/components/line-items-editor";
import { deliveryDistanceKm } from "@/app/(app)/documents/actions";
import type { ProductOption } from "@/app/(app)/_options";
import type { DocumentLineItem } from "@/lib/db/schema";
import type { DocKind } from "@/lib/documents";

type Option = { id: string; name: string };

const KIND_LABEL: Record<DocKind, string> = {
  estimate: "Offerte",
  proforma: "Pro-forma",
  invoice: "Factuur",
  creditnote: "Creditnota",
  salesreceipt: "Bon",
  deliverynote: "Pakbon",
};

export const DOC_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Concept" },
  { value: "sent", label: "Verstuurd" },
  { value: "accepted", label: "Geaccepteerd" },
  { value: "rejected", label: "Afgewezen" },
  { value: "partially_paid", label: "Deels betaald" },
  { value: "paid", label: "Betaald" },
  { value: "overdue", label: "Achterstallig" },
  { value: "void", label: "Geannuleerd" },
];

export function DocumentForm({
  action,
  kind,
  doc,
  defaultDocNumber,
  contacts,
  deals,
  properties,
  projects = [],
  products = [],
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
    projectId: string | null;
    issueDate: string | null;
    dueDate: string | null;
    notes: string | null;
    items: DocumentLineItem[] | null;
  };
  defaultDocNumber?: string;
  contacts: Option[];
  deals: Option[];
  properties: Option[];
  projects?: Option[];
  products?: ProductOption[];
  defaults?: { contactId?: string; dealId?: string; propertyId?: string; projectId?: string };
  submitLabel?: string;
}) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const due = new Date(now);
  due.setDate(due.getDate() + 30);
  const defaultDueDate = due.toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value="EUR" />

      <Card>
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
                {DOC_STATUS_OPTIONS.map((o) => (
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
                defaultValue={doc?.dueDate ?? defaultDueDate}
              />
            </Field>
          </div>

          <Field label="Onderwerp / titel" htmlFor="title">
            <Input
              id="title"
              name="title"
              defaultValue={doc?.title ?? ""}
              placeholder={
                kind === "invoice"
                  ? "bv. Renovatie keuken — eindfactuur"
                  : "bv. Renovatie keuken & badkamer"
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Klant (contact)">
              <Combobox
                name="contactId"
                clearable
                defaultValue={doc?.contactId ?? defaults?.contactId ?? ""}
                placeholder="— geen — / zoek een contact"
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label="Deal">
              <Combobox
                name="dealId"
                clearable
                defaultValue={doc?.dealId ?? defaults?.dealId ?? ""}
                placeholder="— geen — / zoek een deal"
                options={deals.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
            <Field label="Pand">
              <Combobox
                name="propertyId"
                clearable
                defaultValue={doc?.propertyId ?? defaults?.propertyId ?? ""}
                placeholder="— geen — / zoek een pand"
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="Project">
              <Combobox
                name="projectId"
                clearable
                defaultValue={doc?.projectId ?? defaults?.projectId ?? ""}
                placeholder="— geen — / zoek een project"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <LineItemsEditor
            initialItems={doc?.items}
            products={products}
            onDistance={kind === "deliverynote" ? undefined : deliveryDistanceKm}
          />
        </CardContent>
      </Card>

      <Card>
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
