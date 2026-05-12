import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { Property } from "@/lib/db/schema";
import { propertyStatusMeta, propertyTypeMeta } from "@/app/(app)/_meta";

type Option = { id: string; name: string };

export function PropertyForm({
  action,
  property,
  contacts,
  users,
  submitLabel = "Opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  property?: Pick<
    Property,
    | "title"
    | "reference"
    | "status"
    | "type"
    | "priceEur"
    | "bedrooms"
    | "bathrooms"
    | "plotSqm"
    | "builtSqm"
    | "location"
    | "description"
    | "ownerContactId"
    | "ownerId"
    | "isPublished"
  >;
  contacts: Option[];
  users: Option[];
  submitLabel?: string;
}) {
  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form action={action} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Titel" htmlFor="title">
              <Input
                id="title"
                name="title"
                defaultValue={property?.title ?? ""}
                required
                placeholder="bv. Villa Montgó — Xàbia"
              />
            </Field>
            <Field label="Referentie" htmlFor="reference">
              <Input
                id="reference"
                name="reference"
                defaultValue={property?.reference ?? ""}
                placeholder="HAB-001"
                className="w-32"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue={property?.type ?? "villa"}>
                {(
                  Object.keys(propertyTypeMeta) as Array<keyof typeof propertyTypeMeta>
                ).map((k) => (
                  <option key={k} value={k}>
                    {propertyTypeMeta[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                name="status"
                defaultValue={property?.status ?? "available"}
              >
                {(
                  Object.keys(propertyStatusMeta) as Array<
                    keyof typeof propertyStatusMeta
                  >
                ).map((k) => (
                  <option key={k} value={k}>
                    {propertyStatusMeta[k].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vraagprijs (€)" htmlFor="priceEur">
              <Input
                id="priceEur"
                name="priceEur"
                type="number"
                step="1"
                min="0"
                defaultValue={property?.priceEur ?? ""}
              />
            </Field>
            <Field label="Locatie" htmlFor="location">
              <Input
                id="location"
                name="location"
                defaultValue={property?.location ?? ""}
                placeholder="Xàbia — Montgó"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Slaapkamers" htmlFor="bedrooms">
              <Input id="bedrooms" name="bedrooms" type="number" min="0" defaultValue={property?.bedrooms ?? ""} />
            </Field>
            <Field label="Badkamers" htmlFor="bathrooms">
              <Input id="bathrooms" name="bathrooms" type="number" min="0" defaultValue={property?.bathrooms ?? ""} />
            </Field>
            <Field label="Bebouwd (m²)" htmlFor="builtSqm">
              <Input id="builtSqm" name="builtSqm" type="number" min="0" defaultValue={property?.builtSqm ?? ""} />
            </Field>
            <Field label="Perceel (m²)" htmlFor="plotSqm">
              <Input id="plotSqm" name="plotSqm" type="number" min="0" defaultValue={property?.plotSqm ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Eigenaar (contact)" htmlFor="ownerContactId">
              <Select
                id="ownerContactId"
                name="ownerContactId"
                defaultValue={property?.ownerContactId ?? ""}
              >
                <option value="">— geen —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Verantwoordelijke" htmlFor="ownerId">
              <Select id="ownerId" name="ownerId" defaultValue={property?.ownerId ?? ""}>
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
            <Textarea
              id="description"
              name="description"
              defaultValue={property?.description ?? ""}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={property?.isPublished ?? false}
              className="size-4 rounded border-border"
            />
            Gepubliceerd (zichtbaar op de website)
          </label>

          <div className="pt-1">
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
