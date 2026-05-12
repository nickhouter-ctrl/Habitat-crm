import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { Deal } from "@/lib/db/schema";
import { dealStageMeta, dealTypeMeta } from "@/app/(app)/_meta";

type Option = { id: string; name: string };

export function DealForm({
  action,
  deal,
  contacts,
  properties,
  users,
  defaults,
  submitLabel = "Opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  deal?: Pick<
    Deal,
    | "title"
    | "type"
    | "stage"
    | "valueEur"
    | "probability"
    | "contactId"
    | "propertyId"
    | "ownerId"
    | "expectedCloseDate"
    | "description"
  >;
  contacts: Option[];
  properties: Option[];
  users: Option[];
  defaults?: { contactId?: string; propertyId?: string };
  submitLabel?: string;
}) {
  const contactId = deal?.contactId ?? defaults?.contactId ?? "";
  const propertyId = deal?.propertyId ?? defaults?.propertyId ?? "";

  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form action={action} className="space-y-5">
          <Field label="Titel" htmlFor="title">
            <Input
              id="title"
              name="title"
              defaultValue={deal?.title ?? ""}
              required
              placeholder="bv. Renovatie villa Montgó"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue={deal?.type ?? "renovation"}>
                {(Object.keys(dealTypeMeta) as Array<keyof typeof dealTypeMeta>).map(
                  (k) => (
                    <option key={k} value={k}>
                      {dealTypeMeta[k]}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="Fase" htmlFor="stage">
              <Select id="stage" name="stage" defaultValue={deal?.stage ?? "lead"}>
                {(
                  Object.keys(dealStageMeta) as Array<keyof typeof dealStageMeta>
                ).map((k) => (
                  <option key={k} value={k}>
                    {dealStageMeta[k].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Waarde (€)" htmlFor="valueEur">
              <Input
                id="valueEur"
                name="valueEur"
                type="number"
                step="0.01"
                min="0"
                defaultValue={deal?.valueEur ?? ""}
              />
            </Field>
            <Field label="Kans (%)" htmlFor="probability" hint="Leeg = afgeleid van fase">
              <Input
                id="probability"
                name="probability"
                type="number"
                min="0"
                max="100"
                defaultValue={deal?.probability ?? ""}
              />
            </Field>
            <Field label="Verwachte sluitdatum" htmlFor="expectedCloseDate">
              <Input
                id="expectedCloseDate"
                name="expectedCloseDate"
                type="date"
                defaultValue={deal?.expectedCloseDate ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contact" htmlFor="contactId">
              <Select id="contactId" name="contactId" defaultValue={contactId}>
                <option value="">— geen —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pand" htmlFor="propertyId">
              <Select id="propertyId" name="propertyId" defaultValue={propertyId}>
                <option value="">— geen —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Eigenaar" htmlFor="ownerId">
              <Select id="ownerId" name="ownerId" defaultValue={deal?.ownerId ?? ""}>
                <option value="">— ik —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Omschrijving" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={deal?.description ?? ""} />
          </Field>

          <div className="pt-1">
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
