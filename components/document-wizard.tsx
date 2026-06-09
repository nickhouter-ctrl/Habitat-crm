"use client";

import { ArrowLeft, ArrowRight, Check, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import {
  Button,
  buttonClass,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { LineItemsEditor } from "@/components/line-items-editor";
import {
  addressSuggestions,
  deliveryDistanceFromCoords,
  deliveryDistanceKm,
} from "@/app/(app)/documents/actions";
import type { ProductOption } from "@/app/(app)/_options";
import type { DocumentLineItem } from "@/lib/db/schema";
import type { DocKind } from "@/lib/documents";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

const KIND_LABEL: Record<DocKind, string> = {
  estimate: "offerte",
  proforma: "pro-forma",
  invoice: "factuur",
  creditnote: "creditnota",
  salesreceipt: "bon",
  deliverynote: "pakbon",
};

const LANGS: Array<{ value: string; label: string }> = [
  { value: "es", label: "Spaans" },
  { value: "en", label: "Engels" },
  { value: "nl", label: "Nederlands" },
  { value: "de", label: "Duits" },
];

export function DocumentWizard({
  action,
  kind,
  defaultDocNumber,
  contacts,
  properties,
  projects = [],
  products = [],
  defaults,
  initialItems,
}: {
  action: (formData: FormData) => void | Promise<void>;
  kind: DocKind;
  defaultDocNumber: string;
  contacts: Option[];
  /** @deprecated 'deals' is uit het CRM gehaald — niet meer renderen. */
  deals?: Option[];
  properties: Option[];
  projects?: Option[];
  products?: ProductOption[];
  defaults?: { contactId?: string; dealId?: string; propertyId?: string; projectId?: string };
  initialItems?: DocumentLineItem[] | null;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"existing" | "new">(
    defaults?.contactId || contacts.length > 0 ? "existing" : "new",
  );
  const [contactId, setContactId] = useState(defaults?.contactId ?? contacts[0]?.id ?? "");
  const [nc, setNc] = useState({ name: "", email: "", phone: "", language: "es" });

  const kindLabel = KIND_LABEL[kind];
  const Title = kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1);

  const selectedContactName =
    mode === "existing"
      ? contacts.find((c) => c.id === contactId)?.name ?? "—"
      : nc.name.trim() || "(nieuwe klant)";
  const step1Valid = mode === "existing" ? Boolean(contactId) : nc.name.trim().length > 0;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const due = new Date(now);
  due.setDate(due.getDate() + 30);
  const defaultDue = due.toISOString().slice(0, 10);

  const stepDot = (n: 1 | 2, label: string) => (
    <li
      className={cn(
        "flex items-center gap-2",
        step === n ? "font-semibold text-foreground" : "text-muted",
      )}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-xs",
          step === n
            ? "bg-accent text-accent-foreground"
            : "border bg-background text-muted",
        )}
      >
        {n}
      </span>
      {label}
    </li>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="currency" value="EUR" />
      <input type="hidden" name="clientMode" value={mode} />
      {mode === "existing" ? (
        <input type="hidden" name="contactId" value={contactId} />
      ) : (
        <>
          <input type="hidden" name="newClientName" value={nc.name} />
          <input type="hidden" name="newClientEmail" value={nc.email} />
          <input type="hidden" name="newClientPhone" value={nc.phone} />
          <input type="hidden" name="newClientLanguage" value={nc.language} />
        </>
      )}

      <ol className="flex items-center gap-3 text-sm">
        {stepDot(1, "Klant")}
        <span className="h-px w-10 bg-border" />
        {stepDot(2, "Inhoud")}
      </ol>

      {/* ---- Step 1: client ---- */}
      <div className={cn("space-y-4", step !== 1 && "hidden")}>
        <Card className="max-w-2xl">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={buttonClass({ variant: mode === "existing" ? "primary" : "secondary" })}
              >
                <Users className="size-4" /> Bestaande klant
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={buttonClass({ variant: mode === "new" ? "primary" : "secondary" })}
              >
                <UserPlus className="size-4" /> Nieuwe klant
              </button>
            </div>

            {mode === "existing" ? (
              contacts.length === 0 ? (
                <p className="text-sm text-muted">
                  Nog geen contacten — kies &quot;Nieuwe klant&quot;.
                </p>
              ) : (
                <Field label="Kies een contact">
                  <Combobox
                    defaultValue={contactId}
                    placeholder="Typ een naam om te zoeken…"
                    options={contacts.map((c) => ({ value: c.id, label: c.name }))}
                    onSelect={(v) => setContactId(v)}
                  />
                </Field>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Naam *" htmlFor="nc-name">
                  <Input
                    id="nc-name"
                    value={nc.name}
                    onChange={(e) => setNc({ ...nc, name: e.target.value })}
                    placeholder="Familie Janssen / Bedrijf X"
                  />
                </Field>
                <Field label="E-mail" htmlFor="nc-email">
                  <Input
                    id="nc-email"
                    type="email"
                    value={nc.email}
                    onChange={(e) => setNc({ ...nc, email: e.target.value })}
                  />
                </Field>
                <Field label="Telefoon" htmlFor="nc-phone">
                  <Input
                    id="nc-phone"
                    value={nc.phone}
                    onChange={(e) => setNc({ ...nc, phone: e.target.value })}
                  />
                </Field>
                <Field label="Taal" htmlFor="nc-lang">
                  <Select
                    id="nc-lang"
                    value={nc.language}
                    onChange={(e) => setNc({ ...nc, language: e.target.value })}
                  >
                    {LANGS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </CardContent>
        </Card>
        <Button type="button" disabled={!step1Valid} onClick={() => setStep(2)}>
          Volgende <ArrowRight className="size-4" />
        </Button>
      </div>

      {/* ---- Step 2: content ---- */}
      <div className={cn("space-y-5", step !== 2 && "hidden")}>
        <p className="text-sm text-muted">
          Klant: <span className="font-medium text-foreground">{selectedContactName}</span>{" "}
          ·{" "}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-accent hover:underline"
          >
            wijzigen
          </button>
        </p>

        <Card>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={`${Title}nummer`} htmlFor="docNumber">
                <Input id="docNumber" name="docNumber" defaultValue={defaultDocNumber} />
              </Field>
              <Field label="Datum" htmlFor="issueDate">
                <Input id="issueDate" name="issueDate" type="date" defaultValue={today} />
              </Field>
              <Field label="Vervaldatum" htmlFor="dueDate">
                <Input id="dueDate" name="dueDate" type="date" defaultValue={defaultDue} />
              </Field>
            </div>
            <Field label="Onderwerp / titel" htmlFor="title">
              <Input
                id="title"
                name="title"
                placeholder="bv. Renovatie keuken & badkamer"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project (optioneel)">
                <Combobox
                  name="projectId"
                  clearable
                  defaultValue={defaults?.projectId ?? ""}
                  placeholder="— geen — / zoek een project"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
              <Field label="Pand (optioneel)">
                <Combobox
                  name="propertyId"
                  clearable
                  defaultValue={defaults?.propertyId ?? ""}
                  placeholder="— geen — / zoek een pand"
                  options={properties.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <LineItemsEditor
              products={products}
              initialItems={initialItems}
              onDistance={kind === "deliverynote" ? undefined : deliveryDistanceKm}
              onSuggest={kind === "deliverynote" ? undefined : addressSuggestions}
              onDistanceCoords={kind === "deliverynote" ? undefined : deliveryDistanceFromCoords}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <Field label="Notities / voorwaarden" htmlFor="notes">
              <Textarea id="notes" name="notes" />
            </Field>
            {(kind === "invoice" || kind === "estimate") && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="alsoDeliveryNote"
                  value="1"
                  className="size-4 rounded border bg-background"
                />
                <span>
                  Direct ook een <strong>pakbon</strong> klaarzetten met dezelfde regels
                  <span className="text-muted"> — zonder prijzen, klaar om mee te nemen naar de levering</span>
                </span>
              </label>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(1)}>
            <ArrowLeft className="size-4" /> Vorige
          </Button>
          <Button type="submit">
            <Check className="size-4" /> {Title} aanmaken
          </Button>
        </div>
      </div>
    </form>
  );
}
