import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { kiesTaal, klantContacten, klantEmail } from "@/lib/klant-portal";

import { klantT } from "../_t";
import { bewaarGegevens } from "../actions";

export default async function KlantGegevensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const taal = kiesTaal(typeof params.lang === "string" ? params.lang : "nl");
  const t = klantT(taal);

  const email = await klantEmail();
  if (!email) redirect(`/klant?lang=${taal}`);
  const [contact] = await klantContacten(email);
  if (!contact) redirect(`/klant/projecten?lang=${taal}`);

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/klant/projecten?lang=${taal}`} className="text-xs text-muted hover:underline">
        ← {t.mijnProjecten}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.mijnGegevens}</h1>
      <p className="mb-5 text-sm text-muted">{t.gegevensUitleg}</p>

      {params.saved === "1" && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          ✓ {t.opgeslagen}
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <form action={bewaarGegevens} className="space-y-4">
            <input type="hidden" name="lang" value={taal} />
            <Field label={t.naam} htmlFor="kg-name">
              <Input id="kg-name" name="name" defaultValue={contact.name ?? ""} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.telefoon} htmlFor="kg-phone">
                <Input id="kg-phone" name="phone" defaultValue={contact.phone ?? ""} />
              </Field>
              <Field label={t.mobiel} htmlFor="kg-mobile">
                <Input id="kg-mobile" name="mobile" defaultValue={contact.mobile ?? ""} />
              </Field>
            </div>
            <Field label={t.nifNie} htmlFor="kg-taxid">
              <Input id="kg-taxid" name="taxId" defaultValue={contact.taxId ?? ""} />
            </Field>
            <Field label={t.adres} htmlFor="kg-address">
              <Input id="kg-address" name="addressLine" defaultValue={contact.addressLine ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.postcode} htmlFor="kg-postal">
                <Input id="kg-postal" name="postalCode" defaultValue={contact.postalCode ?? ""} />
              </Field>
              <Field label={t.plaats} htmlFor="kg-city">
                <Input id="kg-city" name="city" defaultValue={contact.city ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.provincie} htmlFor="kg-province">
                <Input id="kg-province" name="province" defaultValue={contact.province ?? ""} />
              </Field>
              <Field label={t.land} htmlFor="kg-country">
                <Input id="kg-country" name="country" defaultValue={contact.country ?? "ES"} />
              </Field>
            </div>
            <Field label={t.taalVoorkeur} htmlFor="kg-lang">
              <Select id="kg-lang" name="preferredLanguage" defaultValue={contact.preferredLanguage ?? taal}>
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel="…">{t.opslaan}</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
