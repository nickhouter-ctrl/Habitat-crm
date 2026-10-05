
import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";
import { tekst as uiTranslation } from '@/lib/i18n/server';
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
import type { Property } from "@/lib/db/schema";
import { propertyStatusMeta, propertyTypeMeta } from "@/app/(app)/_meta";

type Option = { id: string; name: string };

export async function PropertyForm({
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
  const uiT = await uiTranslation();
  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form action={action} className="space-y-5">
          <TabsRoot defaultTab="data" ids={["data","features","site"]} param="form"><TabsBar tabs={[{id:"data",label:uiT("Gegevens")},{id:"features",label:uiT("Kenmerken")},{id:"site",label:uiT("Website")}]}/><TabPanel id="data"><div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label={uiT("Titel")} htmlFor="title">
              <Input
                id="title"
                name="title"
                defaultValue={property?.title ?? ""}
                required
                placeholder={uiT("bv. Villa Montgó — Xàbia")}
              />
            </Field>
            <Field label={uiT("Referentie")} htmlFor="reference">
              <Input
                id="reference"
                name="reference"
                defaultValue={property?.reference ?? ""}
                placeholder={uiT("HAB-001")}
                className="w-32"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={uiT("Type")} htmlFor="type">
              <Select id="type" name="type" defaultValue={property?.type ?? "villa"}>
                {(
                  Object.keys(propertyTypeMeta) as Array<keyof typeof propertyTypeMeta>
                ).map((k) => (
                  <option key={k} value={k}>
                    {uiT(propertyTypeMeta[k])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={uiT("Status")} htmlFor="status">
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
                    {uiT(propertyStatusMeta[k].label)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={uiT("Vraagprijs (€)")} htmlFor="priceEur">
              <Input
                id="priceEur"
                name="priceEur"
                type="number"
                step="1"
                min="0"
                defaultValue={property?.priceEur ?? ""}
              />
            </Field>
            <Field label={uiT("Locatie")} htmlFor="location">
              <Input
                id="location"
                name="location"
                defaultValue={property?.location ?? ""}
                placeholder={uiT("Xàbia — Montgó")}
              />
            </Field>
          </div></TabPanel>

          <TabPanel id="features"><div className="grid gap-4 sm:grid-cols-4">
            <Field label={uiT("Slaapkamers")} htmlFor="bedrooms">
              <Input id="bedrooms" name="bedrooms" type="number" min="0" defaultValue={property?.bedrooms ?? ""} />
            </Field>
            <Field label={uiT("Badkamers")} htmlFor="bathrooms">
              <Input id="bathrooms" name="bathrooms" type="number" min="0" defaultValue={property?.bathrooms ?? ""} />
            </Field>
            <Field label={uiT("Bebouwd (m²)")} htmlFor="builtSqm">
              <Input id="builtSqm" name="builtSqm" type="number" min="0" defaultValue={property?.builtSqm ?? ""} />
            </Field>
            <Field label={uiT("Perceel (m²)")} htmlFor="plotSqm">
              <Input id="plotSqm" name="plotSqm" type="number" min="0" defaultValue={property?.plotSqm ?? ""} />
            </Field>
          </div></TabPanel>

          <TabPanel id="data"><div className="grid gap-4 sm:grid-cols-2">
            <Field label={uiT("Eigenaar (contact)")} hint={uiT("typ een naam")}>
              {/* Zoekveld, geen uitklaplijst: er staan honderden contacten in. */}
              <Combobox
                name="ownerContactId"
                defaultValue={property?.ownerContactId ?? ""}
                clearable
                placeholder={uiT("Zoek een contact…")}
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label={uiT("Verantwoordelijke")} htmlFor="ownerId">
              <Select id="ownerId" name="ownerId" defaultValue={property?.ownerId ?? ""}>
                <option value="">{uiT("— ik —")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div></TabPanel>

          <TabPanel id="site"><Field label={uiT("Omschrijving")} htmlFor="description">
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
            {uiT("Gepubliceerd (zichtbaar op de website)")} </label></TabPanel></TabsRoot>

          <div className="pt-1">
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
